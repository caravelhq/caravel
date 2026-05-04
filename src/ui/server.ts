import { htmlPage } from "./page/html";
import { clampInt, json } from "./http";
import type { StartWebUiOptions, WebServerHandle } from "./types";
import { buildState, buildTechnicalInfo, sanitizeSettings } from "./services/state";
import { readHeartbeatSettings, updateHeartbeatSettings } from "./services/settings";
import { createQuickJob, deleteJob } from "./services/jobs";
import { readLogs } from "./services/logs";
import {
  listChats,
  loadChat,
  saveChat,
  deleteChat,
  getChatMeta,
  renameChat,
  appendMessage,
  patchLastMessage,
  recoverStuckChats,
  type ChatMessageState,
} from "./services/chats";
import { listDirectory, readFileContent, isMarkdown, listBranchesForPath } from "./services/files";
import { peekThreadSession, listThreadSessions } from "../sessionManager";
import { listAgents } from "../agents";
import { getMultiAgentSummary, listTasks, getTaskChain } from "./services/multiAgent";
import { createTask } from "./services/multiAgentDispatch";

type OnChatFn = NonNullable<StartWebUiOptions["onChat"]>;

// Bundled `marked` JS, lazily built on first request and cached for the
// lifetime of the process. Keeps the rendered markdown in one CommonMark-
// compliant library instead of hand-rolled regex passes in client.js.
let markedBundle: string | null = null;
async function getMarkedBundle(): Promise<string | null> {
  if (markedBundle !== null) return markedBundle;
  return (markedBundle = await buildBundle("./page/marked-entry.ts", "marked"));
}

let yamlBundle: string | null = null;
async function getYamlBundle(): Promise<string | null> {
  if (yamlBundle !== null) return yamlBundle;
  return (yamlBundle = await buildBundle("./page/yaml-entry.ts", "yaml"));
}

async function buildBundle(entryRel: string, label: string): Promise<string> {
  const entry = new URL(entryRel, import.meta.url).pathname;
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: true,
    format: "iife",
  });
  if (!result.success || result.outputs.length === 0) {
    console.error(`[ui] ${label} bundle build failed`, result.logs);
    return "";
  }
  return await result.outputs[0]!.text();
}

// One processor per chatId — prevents concurrent assistant writes to the same
// chat file when a second /api/chat POST arrives mid-stream. The processor
// loops through all "pending" user messages in order; onChat itself is already
// globally serialised by the runner queue.
const chatProcessors = new Set<string>();

// Active abort controller per chatId — lets /api/chat/interrupt kill the
// in-flight onChat call. Populated while a single onChat is running and
// cleared after it returns or aborts.
const chatAborts = new Map<string, AbortController>();

// Module-level reference to the daemon's onChat callback, set when startWebUi
// is called. Lets non-HTTP callers (e.g. the multi-agent runner) inject a
// pending user message and kick the processor so an automated chat-resume
// works the same way as a real /api/chat POST.
let registeredOnChat: OnChatFn | null = null;

// Public hook for the multi-agent runner: given a chatId that already has a
// pending user message, ensure a processor is running. No-op if the web server
// hasn't registered an onChat yet (e.g. web disabled, or daemon still booting).
export function triggerChatProcessor(chatId: string): void {
  if (!registeredOnChat) return;
  ensureChatProcessor(chatId, registeredOnChat).catch((err) =>
    console.error(`[chat] processor trigger failed for ${chatId}:`, err)
  );
}

const PERSIST_THROTTLE_MS = 300;

async function ensureChatProcessor(chatId: string, onChat: OnChatFn): Promise<void> {
  if (chatProcessors.has(chatId)) return;
  chatProcessors.add(chatId);
  try {
    while (true) {
      const chat = await loadChat(chatId);
      if (!chat) break;
      const agentId = chat.agentId;
      const firstPendingIdx = chat.messages.findIndex(
        (m) => m.role === "user" && m.state === "pending"
      );
      if (firstPendingIdx === -1) break;

      // Batch consecutive pending user messages into one onChat call so a
      // user who fires 3 messages rapid-fire gets one coherent response that
      // addresses the lot, instead of three separate replies.
      const pendingIndices: number[] = [];
      for (let i = firstPendingIdx; i < chat.messages.length; i++) {
        const m = chat.messages[i];
        if (m.role === "user" && m.state === "pending") {
          pendingIndices.push(i);
        } else {
          break;
        }
      }

      const now = Date.now();
      for (const idx of pendingIndices) {
        chat.messages[idx] = {
          ...chat.messages[idx],
          state: "sent",
          updatedAt: now,
        };
      }
      chat.messages.push({
        role: "assistant",
        text: "",
        state: "thinking",
        startedAt: now,
        updatedAt: now,
      });
      await saveChat(chatId, chat.messages);

      const userText = pendingIndices
        .map((i) => chat.messages[i].text)
        .join("\n\n");
      let responseText = "";
      let currentState: ChatMessageState = "thinking";

      // Serialise writes so chunk-level updates can never land after the final
      // "done" state. Each persist() enqueues the latest snapshot; the chain
      // flushes one at a time, in order. Finalize always waits for the whole
      // chain so it observes the committed state.
      let persistChain: Promise<void> = Promise.resolve();
      let pendingSnapshot: { text: string; state: ChatMessageState } | null = null;
      let persistTimer: ReturnType<typeof setTimeout> | null = null;

      const flushPersist = (): Promise<void> => {
        if (!pendingSnapshot) return persistChain;
        const snap = pendingSnapshot;
        pendingSnapshot = null;
        persistChain = persistChain.then(() =>
          patchLastMessage(
            chatId,
            (m) => m.role === "assistant",
            { text: snap.text, state: snap.state }
          ).then(() => undefined)
        ).catch(() => {});
        return persistChain;
      };

      const persist = (finalize: boolean): Promise<void> => {
        pendingSnapshot = { text: responseText, state: currentState };
        if (finalize) {
          if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
          return flushPersist();
        }
        if (!persistTimer) {
          persistTimer = setTimeout(() => {
            persistTimer = null;
            flushPersist().catch(() => {});
          }, PERSIST_THROTTLE_MS);
        }
        return persistChain;
      };

      const controller = new AbortController();
      chatAborts.set(chatId, controller);
      try {
        await onChat(
          chatId,
          userText,
          // onChunk
          (chunk) => {
            // Each chunk is a separate assistant text block from Claude. Insert
            // a blank line between blocks so markdown paragraphs/lists render
            // correctly — otherwise consecutive blocks glue together into one
            // unformatted blob.
            if (responseText && !responseText.endsWith("\n\n") && !chunk.startsWith("\n")) {
              responseText += responseText.endsWith("\n") ? "\n" : "\n\n";
            }
            responseText += chunk;
            if (currentState === "thinking") currentState = "streaming";
            persist(false).catch(() => {});
          },
          () => {
            if (currentState === "thinking" || currentState === "streaming") {
              currentState = "background";
            }
            persist(false).catch(() => {});
          },
          controller.signal,
          agentId
        );
        if (controller.signal.aborted) {
          responseText = responseText
            ? responseText + "\n\n[Interrupted]"
            : "[Interrupted]";
          currentState = "done";
        } else {
          currentState = "done";
        }
        await persist(true);
      } catch (err) {
        if (controller.signal.aborted) {
          responseText = responseText
            ? responseText + "\n\n[Interrupted]"
            : "[Interrupted]";
          currentState = "done";
        } else {
          responseText = responseText
            ? responseText + "\n\n[Error: " + String(err) + "]"
            : "[Error: " + String(err) + "]";
          currentState = "error";
        }
        await persist(true);
      } finally {
        chatAborts.delete(chatId);
      }
    }
  } finally {
    chatProcessors.delete(chatId);
  }
}

export function startWebUi(opts: StartWebUiOptions): WebServerHandle {
  if (opts.onChat) registeredOnChat = opts.onChat;
  // Recover any chat messages left in a non-terminal state by a previous
  // daemon instance that was killed mid-run. Non-blocking — the sweep reads
  // the chats dir, so we let it run in parallel with server startup.
  // Then scan for any chats with pending user messages and kick a processor,
  // so messages queued during a restart actually get picked up rather than
  // sitting forever in the "pending" state.
  recoverStuckChats()
    .then(async (n) => {
      if (n > 0) console.log(`[chat] recovered ${n} stuck message${n === 1 ? "" : "s"}`);
      if (!opts.onChat) return;
      const chats = await listChats();
      let resumed = 0;
      for (const c of chats) {
        const full = await loadChat(c.id);
        if (!full) continue;
        const hasPending = full.messages.some(
          (m) => m.role === "user" && m.state === "pending"
        );
        if (hasPending) {
          resumed += 1;
          ensureChatProcessor(c.id, opts.onChat).catch((err) =>
            console.error(`[chat] resume processor failed for ${c.id}:`, err)
          );
        }
      }
      if (resumed > 0) console.log(`[chat] resumed ${resumed} chat${resumed === 1 ? "" : "s"} with pending messages`);
    })
    .catch((err) => console.error("[chat] recovery sweep failed:", err));

  const server = Bun.serve({
    hostname: opts.host,
    port: opts.port,
    idleTimeout: 0,
    fetch: async (req) => {
      const url = new URL(req.url);

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(htmlPage(), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (url.pathname === "/manifest.json") {
        return json({
          name: "ClaudeClaw",
          short_name: "Claw",
          description: "ClaudeClaw Dashboard",
          start_url: "/",
          display: "standalone",
          background_color: "#0d1117",
          theme_color: "#0d1117",
          icons: [
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
          ]
        });
      }

      if (url.pathname === "/client.js") {
        const file = Bun.file(new URL("./page/client.js", import.meta.url));
        return new Response(file, {
          headers: { "Content-Type": "application/javascript; charset=utf-8" },
        });
      }

      if (url.pathname === "/marked.js") {
        const bundled = await getMarkedBundle();
        if (bundled) {
          return new Response(bundled, {
            headers: { "Content-Type": "application/javascript; charset=utf-8" },
          });
        }
        return new Response("// marked bundle unavailable", {
          status: 500,
          headers: { "Content-Type": "application/javascript; charset=utf-8" },
        });
      }

      if (url.pathname === "/yaml.js") {
        const bundled = await getYamlBundle();
        if (bundled) {
          return new Response(bundled, {
            headers: { "Content-Type": "application/javascript; charset=utf-8" },
          });
        }
        return new Response("// yaml bundle unavailable", {
          status: 500,
          headers: { "Content-Type": "application/javascript; charset=utf-8" },
        });
      }

      if (url.pathname === "/sw.js") {
        const sw = `self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});`;
        return new Response(sw, {
          headers: { "Content-Type": "application/javascript", "Service-Worker-Allowed": "/" },
        });
      }

      if (url.pathname === "/icon.svg") {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="96" fill="#0d1117"/>
<text x="256" y="320" font-size="280" text-anchor="middle" font-family="sans-serif">🦞</text>
</svg>`;
        return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
      }

      if (url.pathname === "/api/health") {
        return json({ ok: true, now: Date.now() });
      }

      if (url.pathname === "/api/state") {
        return json(await buildState(opts.getSnapshot()));
      }

      if (url.pathname === "/api/settings") {
        return json(sanitizeSettings(opts.getSnapshot().settings));
      }

      if (url.pathname === "/api/settings/heartbeat" && req.method === "POST") {
        try {
          const body = await req.json();
          const payload = body as {
            enabled?: unknown;
            interval?: unknown;
            prompt?: unknown;
            excludeWindows?: unknown;
          };
          const patch: {
            enabled?: boolean;
            interval?: number;
            prompt?: string;
            excludeWindows?: Array<{ days?: number[]; start: string; end: string }>;
          } = {};

          if ("enabled" in payload) patch.enabled = Boolean(payload.enabled);
          if ("interval" in payload) {
            const iv = Number(payload.interval);
            if (!Number.isFinite(iv)) throw new Error("interval must be numeric");
            patch.interval = iv;
          }
          if ("prompt" in payload) patch.prompt = String(payload.prompt ?? "");
          if ("excludeWindows" in payload) {
            if (!Array.isArray(payload.excludeWindows)) {
              throw new Error("excludeWindows must be an array");
            }
            patch.excludeWindows = payload.excludeWindows
              .filter((entry) => entry && typeof entry === "object")
              .map((entry) => {
                const row = entry as Record<string, unknown>;
                const start = String(row.start ?? "").trim();
                const end = String(row.end ?? "").trim();
                const days = Array.isArray(row.days)
                  ? row.days
                      .map((d) => Number(d))
                      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
                  : undefined;
                return {
                  start,
                  end,
                  ...(days && days.length > 0 ? { days } : {}),
                };
              });
          }

          if (
            !("enabled" in patch) &&
            !("interval" in patch) &&
            !("prompt" in patch) &&
            !("excludeWindows" in patch)
          ) {
            throw new Error("no heartbeat fields provided");
          }

          const next = await updateHeartbeatSettings(patch);
          if (opts.onHeartbeatEnabledChanged && "enabled" in patch) {
            await opts.onHeartbeatEnabledChanged(Boolean(patch.enabled));
          }
          if (opts.onHeartbeatSettingsChanged) {
            await opts.onHeartbeatSettingsChanged(patch);
          }
          return json({ ok: true, heartbeat: next });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/settings/heartbeat" && req.method === "GET") {
        try {
          return json({ ok: true, heartbeat: await readHeartbeatSettings() });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/technical-info") {
        return json(await buildTechnicalInfo(opts.getSnapshot()));
      }

      if (url.pathname === "/api/jobs/quick" && req.method === "POST") {
        try {
          const body = await req.json();
          const result = await createQuickJob(body as { time?: unknown; prompt?: unknown });
          if (opts.onJobsChanged) await opts.onJobsChanged();
          return json({ ok: true, ...result });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname.startsWith("/api/jobs/") && req.method === "DELETE") {
        try {
          const encodedName = url.pathname.slice("/api/jobs/".length);
          const name = decodeURIComponent(encodedName);
          await deleteJob(name);
          if (opts.onJobsChanged) await opts.onJobsChanged();
          return json({ ok: true });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/jobs") {
        const jobs = opts.getSnapshot().jobs.map((j) => ({
          name: j.name,
          schedule: j.schedule,
          promptPreview: j.prompt.slice(0, 160),
        }));
        return json({ jobs });
      }

      if (url.pathname === "/api/logs") {
        const tail = clampInt(url.searchParams.get("tail"), 200, 20, 2000);
        return json(await readLogs(tail));
      }

      // File browser
      if (url.pathname === "/api/files/list") {
        try {
          const dir = url.searchParams.get("path") || ".";
          const branch = url.searchParams.get("branch") || undefined;
          const result = await listDirectory(dir, branch);
          return json({ ok: true, ...result });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/files/read") {
        try {
          const file = url.searchParams.get("path");
          if (!file) return json({ ok: false, error: "path param required" });
          const branch = url.searchParams.get("branch") || undefined;
          const result = await readFileContent(file, branch);
          return json({ ok: true, ...result, markdown: isMarkdown(file) });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/git/branches") {
        try {
          const p = url.searchParams.get("path") || ".";
          const result = await listBranchesForPath(p);
          return json({ ok: true, ...result });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // Chat history persistence
      if (url.pathname === "/api/chats" && req.method === "GET") {
        try {
          return json({ ok: true, chats: await listChats() });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname.startsWith("/api/chats/") && req.method === "GET") {
        try {
          const id = decodeURIComponent(url.pathname.slice("/api/chats/".length));
          const since = url.searchParams.get("since");
          const session = await peekThreadSession(id);
          if (since) {
            const meta = await getChatMeta(id);
            if (!meta) return json({ ok: false, error: "not found" });
            if (since >= meta.updatedAt) {
              return json({ ok: true, chat: null, updatedAt: meta.updatedAt, unchanged: true, session });
            }
          }
          const chat = await loadChat(id);
          if (!chat) return json({ ok: false, error: "not found" });
          return json({ ok: true, chat, session });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/agents" && req.method === "GET") {
        try {
          return json({ ok: true, agents: await listAgents() });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // WAL-63 phase 4: multi-agent task summary (read-only).
      if (url.pathname === "/api/multi-agent/summary" && req.method === "GET") {
        try {
          return json({ ok: true, summary: await getMultiAgentSummary() });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/tasks" && req.method === "GET") {
        try {
          const since = url.searchParams.get("since") ?? undefined;
          const limitRaw = url.searchParams.get("limit");
          const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
          const includeArchived = url.searchParams.get("archived") === "1";
          return json({
            ok: true,
            tasks: await listTasks({
              since,
              limit: Number.isFinite(limit) ? limit : undefined,
              includeArchived,
            }),
          });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname.startsWith("/api/tasks/") && req.method === "GET") {
        try {
          const id = decodeURIComponent(url.pathname.slice("/api/tasks/".length));
          if (!/^TSK-/.test(id)) return json({ ok: false, error: "invalid task id" });
          return json({ ok: true, chain: await getTaskChain(id) });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/tasks/new" && req.method === "POST") {
        try {
          const body = await req.json();
          const result = await createTask(body);
          if (!result.ok) return json({ ok: false, error: result.error });
          return json({ ok: true, id: result.id });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // Debug: list all thread sessions (used to verify per-chat isolation).
      if (url.pathname === "/api/sessions" && req.method === "GET") {
        try {
          return json({ ok: true, sessions: await listThreadSessions() });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname.startsWith("/api/chats/") && req.method === "POST") {
        try {
          const id = decodeURIComponent(url.pathname.slice("/api/chats/".length));
          const body = await req.json();
          const messages = Array.isArray(body?.messages) ? body.messages : [];
          const chat = await saveChat(id, messages);
          return json({ ok: true, chat });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname.startsWith("/api/chats/") && req.method === "PATCH") {
        try {
          const id = decodeURIComponent(url.pathname.slice("/api/chats/".length));
          const body = await req.json();
          const chat = await renameChat(id, body?.name);
          if (!chat) return json({ ok: false, error: "not found" });
          return json({ ok: true, chat });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname.startsWith("/api/chats/") && req.method === "DELETE") {
        try {
          const id = decodeURIComponent(url.pathname.slice("/api/chats/".length));
          await deleteChat(id);
          return json({ ok: true });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/chat/interrupt" && req.method === "POST") {
        try {
          const body = await req.json();
          const chatId = String(body?.chatId ?? "").trim();
          if (!chatId) return json({ ok: false, error: "chatId required" });
          const ctl = chatAborts.get(chatId);
          if (ctl) {
            ctl.abort();
            return json({ ok: true, interrupted: true });
          }
          // No live onChat for this chat — but the last assistant message may
          // be stuck in a non-terminal state from a previous daemon instance.
          // Finalise it so the UI unfreezes.
          const chat = await loadChat(chatId);
          if (chat) {
            const nonTerminal = new Set(["thinking", "streaming", "background"]);
            for (let i = chat.messages.length - 1; i >= 0; i--) {
              const m = chat.messages[i];
              if (m.role !== "assistant") continue;
              if (m.state && nonTerminal.has(m.state)) {
                const base = m.text || "";
                await patchLastMessage(
                  chatId,
                  (mm) => mm === m || (mm.role === "assistant" && mm.state === m.state),
                  {
                    text: base ? base + "\n\n[Interrupted]" : "[Interrupted]",
                    state: "done",
                  }
                );
                return json({ ok: true, interrupted: true, recovered: true });
              }
              break;
            }
          }
          return json({ ok: true, interrupted: false });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/chat" && req.method === "POST") {
        if (!opts.onChat) return json({ ok: false, error: "chat not configured" });
        try {
          const body = await req.json();
          const message = String(body?.message ?? "").trim();
          const chatId = String(body?.chatId ?? "").trim();
          const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
          if (!message) return json({ ok: false, error: "message required" });
          if (!chatId) return json({ ok: false, error: "chatId required" });

          // Persist user msg as pending; queue processor picks it up.
          // agentId is only applied if the chat doesn't have one yet
          // (immutable once set on the first message).
          await appendMessage(
            chatId,
            {
              role: "user",
              text: message,
              state: "pending",
              startedAt: Date.now(),
              updatedAt: Date.now(),
            },
            agentId || undefined
          );

          // Kick off processing in the background. If there's already a
          // processor running for this chat, it will pick up the new pending
          // message on its next loop iteration.
          ensureChatProcessor(chatId, opts.onChat).catch(() => {});

          return json({ ok: true });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      return new Response("Not found", { status: 404 });
    },
  });

  return {
    stop: () => server.stop(),
    host: opts.host,
    port: server.port,
  };
}
