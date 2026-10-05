import { defineStore } from "pinia";
import { ref, watch } from "vue";

// Carries a deferred file/directory navigation from Tasks → Files,
// so FilesPage can open the right path on mount without a window global.
export interface FilesNavRequest {
  path: string;
  kind: "file" | "dir";
  backTaskId?: string;
}

const LS_MIC = "voice.micEnabled";
const LS_TTS = "voice.ttsEnabled";

function lsBool(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "1";
}

export const useUiStore = defineStore("ui", () => {
  const settingsOpen = ref(false);
  const ttsEnabled = ref(lsBool(LS_TTS, true));
  const micEnabled = ref(lsBool(LS_MIC, false));
  const filesNav = ref<FilesNavRequest | null>(null);
  const hbModalOpen = ref(false);
  const infoOpen = ref(false);
  const audioModalOpen = ref(false);

  watch(micEnabled, (v) => { localStorage.setItem(LS_MIC, v ? "1" : "0"); });
  watch(ttsEnabled, (v) => { localStorage.setItem(LS_TTS, v ? "1" : "0"); });

  async function initVoice(): Promise<void> {
    try {
      const res = await fetch("/api/settings/voice");
      const data = await res.json();
      if (!data.ok) return;
      const v = data.voice ?? {};
      if (typeof v.micEnabled === "boolean") micEnabled.value = v.micEnabled;
      if (typeof v.ttsEnabled === "boolean") ttsEnabled.value = v.ttsEnabled;
    } catch (_) {}
  }

  async function setMicEnabled(val: boolean): Promise<void> {
    micEnabled.value = val;
    try {
      await fetch("/api/settings/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ micEnabled: val }),
      });
    } catch (_) {}
  }

  async function setTtsEnabled(val: boolean): Promise<void> {
    ttsEnabled.value = val;
    try {
      await fetch("/api/settings/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsEnabled: val }),
      });
    } catch (_) {}
  }

  return {
    settingsOpen,
    ttsEnabled,
    micEnabled,
    filesNav,
    hbModalOpen,
    infoOpen,
    audioModalOpen,
    initVoice,
    setMicEnabled,
    setTtsEnabled,
  };
});
