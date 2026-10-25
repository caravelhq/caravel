<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { renderMarkdown } from "../lib/markdown";
import { useReadAloud } from "../components/voice/useReadAloud";
import { useChatStore } from "../stores/chat";
import { useUiStore } from "../stores/ui";
import ChatPicker from "../components/chat/ChatPicker.vue";

const { speak: readAloud, stop: stopReadAloud, isPlaying } = useReadAloud();
const chatStore = useChatStore();
const ui = useUiStore();

// Stop per-message audio when the global read-aloud starts.
watch(() => ui.raStopSignal, () => { if (isPlaying()) stopReadAloud(); });

// ── Constants ────────────────────────────────────────────────────────────────
const CHAT_ID_KEY = "caravel.chat.id";
const CHAT_POLL_FAST_MS = 500;
const CHAT_POLL_IDLE_MS = 10000;

// ── Picker state ─────────────────────────────────────────────────────────────
const showPicker = ref(false);

// ── Module state (per-component instance) ───────────────────────────────────
let chatHistory: Array<{ role: string; text: string; state?: string }> = [];
let chatSessionId = "";
let chatServerUpdatedAt: string | null = null;
let chatPollTimer: ReturnType<typeof setTimeout> | null = null;
let agentsCache: Array<{ name: string; emoji?: string; displayName?: string; description?: string }> = [];
let chatAgentLocked: string | null = null;
let pendingAgentId: string | null = null;
let agentsFetched = false;
let lastSessionInfo: unknown = null;

// DOM refs — populated in onMounted
let chatMessages: HTMLElement | null = null;
let chatInput: HTMLTextAreaElement | null = null;
let chatSend: HTMLButtonElement | null = null;
let chatForm: HTMLFormElement | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function $(id: string): HTMLElement | null { return document.getElementById(id); }

function generateChatId(): string {
  const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  localStorage.setItem(CHAT_ID_KEY, id);
  return id;
}

function cleanHistory(arr: unknown[]): Array<{ role: string; text: string; state?: string }> {
  if (!Array.isArray(arr)) return [];
  return (arr as Array<{ role: string; text: string; state?: string }>).filter((m) => {
    if (m.role === "assistant" && m.text && m.text.startsWith("[Failed:")) return false;
    return true;
  });
}

function hasActiveWork(): boolean {
  for (const m of chatHistory) {
    const s = m.state;
    if (s === "pending" || s === "sent" || s === "thinking" || s === "streaming" || s === "background") return true;
  }
  return false;
}

function orderedChatAgents() {
  let coord = null;
  const rest = [];
  for (const a of agentsCache) {
    if (!a || !a.name) continue;
    if (a.name === "alice") coord = a;
    else rest.push(a);
  }
  return coord ? [coord, ...rest] : rest;
}

function defaultChatAgentName(): string | null {
  const match = agentsCache.find((a) => a.name === "alice");
  if (match) return match.name;
  return agentsCache.length > 0 ? agentsCache[0].name : null;
}

function findAgent(id: string | null) {
  if (!id) return null;
  return agentsCache.find((a) => a.name === id) || null;
}

function effectiveAgentId(): string | null { return chatAgentLocked || pendingAgentId || null; }

function agentPicked(): boolean {
  if (agentsFetched && agentsCache.length === 0) return true;
  return !!(chatAgentLocked || pendingAgentId);
}

// ── Update helpers (DOM-level, safe to call after mount) ─────────────────────
function updateAgentBadge() {
  const el = $("chat-agent-badge") as HTMLElement | null;
  const id = effectiveAgentId();
  const agent = findAgent(id);
  if (chatInput) {
    chatInput.placeholder = agent ? `Message ${agent.displayName}…` : "Message…";
  }
  if (!el) return;
  if (!agent) {
    el.hidden = true;
    el.textContent = "";
    el.title = "";
    (el as HTMLElement & { dataset: DOMStringMap }).dataset.locked = "";
    return;
  }
  el.hidden = false;
  el.textContent = (agent.emoji ? agent.emoji + " " : "") + agent.displayName;
  el.title = (agent.description || "") + (chatAgentLocked ? " (locked for this chat)" : " (not yet locked — send first message to confirm)");
  (el as HTMLElement & { dataset: DOMStringMap }).dataset.locked = chatAgentLocked ? "1" : "0";
}

function updateSendDisabled() {
  if (!chatSend) return;
  chatSend.disabled = !agentPicked();
}

function updateSessionBadge(session: { sessionId: string; turnCount?: number } | null | undefined) {
  lastSessionInfo = session || null;
  const el = $("chat-session-badge");
  if (!el) return;
  const chatFp = chatSessionId ? chatSessionId.slice(0, 8) : "";
  if (!session || !session.sessionId) {
    el.hidden = false;
    el.textContent = "thread " + chatFp + " · no session yet";
    el.title = "No Claude session has been created for this chat yet.";
    (el as HTMLElement & { dataset: DOMStringMap }).dataset.sessionId = "";
    return;
  }
  const sidFp = session.sessionId.slice(0, 8);
  const turns = typeof session.turnCount === "number" ? session.turnCount : 0;
  el.hidden = false;
  el.textContent = "thread " + chatFp + " → " + sidFp + " · " + turns + " turn" + (turns === 1 ? "" : "s");
  el.title = "thread: " + chatSessionId + "\nsession: " + session.sessionId + "\n(click to copy session id)";
  (el as HTMLElement & { dataset: DOMStringMap }).dataset.sessionId = session.sessionId;
}

function updateChatNameInput(name: string, preview?: string) {
  const toolbar = $("chat-name-input") as HTMLInputElement | null;
  const inline = $("chat-new-title-input") as HTMLInputElement | null;
  const autoSuggestion = (preview ? String(preview).trim().slice(0, 50) : "") || "Untitled chat";
  if (toolbar) {
    toolbar.value = name || "";
    toolbar.dataset.committed = name || "";
    toolbar.setAttribute("placeholder", autoSuggestion);
  }
  if (inline) {
    inline.value = name || "";
    inline.dataset.committed = name || "";
  }
  refreshChatTitleVisibility();
}

function refreshChatTitleVisibility() {
  const toolbar = $("chat-name-input") as HTMLInputElement | null;
  const inline = $("chat-new-title-input") as HTMLInputElement | null;
  const isEmpty = !chatHistory || chatHistory.length === 0;
  if (toolbar) toolbar.hidden = isEmpty;
  if (inline) inline.hidden = !isEmpty;
}

// ── Polling ──────────────────────────────────────────────────────────────────
function schedulePoll() {
  if (chatPollTimer) clearTimeout(chatPollTimer);
  const delay = hasActiveWork() ? CHAT_POLL_FAST_MS : CHAT_POLL_IDLE_MS;
  chatPollTimer = setTimeout(() => {
    pollChat().finally(schedulePoll);
  }, delay);
}

async function pollChat(opts?: { force?: boolean }) {
  if (document.visibilityState !== "visible") return;
  try {
    let url = "/api/chats/" + encodeURIComponent(chatSessionId);
    if (chatServerUpdatedAt && !opts?.force) url += "?since=" + encodeURIComponent(chatServerUpdatedAt);
    const res = await fetch(url);
    const data = await res.json();
    if (!data || !data.ok) return;
    updateSessionBadge(data.session);
    if (data.unchanged) {
      if (data.updatedAt) chatServerUpdatedAt = data.updatedAt;
      return;
    }
    if (data.chat && data.chat.messages) {
      chatHistory = cleanHistory(data.chat.messages);
      chatServerUpdatedAt = data.chat.updatedAt || chatServerUpdatedAt;
      if (data.chat.agentId && chatAgentLocked !== data.chat.agentId) {
        chatAgentLocked = data.chat.agentId;
        updateAgentBadge();
        updateSendDisabled();
      }
      renderChatHistory();
      if (typeof window.__vmOnAssistantChunk === "function") {
        const lastMsg = chatHistory[chatHistory.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.text) {
          const st = lastMsg.state;
          const isDone = !st || st === "done";
          if (isDone || st === "streaming" || st === "background") {
            (window as Window & { __vmOnAssistantChunk?: (text: string, done: boolean) => void }).__vmOnAssistantChunk!(lastMsg.text, isDone);
          }
        }
      }
    }
  } catch (_) {}
}

// ── Chat loading ─────────────────────────────────────────────────────────────
async function loadChatFromServer() {
  try {
    const res = await fetch("/api/chats/" + encodeURIComponent(chatSessionId));
    const data = await res.json();
    if (data.ok && data.chat) {
      chatServerUpdatedAt = data.chat.updatedAt || null;
      chatHistory = cleanHistory(data.chat.messages || []);
      chatAgentLocked = data.chat.agentId || null;
      renderChatHistory();
      updateAgentBadge();
      updateSendDisabled();
    }
    if (data && data.ok) updateSessionBadge(data.session);
  } catch (_) {}
}

async function loadAgents() {
  try {
    const res = await fetch("/api/agents");
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.agents)) agentsCache = data.agents;
  } catch (_) {}
  agentsFetched = true;
  if (!pendingAgentId && !chatAgentLocked) pendingAgentId = defaultChatAgentName();
  renderChatHistory();
  updateAgentBadge();
}

// ── Chat picker event handlers ────────────────────────────────────────────────

async function handlePickerRename(chatId: string, name: string): Promise<void> {
  try {
    await fetch("/api/chats/" + encodeURIComponent(chatId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  } catch (_) {}
}

// ── Chat navigation ───────────────────────────────────────────────────────────

// WAL-149: the envelope's Chat action opens this page on a specific task thread.
// Legacy pages are excluded from KeepAlive (see ViewHost), so the usual route is
// a fresh mount that picks up `window.__chatSessionId` below. The one case that
// does NOT remount is a split view where the chat tab is already the active tab
// in the other group — there the launcher's event is the only signal we get.
function onChatThreadRequest(ev: Event): void {
  const detail = (ev as CustomEvent<{ chatId?: string; agentId?: string }>).detail;
  const id = detail?.chatId;
  if (!id || id === chatSessionId) return;
  if (detail.agentId) pendingAgentId = detail.agentId;
  void switchToChat(id);
}

async function switchToChat(id: string) {
  chatSessionId = id;
  window.__chatSessionId = id;
  localStorage.setItem(CHAT_ID_KEY, id);
  chatServerUpdatedAt = null;
  chatAgentLocked = null;
  pendingAgentId = null;
  let fetchedName = "";
  let fetchedPreview = "";
  try {
    const res = await fetch("/api/chats/" + encodeURIComponent(id));
    const data = await res.json();
    if (data.ok && data.chat) {
      chatHistory = cleanHistory(data.chat.messages);
      chatServerUpdatedAt = data.chat.updatedAt || null;
      chatAgentLocked = data.chat.agentId || null;
      fetchedName = data.chat.name || "";
      fetchedPreview = data.chat.preview || "";
    } else {
      chatHistory = [];
    }
  } catch (_) { chatHistory = []; }
  if (!chatAgentLocked && !pendingAgentId && agentsCache.length > 0) {
    pendingAgentId = defaultChatAgentName();
  }
  updateAgentBadge();
  updateChatNameInput(fetchedName, fetchedPreview);
  updateSendDisabled();
  renderChatHistory();
  schedulePoll();
  showPicker.value = false;
}

function startNewChat() {
  chatSessionId = generateChatId();
  chatHistory = [];
  chatServerUpdatedAt = null;
  chatAgentLocked = null;
  pendingAgentId = null;
  if (agentsCache.length > 0) pendingAgentId = defaultChatAgentName();
  updateAgentBadge();
  updateChatNameInput("");
  updateSendDisabled();
  renderChatHistory();
  schedulePoll();
  showPicker.value = false;
}

// ── Message rendering ─────────────────────────────────────────────────────────
function createChatEmptyState(): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "chat-empty";
  if (!agentsFetched) { empty.textContent = "Loading agents…"; return empty; }
  if (agentsCache.length === 0) {
    empty.textContent = "Send a message to start chatting with the daemon.";
    return empty;
  }
  const head = document.createElement("div");
  head.className = "chat-picker-head";
  head.textContent = "Pick an agent to start this chat";
  empty.appendChild(head);
  const sub = document.createElement("div");
  sub.className = "chat-picker-sub";
  sub.textContent = "Agent is locked once you send the first message.";
  empty.appendChild(sub);
  const list = document.createElement("div");
  list.className = "chat-picker-list";
  for (const agent of orderedChatAgents()) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "chat-picker-item";
    if (pendingAgentId === agent.name) item.classList.add("chat-picker-item-active");
    const title = document.createElement("div");
    title.className = "chat-picker-item-title";
    title.textContent = (agent.emoji ? agent.emoji + " " : "") + (agent.displayName || agent.name);
    item.appendChild(title);
    const desc = document.createElement("div");
    desc.className = "chat-picker-item-desc";
    desc.textContent = agent.description || "";
    item.appendChild(desc);
    item.addEventListener("click", () => {
      pendingAgentId = agent.name;
      updateAgentBadge();
      updateSendDisabled();
      list.querySelectorAll(".chat-picker-item").forEach((el) => {
        el.classList.toggle("chat-picker-item-active", el === item);
      });
    });
    list.appendChild(item);
  }
  empty.appendChild(list);
  return empty;
}

function createChatMessageEl(): HTMLElement {
  const msgEl = document.createElement("div");
  const roleEl = document.createElement("div");
  roleEl.className = "chat-msg-role";
  const textEl = document.createElement("div");
  textEl.className = "chat-msg-text";
  msgEl.appendChild(roleEl);
  msgEl.appendChild(textEl);
  return msgEl;
}

function syncChatMessageEl(msgEl: HTMLElement, msg: { role: string; text: string; state?: string }) {
  let roleEl = msgEl.querySelector<HTMLElement>(".chat-msg-role");
  let textEl = msgEl.querySelector<HTMLElement>(".chat-msg-text");
  if (!roleEl || !textEl) {
    msgEl.textContent = "";
    roleEl = document.createElement("div");
    roleEl.className = "chat-msg-role";
    textEl = document.createElement("div");
    textEl.className = "chat-msg-text";
    msgEl.appendChild(roleEl);
    msgEl.appendChild(textEl);
  }
  const isUser = msg.role === "user";
  const state = msg.state || (isUser ? "sent" : "done");
  let cls = "chat-msg " + (isUser ? "chat-msg-user" : "chat-msg-assistant");
  if (state === "streaming") cls += " chat-msg-streaming";
  if (state === "error") cls += " chat-msg-error";
  if (isUser && state === "pending") cls += " chat-msg-user-pending";
  msgEl.className = cls;
  roleEl.textContent = "";
  const roleText = document.createElement("span");
  roleText.className = "chat-msg-role-label";
  roleText.textContent = isUser ? "You" : "Claude";
  roleEl.appendChild(roleText);
  if (isUser && state === "pending") {
    const pill = document.createElement("span");
    pill.className = "chat-msg-pill";
    pill.textContent = "queued";
    roleEl.appendChild(pill);
  }
  textEl.innerHTML = renderMarkdown(msg.text || "");
  msgEl.querySelectorAll(".chat-msg-meta").forEach((el) => el.remove());
  if (!isUser) {
    let metaLabel = "";
    let metaClass = "";
    if (state === "thinking") { metaClass = "chat-msg-thinking"; metaLabel = "thinking…"; }
    else if (state === "background") { metaClass = "chat-msg-background"; metaLabel = "⚙ working in background…"; }
    if (metaLabel) {
      const meta = document.createElement("div");
      meta.className = "chat-msg-meta " + metaClass;
      const labelSpan = document.createElement("span");
      labelSpan.className = "chat-msg-meta-label";
      labelSpan.textContent = metaLabel;
      meta.appendChild(labelSpan);
      const stopBtn = document.createElement("button");
      stopBtn.type = "button";
      stopBtn.className = "chat-msg-stop-inline";
      stopBtn.title = "Stop this response";
      stopBtn.setAttribute("aria-label", "Stop this response");
      stopBtn.textContent = "stop";
      stopBtn.addEventListener("click", () => {
        stopBtn.disabled = true;
        interruptCurrent({ sendAfter: true });
      });
      meta.appendChild(stopBtn);
      msgEl.appendChild(meta);
    }
    const isActive = state === "thinking" || state === "streaming" || state === "background";
    msgEl.dataset.active = isActive ? "1" : "0";

    // Per-message read-aloud control — only on finished assistant messages.
    msgEl.querySelector(".chat-msg-speak")?.remove();
    if (!isActive && msg.text) {
      const speakBtn = document.createElement("button");
      speakBtn.type = "button";
      speakBtn.className = "chat-msg-speak";
      speakBtn.title = "Read aloud";
      speakBtn.setAttribute("aria-label", "Read aloud");
      speakBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
      const capturedText = msg.text;
      speakBtn.addEventListener("click", () => { readAloud(capturedText); });
      msgEl.appendChild(speakBtn);
    }
  }
}

// voice:read-aloud-toggle — toggle playback of the latest assistant message.
function onReadAloudToggle() {
  if (isPlaying()) { stopReadAloud(); return; }
  const last = [...chatHistory].reverse().find(
    (m) => m.role === "assistant" && m.text && m.state !== "error"
  );
  if (last?.text) readAloud(last.text);
}

function updateInterruptBtn() {
  const btn = $("chat-interrupt") as HTMLButtonElement | null;
  if (!btn) return;
  const live = chatHistory.some((m) => {
    if (m.role !== "assistant") return false;
    const s = m.state;
    return s === "thinking" || s === "streaming" || s === "background";
  });
  btn.hidden = !live;
  if (live) btn.disabled = false;
}

function renderChatHistory() {
  // Update the global read-aloud text with the last finished assistant message.
  const lastDone = [...chatHistory].reverse().find(
    (m) => m.role === "assistant" && m.text &&
      m.state !== "thinking" && m.state !== "streaming" && m.state !== "background" && m.state !== "error"
  );
  ui.raText = lastDone?.text ?? null;
  ui.raFilePath = null;

  const w = window as Window & { __updateSpeakerDisabled?: () => void };
  if (typeof w.__updateSpeakerDisabled === "function") w.__updateSpeakerDisabled();
  refreshChatTitleVisibility();
  if (!chatMessages) return;
  if (!chatHistory.length) {
    if (
      chatMessages.children.length !== 1 ||
      !chatMessages.firstElementChild ||
      !chatMessages.firstElementChild.classList.contains("chat-empty")
    ) {
      chatMessages.textContent = "";
      chatMessages.appendChild(createChatEmptyState());
    }
    return;
  }
  if (chatMessages.firstElementChild && chatMessages.firstElementChild.classList.contains("chat-empty")) {
    chatMessages.textContent = "";
  }
  const msgEls = chatMessages.querySelectorAll<HTMLElement>(".chat-msg");
  for (let i = 0; i < chatHistory.length; i++) {
    let msgEl = msgEls[i];
    if (!msgEl) {
      msgEl = createChatMessageEl();
      chatMessages.appendChild(msgEl);
    }
    syncChatMessageEl(msgEl, chatHistory[i]);
  }
  const allMsgEls = chatMessages.querySelectorAll<HTMLElement>(".chat-msg");
  for (let j = allMsgEls.length - 1; j >= chatHistory.length; j--) {
    allMsgEls[j].remove();
  }
  updateInterruptBtn();
  requestAnimationFrame(() => { if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight; });
}

// ── Send / interrupt ─────────────────────────────────────────────────────────
function autoResizeChatInput() {
  if (!chatInput) return;
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
}

async function sendChat() {
  if (!chatInput) return;
  const message = (chatInput.value || "").trim();
  if (!message) return;
  if (!agentPicked()) return;
  chatInput.value = "";
  autoResizeChatInput();
  chatStore.saveDraft(chatSessionId, "");
  chatHistory.push({ role: "user", text: message, state: "pending" });
  if (!chatAgentLocked && pendingAgentId) {
    chatAgentLocked = pendingAgentId;
    updateAgentBadge();
    updateSendDisabled();
  }
  renderChatHistory();
  const payload: Record<string, string> = { message, chatId: chatSessionId };
  if (chatAgentLocked) payload.agentId = chatAgentLocked;
  else if (pendingAgentId) payload.agentId = pendingAgentId;
  try {
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (_) {}
  pollChat().finally(schedulePoll);
  if (chatInput) chatInput.focus();
}

async function interruptCurrent(opts?: { sendAfter?: boolean }) {
  try {
    await fetch("/api/chat/interrupt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chatSessionId }),
    });
  } catch (_) {}
  if (opts?.sendAfter && chatInput && (chatInput.value || "").trim()) {
    await sendChat();
  } else {
    await pollChat();
  }
  schedulePoll();
}

// ── Chat name inputs ─────────────────────────────────────────────────────────
function wireChatNameInput(el: HTMLInputElement | null, peerSel: string) {
  if (!el) return;
  el.dataset.committed = el.value || "";
  const commit = () => {
    const v = (el.value || "").trim();
    if (!chatSessionId) return;
    if (v === (el.dataset.committed || "")) return;
    el.dataset.committed = v;
    const peer = peerSel ? document.querySelector<HTMLInputElement>(peerSel) : null;
    if (peer) { peer.value = v; peer.dataset.committed = v; }
    submitChatRename(chatSessionId, v).then(() => loadChatList()).catch(() => {});
  };
  el.addEventListener("blur", commit);
  el.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); commit(); el.blur(); }
  });
}

// ── Mount / unmount ──────────────────────────────────────────────────────────
function onVisibilityChange() { if (document.visibilityState === "visible") pollChat(); }

onMounted(() => {
  chatMessages = $("chat-messages");
  chatInput = $("chat-input") as HTMLTextAreaElement | null;
  chatSend = $("chat-send") as HTMLButtonElement | null;
  chatForm = $("chat-form") as HTMLFormElement | null;

  // Check if the task launcher injected a session id (launchChatForTask from TasksPage)
  const injectedSessionId = (window as Window & { __chatSessionId?: string }).__chatSessionId;
  const injectedAgentId = (window as Window & { __pendingAgentId?: string }).__pendingAgentId;

  if (injectedSessionId) {
    chatSessionId = injectedSessionId;
    localStorage.setItem(CHAT_ID_KEY, injectedSessionId);
    if (injectedAgentId) pendingAgentId = injectedAgentId;
    // Clear the globals so future navigations start fresh
    delete (window as Window & { __chatSessionId?: string }).__chatSessionId;
    delete (window as Window & { __pendingAgentId?: string }).__pendingAgentId;
  } else {
    chatSessionId = localStorage.getItem(CHAT_ID_KEY) || generateChatId();
  }
  window.__chatSessionId = chatSessionId;
  window.__chatHistory = chatHistory;

  // WAL-149: honour a thread switch requested while this page is already mounted.
  window.addEventListener("caravel:chat-thread", onChatThreadRequest);

  // Wire up the name inputs
  wireChatNameInput($("chat-name-input") as HTMLInputElement | null, "#chat-new-title-input");
  wireChatNameInput($("chat-new-title-input") as HTMLInputElement | null, "#chat-name-input");

  // Session badge — copy session id on click
  const badge = $("chat-session-badge");
  if (badge) {
    badge.addEventListener("click", () => {
      const sid = (badge as HTMLElement & { dataset: DOMStringMap }).dataset.sessionId || "";
      if (!sid) return;
      try { navigator.clipboard.writeText(sid); } catch (_) {}
      const original = badge.textContent;
      badge.textContent = "copied";
      setTimeout(() => { badge.textContent = original; }, 900);
    });
  }

  // History picker toggle handled reactively via showPicker ref.

  // Delete button
  const deleteBtn = $("chat-delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!chatSessionId || chatHistory.length === 0) { startNewChat(); return; }
      const n = chatHistory.length;
      const suffix = n === 1 ? " message" : " messages";
      if (!window.confirm("Delete this chat? " + n + suffix + " will be permanently removed.")) return;
      const idToDelete = chatSessionId;
      try {
        await fetch("/api/chats/" + encodeURIComponent(idToDelete), { method: "DELETE" });
      } catch (_) {}
      startNewChat();
    });
  }

  // Form submit
  if (chatForm) {
    chatForm.addEventListener("submit", (e) => { e.preventDefault(); sendChat(); });
  }

  // Interrupt button
  const interruptBtn = $("chat-interrupt") as HTMLButtonElement | null;
  if (interruptBtn) {
    interruptBtn.addEventListener("click", () => {
      interruptBtn.disabled = true;
      interruptCurrent({ sendAfter: true });
    });
  }

  // Input auto-resize and draft persistence
  if (chatInput) {
    chatInput.addEventListener("input", autoResizeChatInput);
    chatInput.addEventListener("input", () => {
      chatStore.saveDraft(chatSessionId, chatInput!.value);
    });
    // Restore draft from previous session or tab switch
    const savedDraft = chatStore.getDraft(chatSessionId);
    if (savedDraft) {
      chatInput.value = savedDraft;
      autoResizeChatInput();
    }
  }

  // Visibility change — resume polling when tab becomes visible
  document.addEventListener("visibilitychange", onVisibilityChange);

  // voice:read-aloud-toggle — read the latest assistant message on demand, or stop.
  document.addEventListener("voice:read-aloud-toggle", onReadAloudToggle);

  // Focus chat input and scroll to bottom when navigating to chat
  if (chatInput) chatInput.focus();
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;

  // Bootstrap: load agents, then chat, then start polling
  loadAgents().then(() => loadChatFromServer()).finally(schedulePoll);
});

onBeforeUnmount(() => {
  if (chatPollTimer) { clearTimeout(chatPollTimer); chatPollTimer = null; }
  window.removeEventListener("caravel:chat-thread", onChatThreadRequest);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  document.removeEventListener("voice:read-aloud-toggle", onReadAloudToggle);
  stopReadAloud();
  // Clear the global read-aloud text so the button disables on navigation away.
  ui.raText = null;
  ui.raFilePath = null;
});
</script>

<template>
  <div id="chat-panel" class="chat-panel">
    <div class="chat-toolbar">
      <div class="chat-toolbar-left">
        <button id="chat-history-btn" class="chat-toolbar-btn" type="button" title="Chats" @click="showPicker = !showPicker">Chats</button>
        <span id="chat-agent-badge" class="chat-agent-badge" hidden></span>
        <input id="chat-name-input" class="chat-name-input" type="text" title="Chat title" autocomplete="off" hidden />
      </div>
      <button id="chat-session-badge" class="chat-session-badge" type="button" hidden title="Click to copy full session id"></button>
      <button id="chat-delete" class="chat-toolbar-btn chat-delete-btn" type="button" title="Delete this chat" aria-label="Delete chat">🗑</button>
      <ChatPicker
        v-if="showPicker"
        :active-chat-id="chatSessionId ?? ''"
        @open="(id) => { void switchToChat(id); }"
        @new="startNewChat"
        @rename="handlePickerRename"
        @resync="() => pollChat({ force: true })"
        @close="showPicker = false"
      />
    </div>
    <div id="chat-messages" class="chat-messages"></div>
    <div class="chat-input-area">
      <input id="chat-new-title-input" class="chat-new-title-input" type="text" placeholder="Chat name/title" autocomplete="off" hidden />
      <form id="chat-form" class="chat-form">
        <textarea
          id="chat-input"
          class="chat-input"
          placeholder="Message..."
          rows="3"
          autocomplete="off"
        ></textarea>
        <div class="chat-actions">
          <button id="chat-interrupt" class="chat-interrupt" type="button" hidden title="Stop current run" aria-label="Interrupt">✋</button>
          <button id="chat-send" class="chat-send" type="submit" title="Send message" aria-label="Send">↑</button>
        </div>
        <button id="chat-cancel" class="chat-cancel" type="button" hidden>Cancel</button>
      </form>
    </div>
  </div>
</template>
