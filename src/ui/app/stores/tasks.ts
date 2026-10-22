import { defineStore } from "pinia";
import { ref, reactive, watch } from "vue";

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
  // Whether tasks have been loaded at least once.
  const loaded = ref(false);
  // Per-taskId sub-view memory. Session-only; not persisted.
  // Precedence in EnvelopeView: intent (ws.open) > URL > remembered > default "task".
  const subViewMemory = reactive(new Map<string, "task" | "report" | "next">());

  // Per-taskId draft for the Next sub-view composer. Survives sub-view switches,
  // tab switches, and KeepAlive eviction (8-slot cache). Cleared only on successful POST.
  const nextDraft = reactive(new Map<string, string>());

  watch(view, (v) => save("view", v));
  watch(filter, (v) => save("filter", v));

  return {
    view, filter, cache, expanded, collapsed,
    bulkSelected, multiSelectActive, loaded, subViewMemory, nextDraft,
  };
});
