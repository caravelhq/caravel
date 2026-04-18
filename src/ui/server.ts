import { htmlPage } from "./page/html";
import { clampInt, json } from "./http";
import type { StartWebUiOptions, WebServerHandle } from "./types";
import { buildState, buildTechnicalInfo, sanitizeSettings } from "./services/state";
import { readHeartbeatSettings, updateHeartbeatSettings } from "./services/settings";
import { createQuickJob, deleteJob } from "./services/jobs";
import { readLogs } from "./services/logs";
import { listChats, loadChat, saveChat, deleteChat, getChatMeta } from "./services/chats";
import { listDirectory, readFileContent, isMarkdown } from "./services/files";

export function startWebUi(opts: StartWebUiOptions): WebServerHandle {
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
          const result = await listDirectory(dir);
          return json({ ok: true, ...result });
        } catch (err) {
          return json({ ok: false, error: String(err) });
        }
      }

      if (url.pathname === "/api/files/read") {
        try {
          const file = url.searchParams.get("path");
          if (!file) return json({ ok: false, error: "path param required" });
          const result = await readFileContent(file);
          return json({ ok: true, ...result, markdown: isMarkdown(file) });
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
          if (since) {
            const meta = await getChatMeta(id);
            if (!meta) return json({ ok: false, error: "not found" });
            if (since >= meta.updatedAt) {
              return json({ ok: true, chat: null, updatedAt: meta.updatedAt, unchanged: true });
            }
          }
          const chat = await loadChat(id);
          if (!chat) return json({ ok: false, error: "not found" });
          return json({ ok: true, chat });
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

      if (url.pathname.startsWith("/api/chats/") && req.method === "DELETE") {
        try {
          const id = decodeURIComponent(url.pathname.slice("/api/chats/".length));
          await deleteChat(id);
          return json({ ok: true });
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
          if (!message) return json({ ok: false, error: "message required" });

          // Save user message server-side immediately
          if (chatId) {
            const existing = await loadChat(chatId);
            const msgs = existing?.messages ?? [];
            msgs.push({ role: "user", text: message });
            await saveChat(chatId, msgs);
          }

          const encoder = new TextEncoder();
          const onChat = opts.onChat;
          let responseText = "";

          // Persist the assistant message incrementally so a daemon kill
          // mid-stream can't lose the whole response. Idempotent: if the
          // last message is already assistant, update its text in place
          // instead of pushing a new one.
          let persistBusy = false;
          let persistLastAt = 0;
          const PERSIST_THROTTLE_MS = 500;
          const persistAssistant = async (opts: { finalize: boolean; suffix?: string }) => {
            if (!chatId) return;
            if (persistBusy && !opts.finalize) return;
            const now = Date.now();
            if (!opts.finalize && now - persistLastAt < PERSIST_THROTTLE_MS) return;
            persistBusy = true;
            persistLastAt = now;
            try {
              const chat = await loadChat(chatId);
              const msgs = chat?.messages ?? [];
              const text = responseText + (opts.suffix ?? "");
              if (msgs.length && msgs[msgs.length - 1].role === "assistant") {
                msgs[msgs.length - 1].text = text;
              } else {
                msgs.push({ role: "assistant", text });
              }
              await saveChat(chatId, msgs);
            } finally {
              persistBusy = false;
            }
          };

          const stream = new ReadableStream({
            async start(controller) {
              const send = (data: object) => {
                try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
              };
              try {
                await onChat(
                  message,
                  (chunk) => {
                    responseText += chunk;
                    send({ type: "chunk", text: chunk });
                    persistAssistant({ finalize: false }).catch(() => {});
                  },
                  () => send({ type: "unblock" })
                );
                send({ type: "done" });
                await persistAssistant({ finalize: true });
              } catch (err) {
                send({ type: "error", message: String(err) });
                if (responseText) {
                  await persistAssistant({
                    finalize: true,
                    suffix: "\n\n[Error: " + String(err) + "]",
                  });
                }
              } finally {
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "X-Accel-Buffering": "no",
            },
          });
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
