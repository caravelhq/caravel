import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ChatMessage } from "../../services/chats";

// ── Types ─────────────────────────────────────────────────────────────────────

// Transient per-chat state — populated when a chat is opened/fetched, not persisted.
interface ChatEntry {
  messages: ChatMessage[];
  agent: string | null;
  updatedAt: string | null;
  isSending: boolean;
}

// Persisted as one blob (DEC-0034). Survives reload.
interface PersistedState {
  drafts: Record<string, string>;
  lastRead: Record<string, string>;  // chatId → updatedAt at time of last activation
  lastActivatedChatId: string | null;
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STORE_KEY = "chat.store";

// Migration: absorb the old chat.drafts key on first load.
function loadPersisted(): PersistedState {
  const base: PersistedState = { drafts: {}, lastRead: {}, lastActivatedChatId: null };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      base.drafts = (typeof parsed.drafts === "object" && parsed.drafts !== null)
        ? parsed.drafts as Record<string, string>
        : {};
      base.lastRead = (typeof parsed.lastRead === "object" && parsed.lastRead !== null)
        ? parsed.lastRead as Record<string, string>
        : {};
      base.lastActivatedChatId = typeof parsed.lastActivatedChatId === "string"
        ? parsed.lastActivatedChatId
        : null;
    } else {
      // One-time migration from the old chat.drafts key.
      const legacyRaw = localStorage.getItem("chat.drafts");
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw);
        if (typeof parsed === "object" && parsed !== null) {
          base.drafts = parsed as Record<string, string>;
        }
        localStorage.removeItem("chat.drafts");
      }
    }
  } catch { /* silent */ }
  return base;
}

function persistState(
  drafts: Record<string, string>,
  lastRead: Record<string, string>,
  lastActivatedChatId: string | null,
): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ drafts, lastRead, lastActivatedChatId }));
  } catch { /* silent */ }
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useChatStore = defineStore("chat", () => {
  const _p = loadPersisted();

  // Transient per-chat entries keyed by chat id.
  const entries = ref<Record<string, ChatEntry>>({});

  // Persisted.
  const _drafts = ref<Record<string, string>>(_p.drafts);
  const lastRead = ref<Record<string, string>>(_p.lastRead);
  const lastActivatedChatId = ref<string | null>(_p.lastActivatedChatId);

  function _persist(): void {
    persistState(_drafts.value, lastRead.value, lastActivatedChatId.value);
  }

  // ── Per-chat entry management ────────────────────────────────────────────────

  function setMessages(chatId: string, messages: ChatMessage[]): void {
    const existing = entries.value[chatId];
    entries.value = {
      ...entries.value,
      [chatId]: { ...existing, messages, isSending: existing?.isSending ?? false, agent: existing?.agent ?? null, updatedAt: existing?.updatedAt ?? null },
    };
  }

  function setMeta(chatId: string, meta: { agent?: string | null; updatedAt?: string | null }): void {
    const existing = entries.value[chatId] ?? { messages: [], isSending: false, agent: null, updatedAt: null };
    entries.value = {
      ...entries.value,
      [chatId]: { ...existing, ...meta },
    };
  }

  function setSending(chatId: string, sending: boolean): void {
    const existing = entries.value[chatId] ?? { messages: [], isSending: false, agent: null, updatedAt: null };
    entries.value = { ...entries.value, [chatId]: { ...existing, isSending: sending } };
  }

  // Patch messages by identity (DEC-0049 / step 4).
  // Reuses same object references for unchanged messages so Vue's v-for skips
  // re-rendering those elements — removing N3's 2-second steady-state blocks.
  // Fires window.__vmOnAssistantChunk for the last changed assistant message
  // (DEC-0051). Uses Math.max length to preserve optimistic messages the server
  // hasn't echoed yet (e.g., a pending user message added by onSend).
  function patchMessages(chatId: string, incoming: ChatMessage[]): void {
    const existing = entries.value[chatId];
    if (!existing) {
      setMessages(chatId, incoming);
      return;
    }
    const current = existing.messages;
    const len = Math.max(current.length, incoming.length);
    const patched: ChatMessage[] = [];
    let lastChangedAssistant: ChatMessage | null = null;

    for (let i = 0; i < len; i++) {
      const src = incoming[i];
      const dst = current[i];
      if (!src) {
        // Current has a message the server didn't return yet — keep it.
        patched.push(dst);
      } else if (!dst || dst.role !== src.role || dst.text !== src.text || dst.state !== src.state) {
        // Changed or new — new object so Vue re-renders only this element.
        const next: ChatMessage = { ...src };
        patched.push(next);
        if (src.role === "assistant") lastChangedAssistant = src;
      } else {
        // Unchanged — same reference, Vue skips the re-render.
        patched.push(dst);
      }
    }

    entries.value = {
      ...entries.value,
      [chatId]: { ...existing, messages: patched },
    };

    // Fire __vmOnAssistantChunk for voice integration (DEC-0051 step 4).
    // Contract: (text, done), fired for done/absent, streaming, background.
    if (lastChangedAssistant) {
      const st = lastChangedAssistant.state;
      const fires = !st || st === "done" || st === "streaming" || st === "background";
      if (fires) {
        const done = !st || st === "done";
        window.__vmOnAssistantChunk?.(lastChangedAssistant.text, done);
      }
    }
  }

  // ── Getters ──────────────────────────────────────────────────────────────────

  // Narrow active-work set: thinking | streaming | background — NOT sent (N1).
  // "sent" is terminal (documented at chats.ts:7); carrying it here would
  // reproduce the 109-chat 2Hz poll as a permanently-lit interrupt button.
  const hasActiveWork = computed(() => (chatId: string): boolean => {
    const msgs = entries.value[chatId]?.messages ?? [];
    return msgs.some((m) =>
      m.state === "thinking" || m.state === "streaming" || m.state === "background"
    );
  });

  const isSending = computed(() => (chatId: string): boolean => {
    return entries.value[chatId]?.isSending ?? false;
  });

  // Agent lock: true while actively working or sending.
  const isAgentLocked = computed(() => (chatId: string): boolean => {
    return hasActiveWork.value(chatId) || isSending.value(chatId);
  });

  // ── Draft management (signatures unchanged — R23 C1) ─────────────────────────

  function saveDraft(id: string, text: string): void {
    const updated = { ..._drafts.value };
    if (text) {
      updated[id] = text;
    } else {
      delete updated[id];
    }
    _drafts.value = updated;
    _persist();
  }

  function getDraft(id: string): string {
    return _drafts.value[id] ?? "";
  }

  // ── Last-read markers (DEC-0047) ──────────────────────────────────────────────

  function markRead(chatId: string, updatedAt: string): void {
    lastRead.value = { ...lastRead.value, [chatId]: updatedAt };
    _persist();
  }

  function isUnread(chatId: string, updatedAt: string): boolean {
    const read = lastRead.value[chatId];
    if (!read) return true;
    return updatedAt > read;
  }

  // ── Active chat tracking (for voice — DEC-0051 step 5) ──────────────────────

  function setLastActivatedChat(chatId: string): void {
    lastActivatedChatId.value = chatId;
    _persist();
  }

  return {
    entries,
    lastRead,
    lastActivatedChatId,
    hasActiveWork,
    isSending,
    isAgentLocked,
    setMessages,
    setMeta,
    setSending,
    patchMessages,
    saveDraft,
    getDraft,
    markRead,
    isUnread,
    setLastActivatedChat,
  };
});
