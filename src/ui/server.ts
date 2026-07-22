import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlPage } from "./page/html";
import { clampInt, json } from "./http";
import type { StartWebUiOptions, WebServerHandle } from "./types";
import { buildState, buildTechnicalInfo, sanitizeSettings } from "./services/state";
import { readHeartbeatSettings, updateHeartbeatSettings, readVoiceSettings, updateVoiceSettings } from "./services/settings";
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
import { listDirectory, readFileContent, isMarkdown, listBranchesForPath, isImage, readFileRaw } from "./services/files";
import { peekThreadSession, listThreadSessions } from "../sessionManager";
import { listAgents } from "../agents";
import { getMultiAgentSummary, listTasks, getTaskChain } from "./services/multiAgent";
import { createTask, unblockTask, revisitTask, spawnNextTask, closeTask, reopenTask, renameTask, setTaskProject, abortTask } from "./services/multiAgentDispatch";
import { listProjects, listProjectsWithCounts, getProjectSummary, createProject } from "./services/projects";
import { transcribeAudioToText, warmupWhisperAssets } from "../whisper";
import { getSettings, reloadSettings } from "../config";

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
  // Warm up whisper assets in the background — downloads binary + model on
  // first use so the initial /api/voice/transcribe request doesn't stall.
  warmupWhisperAssets().catch(() => {});

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
          name: "Caravel",
          short_name: "Caravel",
          description: "Caravel Dashboard",
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
<rect width="512" height="512" rx="96" fill="#1E76FE"/>
<g transform="translate(39 90) scale(6.8)" fill="none">
<path d="M31 34 V6 M48 34 V14" stroke="#eaf2ff" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
<path d="M36 25 L58 13 Q61 23 56 31 Q46 29 36 25 Z" fill="#eaf2ff" opacity="0.68"/>
<path d="M12 20 L42 4 Q49 18 40 31 Q26 27 12 20 Z" fill="#eaf2ff"/>
<path d="M6 34 H58 L52 43 Q49 45 45 45 H19 Q15 45 12 43 Z" fill="#eaf2ff"/>
</g>
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

      // Raw bytes for the Files-tab image viewer. Serves the file with its
      // image MIME type so an <img> can load it directly (binary won't
      // survive the JSON text reader above). Path safety + branch view are
      // handled in readFileRaw.
      if (url.pathname === "/api/files/raw") {
        try {
          const file = url.searchParams.get("path");
          if (!file) return new Response("path param required", { status: 400 });
          if (!isImage(file)) return new Response("not an image", { status: 415 });
          const branch = url.searchParams.get("branch") || undefined;
          const { bytes, contentType } = await readFileRaw(file, branch);
          // Cast to BodyInit: Bun serves a bare Uint8Array fine at runtime,
          // but lib.dom's Response/Blob types reject Bun's generic
          // Uint8Array. Zero behavioural difference.
          return new Response(bytes as unknown as BodyInit, {
            headers: { "Content-Type": contentType, "Cache-Control": "no-cache" },
          });
        } catch (err) {
          return new Response(String(err instanceof Error ? err.message : err), { status: 404 });
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

      // WAL-63 Phase 3: project folder listing. Powers the new-task form
      // project dropdown (slug + README frontmatter). The Phase 4 card grid
      // wants additional roll-up counts (active · done-not-closed · stuck ·
      // closed) so it asks for ?counts=1 to get the richer payload.
      if (url.pathname === "/api/projects" && req.method === "GET") {
        try {
          if (url.searchParams.get("counts") === "1") {
            return json({ ok: true, projects: await listProjectsWithCounts() });
          }
          return json({ ok: true, projects: await listProjects() });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // Create a project folder with a minimal README scaffold. Called by the
      // dashboard's "+ New project…" option in the task-panel project chip.
      // Returns ok:true (and the new path) on success, or ok:false with an
      // error message. Already-existing slugs return ok:true so the caller
      // can always proceed to tag the task.
      if (url.pathname === "/api/projects" && req.method === "POST") {
        try {
          const body = await req.json();
          const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
          if (!slug) return json({ ok: false, error: "slug is required" });
          const result = await createProject(slug);
          return json(result);
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // WAL-63 Phase 4: per-project summary for the Project page (leaves,
      // family trees, closed history, docs shelf, workstream metrics).
      // Slug "" maps to the Unassigned bucket — wire the empty-string path
      // explicitly so the URL can encode it as `%20` or similar.
      if (url.pathname.startsWith("/api/projects/") && req.method === "GET") {
        try {
          const slug = decodeURIComponent(url.pathname.slice("/api/projects/".length));
          const summary = await getProjectSummary(slug);
          if (!summary) return json({ ok: false, error: "project not found" });
          return json({ ok: true, summary });
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

      // Unblock a `waiting:on:user` task: append Kelly's response to the brief
      // and move the envelope back to `tasks/open/` so the runner re-claims.
      if (url.pathname.startsWith("/api/tasks/") && url.pathname.endsWith("/unblock") && req.method === "POST") {
        try {
          const middle = url.pathname.slice("/api/tasks/".length, -"/unblock".length);
          const taskId = decodeURIComponent(middle);
          if (!/^TSK-/.test(taskId)) return json({ ok: false, error: "invalid task id" });
          const body = await req.json();
          const result = await unblockTask({
            agent: String(body?.agent ?? "").trim(),
            taskId,
            response: String(body?.response ?? ""),
          });
          if (!result.ok) return json({ ok: false, error: result.error });
          return json({ ok: true, id: result.id });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // Revisit a `done` or `failed` task: append a follow-up to revisits[]
      // and move the envelope back to `tasks/open/` so the runner re-claims.
      // Kept for backward compat — new UI uses /next which spawns a child
      // instead of mutating the original.
      if (url.pathname.startsWith("/api/tasks/") && url.pathname.endsWith("/revisit") && req.method === "POST") {
        try {
          const middle = url.pathname.slice("/api/tasks/".length, -"/revisit".length);
          const taskId = decodeURIComponent(middle);
          if (!/^TSK-/.test(taskId)) return json({ ok: false, error: "invalid task id" });
          const body = await req.json();
          const result = await revisitTask({
            agent: String(body?.agent ?? "").trim(),
            taskId,
            instruction: String(body?.instruction ?? ""),
          });
          if (!result.ok) return json({ ok: false, error: result.error, code: result.code });
          return json({ ok: true, id: result.id });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // Spawn a "Next" child task. Unified successor to /unblock + /revisit:
      // leaves the parent envelope in place (status unchanged for done/failed,
      // status unchanged for waiting:on:user until the child completes), and
      // creates a fresh child envelope with parent pointer + Kelly's
      // instruction woven into the brief. For waiting:on:user parents, the
      // child carries closes_parent_on_done=true so the runner auto-closes
      // the parent when the child lands as done.
      if (url.pathname.startsWith("/api/tasks/") && url.pathname.endsWith("/next") && req.method === "POST") {
        try {
          const middle = url.pathname.slice("/api/tasks/".length, -"/next".length);
          const taskId = decodeURIComponent(middle);
          if (!/^TSK-/.test(taskId)) return json({ ok: false, error: "invalid task id" });
          const body = await req.json();
          const sourceRaw = String(body?.source ?? "").trim();
          if (sourceRaw !== "revisit" && sourceRaw !== "unblock") {
            return json({ ok: false, error: "source must be 'revisit' or 'unblock'" });
          }
          const result = await spawnNextTask({
            agent: String(body?.agent ?? "").trim(),
            taskId,
            instruction: String(body?.instruction ?? ""),
            source: sourceRaw,
            target: body?.target ? String(body.target).trim() : undefined,
            headline: body?.headline ? String(body.headline).trim() : undefined,
          });
          if (!result.ok) return json({ ok: false, error: result.error });
          return json({ ok: true, id: result.id, parentId: result.parentId });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // WAL-63 Phase 1: close a task — write the user-attention `closed`
      // block on the envelope. Refuses when the runner has `status: claimed`
      // (worker mid-turn). Cascade walks descendants; the UI prompts before
      // setting it true.
      if (url.pathname.startsWith("/api/tasks/") && url.pathname.endsWith("/close") && req.method === "POST") {
        try {
          const middle = url.pathname.slice("/api/tasks/".length, -"/close".length);
          const taskId = decodeURIComponent(middle);
          if (!/^TSK-/.test(taskId)) return json({ ok: false, error: "invalid task id" });
          const body = await req.json();
          const statusRaw = typeof body?.status === "string" ? body.status.trim() : "";
          const status = statusRaw === "closed" || statusRaw === "superseded" || statusRaw === "cancelled"
            ? statusRaw
            : undefined;
          if (statusRaw && !status) {
            return json({ ok: false, error: `invalid closed.status: ${statusRaw}` });
          }
          const result = await closeTask({
            agent: String(body?.agent ?? "").trim(),
            taskId,
            status,
            reason: typeof body?.reason === "string" ? body.reason : undefined,
            by: typeof body?.by === "string" ? body.by : undefined,
            cascade: Boolean(body?.cascade),
          });
          if (!result.ok) return json({ ok: false, error: result.error });
          return json({ ok: true, id: result.id, closed: result.closed, cascaded: result.cascaded });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // Abort a claimed task mid-flight — kills the live worker process, then
      // the runner finalises it as failed:aborted + closed:cancelled. Unlike
      // /close (which refuses claimed tasks), this is the deliberate kill
      // path. The UI gates it behind a confirm step. POST body: { agent,
      // reason?, by? }.
      if (url.pathname.startsWith("/api/tasks/") && url.pathname.endsWith("/abort") && req.method === "POST") {
        try {
          const middle = url.pathname.slice("/api/tasks/".length, -"/abort".length);
          const taskId = decodeURIComponent(middle);
          if (!/^TSK-/.test(taskId)) return json({ ok: false, error: "invalid task id" });
          const body = await req.json();
          const result = await abortTask({
            agent: String(body?.agent ?? "").trim(),
            taskId,
            reason: typeof body?.reason === "string" ? body.reason : undefined,
            by: typeof body?.by === "string" ? body.by : undefined,
          });
          if (!result.ok) return json({ ok: false, error: result.error });
          return json({ ok: true, id: result.id, mode: result.mode });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // WAL-63 Phase 1: reopen a task — drop the `closed` block back to null
      // so the task re-surfaces as an active leaf. Runner status is untouched
      // (a previously `done, superseded` task becomes `done, closed: null`).
      if (url.pathname.startsWith("/api/tasks/") && url.pathname.endsWith("/reopen") && req.method === "POST") {
        try {
          const middle = url.pathname.slice("/api/tasks/".length, -"/reopen".length);
          const taskId = decodeURIComponent(middle);
          if (!/^TSK-/.test(taskId)) return json({ ok: false, error: "invalid task id" });
          const body = await req.json();
          const result = await reopenTask({
            agent: String(body?.agent ?? "").trim(),
            taskId,
            by: typeof body?.by === "string" ? body.by : undefined,
          });
          if (!result.ok) return json({ ok: false, error: result.error });
          return json({ ok: true, id: result.id, previousStatus: result.previousStatus });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // Rename a task — edit the headline on an existing envelope. Refused
      // while status: claimed. Audit trail captured in the envelope's
      // history + the agent's journal.
      if (url.pathname.startsWith("/api/tasks/") && url.pathname.endsWith("/rename") && req.method === "POST") {
        try {
          const middle = url.pathname.slice("/api/tasks/".length, -"/rename".length);
          const taskId = decodeURIComponent(middle);
          if (!/^TSK-/.test(taskId)) return json({ ok: false, error: "invalid task id" });
          const body = await req.json();
          const result = await renameTask({
            agent: String(body?.agent ?? "").trim(),
            taskId,
            headline: String(body?.headline ?? ""),
          });
          if (!result.ok) return json({ ok: false, error: result.error });
          return json({ ok: true, id: result.id, previous: result.previous });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      // Assign / change project on a task. Empty string or null clears.
      if (url.pathname.startsWith("/api/tasks/") && url.pathname.endsWith("/project") && req.method === "POST") {
        try {
          const middle = url.pathname.slice("/api/tasks/".length, -"/project".length);
          const taskId = decodeURIComponent(middle);
          if (!/^TSK-/.test(taskId)) return json({ ok: false, error: "invalid task id" });
          const body = await req.json();
          const projectRaw = body?.project;
          const project = projectRaw == null ? null : String(projectRaw);
          const result = await setTaskProject({
            agent: String(body?.agent ?? "").trim(),
            taskId,
            project,
          });
          if (!result.ok) return json({ ok: false, error: result.error });
          return json({ ok: true, id: result.id, previous: result.previous });
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

      if (url.pathname === "/api/voice/transcribe" && req.method === "POST") {
        const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
        try {
          const contentLength = Number(req.headers.get("content-length") || 0);
          if (contentLength > MAX_BYTES) {
            return json({ ok: false, error: "Audio too large (max 10 MB)" });
          }
          let formData: FormData;
          try {
            formData = await req.formData();
          } catch {
            return json({ ok: false, error: "Expected multipart/form-data with an audio field" });
          }
          const audio = formData.get("audio");
          if (!audio || !(audio instanceof Blob)) {
            return json({ ok: false, error: "audio field (Blob) required" });
          }
          if (audio.size > MAX_BYTES) {
            return json({ ok: false, error: "Audio too large (max 10 MB)" });
          }
          if (audio.size === 0) {
            return json({ ok: false, error: "Audio blob is empty" });
          }
          const mimeType = audio.type || "audio/ogg";
          const ext = mimeType.includes("webm") ? ".webm" : mimeType.includes("wav") ? ".wav" : ".ogg";
          const tmpPath = join(tmpdir(), `caravel-voice-${Date.now()}${ext}`);
          await writeFile(tmpPath, new Uint8Array(await audio.arrayBuffer()));
          let text = "";
          try {
            text = await transcribeAudioToText(tmpPath);
          } finally {
            await rm(tmpPath, { force: true }).catch(() => {});
          }
          return json({ ok: true, text });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[voice] transcribe error:", msg);
          return json({ ok: false, error: msg });
        }
      }

      if (url.pathname === "/api/settings/voice" && req.method === "GET") {
        try {
          return json({ ok: true, voice: await readVoiceSettings() });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/settings/voice" && req.method === "POST") {
        try {
          const body = await req.json();
          const patch: Record<string, any> = {};
          if (typeof body?.sttEnabled === "boolean") patch.sttEnabled = body.sttEnabled;
          if (typeof body?.sttModel === "string") patch.sttModel = body.sttModel;
          if (typeof body?.ttsModel === "string") patch.ttsModel = body.ttsModel;
          const updated = await updateVoiceSettings(patch);
          // Reload cached settings so the new values take effect immediately.
          await reloadSettings();
          return json({ ok: true, voice: updated });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/voice/speak" && req.method === "POST") {
        try {
          const body = await req.json();
          const text = typeof body?.text === "string" ? body.text.trim() : "";
          if (!text) return json({ ok: false, error: "text required" });
          const settings = getSettings();
          const apiKey = settings.deepGram?.apiKey ?? "";
          if (!apiKey) return json({ ok: false, error: "DeepGram API key not configured (set deepGram.apiKey in .caravel/settings.json)" });
          const ttsModel = settings.deepGram?.ttsModel || "aura-2-en-us";
          const dgRes = await fetch(
            `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(ttsModel)}&encoding=mp3`,
            {
              method: "POST",
              headers: {
                "Authorization": `Token ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ text }),
            }
          );
          if (!dgRes.ok) {
            const errText = await dgRes.text().catch(() => "");
            const msg = `DeepGram TTS error ${dgRes.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`;
            console.error("[voice] speak error:", msg);
            return json({ ok: false, error: msg });
          }
          const audioBuffer = await dgRes.arrayBuffer();
          return new Response(audioBuffer, {
            status: 200,
            headers: {
              "Content-Type": dgRes.headers.get("Content-Type") || "audio/mpeg",
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[voice] speak error:", msg);
          return json({ ok: false, error: msg });
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
