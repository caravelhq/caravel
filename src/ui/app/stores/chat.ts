import { defineStore } from "pinia";
import { ref } from "vue";

const DRAFT_KEY = "chat.drafts";

function loadDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch { return {}; }
}

function saveDrafts(drafts: Record<string, string>): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); } catch {}
}

export const useChatStore = defineStore("chat", () => {
  const chatId = ref<string | null>(null);
  const _drafts = ref<Record<string, string>>(loadDrafts());

  function saveDraft(id: string, text: string): void {
    const updated = { ..._drafts.value };
    if (text) {
      updated[id] = text;
    } else {
      delete updated[id];
    }
    _drafts.value = updated;
    saveDrafts(updated);
  }

  function getDraft(id: string): string {
    return _drafts.value[id] ?? "";
  }

  return { chatId, saveDraft, getDraft };
});
