<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import { renderMarkdown } from "../lib/markdown";

// ── Constants ────────────────────────────────────────────────────────────────
const CHAT_ID_KEY = "caravel.chat.id";
const CHAT_POLL_FAST_MS = 500;
const CHAT_POLL_IDLE_MS = 10000;

// ── Module state (per-component instance) ───────────────────────────────────
let chatHistory: Array<{ role: string; text: string; state?: string }> = [];
let chatSessionId = "";
let chatListCache: Array<{ id: string; name?: string; preview?: string; agentId?: string; messageCount?: number; updatedAt?: string }> = [];
let chatServerUpdatedAt: string | null = null;
let chatPollTimer: ReturnType<typeof setTimeout> | null = null;
let historyClickHandler: ((e: Event) => void) | null = null;
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

async function loadChatList() {
  try {
    const res = await fetch("/api/chats");
    const data = await res.json();
    if (data.ok && Array.isArray(data.chats)) {
      chatListCache = data.chats;
      renderChatList();
    }
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

// ── Chat list rendering ───────────────────────────────────────────────────────
function renderChatList() {
  const listEl = $("chat-history-list");
  if (!listEl) return;
  listEl.textContent = "";
  if (!chatListCache.length) {
    const empty = document.createElement("div");
    empty.className = "chat-history-empty";
    empty.textContent = "No saved chats";
    listEl.appendChild(empty);
    return;
  }
  for (const chat of chatListCache) {
    const isActive = chat.id === chatSessionId;
    const row = document.createElement("div");
    row.className = "chat-history-row" + (isActive ? " chat-history-row-active" : "");
    row.dataset.chatId = chat.id;

    const item = document.createElement("button");
    item.className = "chat-history-item" + (isActive ? " chat-history-active" : "");
    item.type = "button";
    item.dataset.chatId = chat.id;
    const preview = document.createElement("span");
    preview.className = "chat-history-preview";
    const agentForRow = findAgent(chat.agentId || null);
    const prefix = agentForRow && agentForRow.emoji ? agentForRow.emoji + " " : "";
    preview.textContent = prefix + (chat.name || chat.preview || "(empty)");
    const meta = document.createElement("span");
    meta.className = "chat-history-meta";
    const d = new Date(chat.updatedAt || 0);
    meta.textContent = (chat.messageCount || 0) + " msgs · " + d.toLocaleDateString();
    item.appendChild(preview);
    item.appendChild(meta);
    item.addEventListener("click", () => switchToChat(chat.id));
    row.appendChild(item);

    const renameBtn = document.createElement("button");
    renameBtn.className = "chat-history-rename-btn";
    renameBtn.type = "button";
    renameBtn.title = chat.name ? "Rename chat" : "Name this chat";
    renameBtn.setAttribute("aria-label", renameBtn.title);
    renameBtn.textContent = "✏️";
    renameBtn.addEventListener("click", (ev) => { ev.stopPropagation(); beginInlineRename(chat); });
    row.appendChild(renameBtn);

    if (isActive) {
      const syncBtn = document.createElement("button");
      syncBtn.className = "chat-history-sync-btn";
      syncBtn.type = "button";
      syncBtn.title = "Force resync from server";
      syncBtn.setAttribute("aria-label", "Force resync from server");
      syncBtn.textContent = "↻";
      syncBtn.addEventListener("click", (ev) => { ev.stopPropagation(); pollChat({ force: true }); });
      row.appendChild(syncBtn);
    }
    listEl.appendChild(row);
  }
}

function beginInlineRename(chat: { id: string; name?: string; preview?: string }) {
  const listEl = $("chat-history-list");
  if (!listEl) return;
  const row = listEl.querySelector<HTMLElement>('.chat-history-row[data-chat-id="' + chat.id + '"]');
  if (!row || row.querySelector(".chat-history-rename-input")) return;
  const item = row.querySelector<HTMLElement>(".chat-history-item");
  if (!item) return;
  item.style.display = "none";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "chat-history-rename-input";
  input.value = chat.name || "";
  input.placeholder = chat.preview || "Chat name";
  input.maxLength = 80;
  const commit = (save: boolean) => {
    if (!input.parentNode) return;
    input.disabled = true;
    if (save) {
      const name = input.value.trim();
      submitChatRename(chat.id, name).then(() => loadChatList());
    } else {
      input.remove();
      item.style.display = "";
    }
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); commit(true); }
    else if (ev.key === "Escape") { ev.preventDefault(); commit(false); }
  });
  input.addEventListener("blur", () => commit(true));
  row.insertBefore(input, row.firstChild);
  input.focus();
  input.select();
}

async function submitChatRename(id: string, name: string) {
  try {
    await fetch("/api/chats/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  } catch (_) {}
}

// ── Chat navigation ───────────────────────────────────────────────────────────
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
  const dropdown = $("chat-history-dropdown");
  if (dropdown) dropdown.hidden = true;
  loadChatList();
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
  const dropdown = $("chat-history-dropdown");
  if (dropdown) dropdown.hidden = true;
  loadChatList();
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
  }
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
  const w = window as Window & { __ttsResetAutoRead?: () => void };
  if (typeof w.__ttsResetAutoRead === "function") w.__ttsResetAutoRead();
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

  // History dropdown
  const historyBtn = $("chat-history-btn");
  const historyDropdown = $("chat-history-dropdown");
  if (historyBtn && historyDropdown) {
    historyBtn.addEventListener("click", () => {
      const showing = !historyDropdown.hidden;
      historyDropdown.hidden = showing;
      if (!showing) loadChatList();
    });
    historyClickHandler = (e: Event) => {
      if (!historyDropdown.hidden && !historyBtn.contains(e.target as Node) && !historyDropdown.contains(e.target as Node)) {
        historyDropdown.hidden = true;
      }
    };
    document.addEventListener("click", historyClickHandler);
  }

  // New chat button
  const newBtn = $("chat-new-btn");
  if (newBtn) newBtn.addEventListener("click", () => startNewChat());

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

  // Input auto-resize
  if (chatInput) chatInput.addEventListener("input", autoResizeChatInput);

  // Visibility change — resume polling when tab becomes visible
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Focus chat input and scroll to bottom when navigating to chat
  if (chatInput) chatInput.focus();
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;

  // Bootstrap: load agents, then chat, then start polling
  loadAgents().then(() => loadChatFromServer()).finally(schedulePoll);
});

onBeforeUnmount(() => {
  if (chatPollTimer) { clearTimeout(chatPollTimer); chatPollTimer = null; }
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (historyClickHandler) {
    document.removeEventListener("click", historyClickHandler);
    historyClickHandler = null;
  }
});
</script>

<template>
  <div id="chat-panel" class="chat-panel">
    <div class="chat-toolbar">
      <div class="chat-toolbar-left">
        <button id="chat-history-btn" class="chat-toolbar-btn" type="button" title="Chats">Chats</button>
        <span id="chat-agent-badge" class="chat-agent-badge" hidden></span>
        <input id="chat-name-input" class="chat-name-input" type="text" title="Chat title" autocomplete="off" hidden />
      </div>
      <button id="chat-session-badge" class="chat-session-badge" type="button" hidden title="Click to copy full session id"></button>
      <button id="chat-delete" class="chat-toolbar-btn chat-delete-btn" type="button" title="Delete this chat" aria-label="Delete chat">🗑</button>
      <div id="chat-history-dropdown" class="chat-history-dropdown" hidden>
        <div class="chat-history-head">
          <span>Saved Chats</span>
          <button id="chat-new-btn" class="chat-history-new" type="button" title="Start a new chat">+ New</button>
        </div>
        <div id="chat-history-list" class="chat-history-list"></div>
      </div>
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
