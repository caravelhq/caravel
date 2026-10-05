import { defineStore } from "pinia";
import { ref, watch } from "vue";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem("files." + key);
    if (v === null) return fallback;
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try { localStorage.setItem("files." + key, JSON.stringify(value)); } catch {}
}

export const useFilesStore = defineStore("files", () => {
  const currentPath = ref<string>(load<string>("currentPath", ""));
  const currentDir = ref<string>(load<string>("currentDir", "."));
  const selectedBranch = ref<string>(load<string>("selectedBranch", ""));
  const loaded = ref<boolean>(false);

  watch(currentPath, (v) => save("currentPath", v));
  watch(currentDir, (v) => save("currentDir", v));
  watch(selectedBranch, (v) => save("selectedBranch", v));

  return { currentPath, currentDir, selectedBranch, loaded };
});
