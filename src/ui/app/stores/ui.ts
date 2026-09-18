import { defineStore } from "pinia";
import { ref } from "vue";

export const useUiStore = defineStore("ui", () => {
  const settingsOpen = ref(false);
  const ttsEnabled = ref(true);
  const micEnabled = ref(false);
  return { settingsOpen, ttsEnabled, micEnabled };
});
