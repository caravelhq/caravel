import { defineStore } from "pinia";
import { ref, watch } from "vue";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem("tasks." + key);
    if (v === null) return fallback;
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try { localStorage.setItem("tasks." + key, JSON.stringify(value)); } catch {}
}

export interface TaskRow {
  id: string;
  parent?: string | null;
  agent?: string;
  to?: string;
  from?: string;
  headline?: string;
  brief?: string;
  kind?: string;
  priority?: string;
  status?: string;
  project?: string | null;
  updated?: string;
  created?: string;
  closed?: { status: string; at?: string; by?: string; reason?: string } | null;
  reportPath?: string;
  deliverables?: string[];
  envelopePath?: string;
  bucket?: string;
  summary?: { brief?: string; response?: string };
  context?: string[];
}

export type TasksView = "projects" | "all";
export type TasksFilter = "all" | "open" | "waiting" | "done" | "failed";
export type RightPaneMode = "empty" | "view" | "new" | "project";

export const useTasksStore = defineStore("tasks", () => {
  const view = ref<TasksView>(load<TasksView>("view", "projects"));
  const filter = ref<TasksFilter>(load<TasksFilter>("filter", "all"));
  const cache = ref<TaskRow[]>([]);
  // Per-parent expand state in the picker tree. Persists across re-renders.
  const expanded = ref<Record<string, boolean>>({});
  // Per-project-group collapse state in the "all" view.
  const collapsed = ref<Record<string, boolean>>({});
  // Multi-select close: taskId → { agent, defaultStatus }
  const bulkSelected = ref<Record<string, { agent: string; defaultStatus: string }>>({});
  // Mobile long-press multi-select mode active flag.
  const multiSelectActive = ref(false);
  // Right-pane mode (empty | view | new | project).
  const pane = ref<RightPaneMode>(load<RightPaneMode>("pane", "empty"));
  // Whether the sidebar picker is collapsed (mobile/narrow).
  const pickerCollapsed = ref(false);
  // Currently-viewed task ID.
  const currentTaskId = ref<string | null>(load<string | null>("currentTaskId", null));
  // Project slug of the currently-viewed task.
  const currentTaskProject = ref<string | null>(null);
  // Task/report view mode.
  const currentViewMode = ref<"task" | "report">("task");
  // Currently-viewed project slug.
  const currentProjectSlug = ref<string | null>(load<string | null>("currentProjectSlug", null));
  // Back-stack: project slug to return to after viewing a task from a project panel.
  const taskFromProjectSlug = ref<string | null>(null);
  // Whether tasks have been loaded at least once.
  const loaded = ref(false);

  watch(currentTaskId, (v) => save("currentTaskId", v));
  watch(pane, (v) => save("pane", v));
  watch(currentProjectSlug, (v) => save("currentProjectSlug", v));
  watch(view, (v) => save("view", v));
  watch(filter, (v) => save("filter", v));

  return {
    view, filter, cache, expanded, collapsed,
    bulkSelected, multiSelectActive, pane, pickerCollapsed,
    currentTaskId, currentTaskProject, currentViewMode,
    currentProjectSlug, taskFromProjectSlug, loaded,
  };
});
