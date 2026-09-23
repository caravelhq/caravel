import { defineStore } from "pinia";
import { ref, reactive } from "vue";

export const useDashboardStore = defineStore("dashboard", () => {
  const clockFormat = ref<"12" | "24">(
    localStorage.getItem("clock.format") === "12" ? "12" : "24"
  );
  // Using a reactive object as a Set proxy so mutations are tracked.
  const collapsedSections = reactive<Record<string, boolean>>({});

  function toggleSection(key: string): void {
    collapsedSections[key] = !collapsedSections[key];
  }

  function isCollapsed(key: string): boolean {
    return !!collapsedSections[key];
  }

  return { clockFormat, collapsedSections, toggleSection, isCollapsed };
});
