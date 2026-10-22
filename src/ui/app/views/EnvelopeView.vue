<script setup lang="ts">
/**
 * EnvelopeView.vue — Phase 4 step 1 rewrite.
 *
 * S3 subView precedence (stated here per spec):
 *   intent (ws.open { intent: { subView } })
 *     > URL query (?subView=report — not yet wired in router, reserved)
 *       > remembered (tasks.subViewMemory[taskId])
 *         > default "task"
 *
 * F4: real role="tablist" with bound :aria-selected, ≥44px hit area at 390px,
 * persistent header above the tab bar.
 *
 * WAL-116: action errors surface inline with retry; no wedge on transient failures.
 */
import { ref, computed, watch, onMounted, onActivated, onDeactivated, nextTick } from "vue";
import { useResource } from "../composables/useResource";
import { useWorkspaceStore } from "../stores/workspace";
import { useUiStore } from "../stores/ui";
import { useTasksStore } from "../stores/tasks";
import EnvelopeHeader from "./EnvelopeHeader.vue";
import TaskActions from "./TaskActions.vue";
import EnvelopeSections from "./EnvelopeSections.vue";
import ReportPane from "./ReportPane.vue";
import type { ResourceRef } from "../workspace/refs";
import type { TaskRow } from "../stores/tasks";

const props = defineProps<{ resource: ResourceRef }>();

const ws = useWorkspaceStore();
const ui = useUiStore();
const tasks = useTasksStore();

const taskId = computed((): string =>
  props.resource.kind === "envelope" ? props.resource.taskId : ""
);

const liveKey = computed((): string => `task:${taskId.value}`);

const { entry } = useResource(liveKey, {
  topics: ["tasks"],
  fetch: async () => {
    const id = taskId.value;
    if (!id) return null;
    const r = await fetch(`/api/tasks/${encodeURIComponent(id)}`);
    return r.ok ? r.json() : null;
  },
}, { keepAliveAware: true });

interface Chain { task: TaskRow | null; ancestors?: TaskRow[]; children?: TaskRow[] }

const chain = computed((): Chain | null => {
  const data = entry.value?.data as { ok?: boolean; chain?: Chain } | null | undefined;
  if (!data?.ok || !data.chain) return null;
  return data.chain;
});

const task = computed(() => chain.value?.task ?? null);
const cache = computed((): TaskRow[] =>
  chain.value ? [
    ...(chain.value.task ? [chain.value.task] : []),
    ...(chain.value.ancestors ?? []),
    ...(chain.value.children ?? []),
  ] : []
);

// ── S3: subView with intent > URL > remembered > default ──────────────────────

const subView = ref<"task" | "report">("task");

function initSubView(): void {
  const id = taskId.value;
  if (!id) return;
  // 1. Intent from ws.open call
  const intent = ws.consumeIntent(liveKey.value);
  if (intent?.subView) { subView.value = intent.subView; return; }
  // 2. URL query (?subView=report) — reserved, not yet wired in router/index.ts
  //    When wired, read route.query.subView here.
  // 3. Remembered from previous visit
  const remembered = tasks.subViewMemory.get(id);
  if (remembered) { subView.value = remembered; return; }
  // 4. Default: "task"; auto-switch to "report" on first data load if reportPath present
  subView.value = "task";
}

let hasAutoSwitched = false;
let reportRawText: string | null = null;

function setSubView(view: "task" | "report"): void {
  subView.value = view;
  tasks.subViewMemory.set(taskId.value, view);
  ui.raText = view === "report" ? reportRawText : null;
}

// Re-run on first chain data (auto-switch to report if reportPath and not yet switched)
watch(chain, (newChain) => {
  if (!hasAutoSwitched) {
    hasAutoSwitched = true;
    if (subView.value === "task" && newChain?.task?.reportPath) {
      const remembered = tasks.subViewMemory.get(taskId.value);
      if (!remembered) setSubView("report");
    }
  }
});

onMounted(() => {
  initSubView();
  nextTick(() => { /* ReportPane mounts itself */ });
});

onActivated(() => {
  // F14: restore raText when returning to a cached envelope tab (step 1 only cleared it).
  if (subView.value === "report") ui.raText = reportRawText;
});

onDeactivated(() => {
  ui.raText = null;
});

// ── Event handlers ────────────────────────────────────────────────────────────

function onOpenTask(id: string): void {
  ws.open({ kind: "envelope", taskId: id }, { preview: true });
}

function onOpenFile(ev: MouseEvent): void {
  const t = ev.target as HTMLElement;
  const btn = t.closest<HTMLElement>("[data-open-file]");
  if (!btn) return;
  ev.preventDefault();
  const path = btn.getAttribute("data-open-file") ?? "";
  if (path) ws.open({ kind: "file", path }, { preview: true });
}

function onActionDone(_action: string, _taskId: string): void {
  // The live topic subscription will refresh the task data automatically.
}

function onReportRawText(text: string | null): void {
  reportRawText = text;
  if (subView.value === "report") ui.raText = text;
}
</script>

<template>
  <div class="ev-root" @click="onOpenFile">

    <!-- F4: Persistent header above the tab bar -->
    <EnvelopeHeader
      :task="task"
      @rename="onActionDone('rename', taskId)"
      @project-change="onActionDone('project', taskId)"
    />

    <!-- F4: real role="tablist" with bound :aria-selected -->
    <div role="tablist" class="ev-tab-bar">
      <button
        role="tab"
        class="ev-tab"
        :class="{ 'is-active': subView === 'task' }"
        :aria-selected="subView === 'task'"
        @click.stop="setSubView('task')"
      >Task</button>
      <button
        role="tab"
        class="ev-tab"
        :class="{ 'is-active': subView === 'report' }"
        :aria-selected="subView === 'report'"
        @click.stop="setSubView('report')"
      >Report</button>
    </div>

    <!-- Loading state (WAL-116) -->
    <div v-if="!chain && !task" class="ev-pane ev-loading">
      <div class="task-panel-loading">Loading…</div>
    </div>

    <!-- Task pane -->
    <div v-else-if="subView === 'task'" class="ev-pane">
      <TaskActions
        :task="task"
        :cache="cache"
        @action-done="onActionDone"
      />
      <EnvelopeSections
        :chain="chain"
        @open-task="onOpenTask"
      />
    </div>

    <!-- Report pane -->
    <div v-else class="ev-pane">
      <ReportPane
        :task="task"
        @raw-text="onReportRawText"
      />
    </div>

  </div>
</template>

<style scoped>
.ev-root {
  /* WAL-138: same frame as .chat-panel / .tasks-panel so envelope tabs sit in a
     dark panel rather than directly on the page background. */
  background: var(--panel, #0f1e33);
  border: 1px solid rgba(255, 255, 255, 0.133);
  border-radius: 0;

  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.ev-tab-bar {
  display: flex;
  gap: 2px;
  padding: 6px 8px 0;
  flex-shrink: 0;
}

.ev-tab {
  /* WAL-138: matches .tasks-view-tab — the Open panel's Projects | Tasks pair.
     Flat, transparent, amber underline on the active one; no chip, no radius. */
  padding: 6px 14px 8px;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: #8aa0bd;
  font-size: 12px;
  cursor: pointer;
}
.ev-tab.is-active {
  border-bottom-color: #ffd07a;
  color: #ffe7b8;
}
@media (max-width: 640px) {
  .ev-tab { min-height: 44px; padding: 8px 16px 10px; }
}

.ev-pane {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.ev-loading {
  justify-content: center;
  align-items: center;
  padding: 20px;
}

</style>
