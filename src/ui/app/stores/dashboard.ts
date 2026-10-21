import { defineStore } from "pinia";
import { ref, reactive, watch } from "vue";

const COLLAPSE_KEY = "dashboard.collapsedSections";

function loadCollapsed(): Record<string, boolean> {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY);
    return v ? (JSON.parse(v) as Record<string, boolean>) : {};
  } catch { return {}; }
}

export const useDashboardStore = defineStore("dashboard", () => {
  const clockFormat = ref<"12" | "24">(
    localStorage.getItem("clock.format") === "12" ? "12" : "24"
  );
  // Persisted per-section collapse state.
  const collapsedSections = reactive<Record<string, boolean>>(loadCollapsed());

  watch(collapsedSections, (v) => {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(v)); } catch {}
  }, { deep: true });

  function toggleSection(key: string): void {
    collapsedSections[key] = !collapsedSections[key];
  }

  function isCollapsed(key: string): boolean {
    return !!collapsedSections[key];
  }

  return { clockFormat, collapsedSections, toggleSection, isCollapsed };
});
