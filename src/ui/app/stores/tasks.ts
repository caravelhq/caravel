import { defineStore } from "pinia";
import { ref } from "vue";

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
  const view = ref<TasksView>("projects");
  const filter = ref<TasksFilter>("all");
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
  const pane = ref<RightPaneMode>("empty");
  // Whether the sidebar picker is collapsed (mobile/narrow).
  const pickerCollapsed = ref(false);
  // Currently-viewed task ID.
  const currentTaskId = ref<string | null>(null);
  // Project slug of the currently-viewed task.
  const currentTaskProject = ref<string | null>(null);
  // Task/report view mode.
  const currentViewMode = ref<"task" | "report">("task");
  // Currently-viewed project slug.
  const currentProjectSlug = ref<string | null>(null);
  // Back-stack: project slug to return to after viewing a task from a project panel.
  const taskFromProjectSlug = ref<string | null>(null);
  // Whether tasks have been loaded at least once.
  const loaded = ref(false);

  return {
    view, filter, cache, expanded, collapsed,
    bulkSelected, multiSelectActive, pane, pickerCollapsed,
    currentTaskId, currentTaskProject, currentViewMode,
    currentProjectSlug, taskFromProjectSlug, loaded,
  };
});
