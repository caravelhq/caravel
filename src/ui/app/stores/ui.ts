import { defineStore } from "pinia";
import { ref } from "vue";

// Carries a deferred file/directory navigation from Tasks → Files,
// so FilesPage can open the right path on mount without a window global.
export interface FilesNavRequest {
  path: string;
  kind: "file" | "dir";
  backTaskId?: string;
}

export const useUiStore = defineStore("ui", () => {
  const settingsOpen = ref(false);
  const ttsEnabled = ref(true);
  const micEnabled = ref(false);
  const filesNav = ref<FilesNavRequest | null>(null);
  const hbModalOpen = ref(false);
  const infoOpen = ref(false);
  return { settingsOpen, ttsEnabled, micEnabled, filesNav, hbModalOpen, infoOpen };
});
