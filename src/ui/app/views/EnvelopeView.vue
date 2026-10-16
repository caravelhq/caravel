<script setup lang="ts">
import { ref, computed, watch, onMounted, onDeactivated, nextTick } from "vue";
import { useResource } from "../composables/useResource";
import { useWorkspaceStore } from "../stores/workspace";
import { useUiStore } from "../stores/ui";
import { renderPanelCard, renderReportPane, loadReportNode } from "../pages/tasks/viewer";
import type { ResourceRef } from "../workspace/refs";
import type { TaskRow } from "../stores/tasks";

const props = defineProps<{ resource: ResourceRef }>();

const ws = useWorkspaceStore();
const ui = useUiStore();

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

const subView = ref<"task" | "report">("task");

const taskPane = ref<HTMLElement | null>(null);
const reportPane = ref<HTMLElement | null>(null);

let reportRawText: string | null = null;
// Auto-switch to Report on first data load if reportPath exists (deep-link intent).
// Subsequent reloads/refetches don't override the user's chosen sub-view.
let hasAutoSwitched = false;

function stripActionForms(container: HTMLElement): void {
  container.querySelectorAll(".task-panel-next, .task-panel-chat-form, .task-panel-close-form").forEach(el => el.remove());
  container.querySelectorAll(".task-panel-card-actions > button").forEach(btn => {
    if (!btn.hasAttribute("data-done-reading-agent") && !btn.hasAttribute("data-open-task")) {
      (btn as HTMLButtonElement).remove();
    }
  });
  // De-wire project-chip so it's read-only
  container.querySelectorAll<HTMLElement>("[data-project-edit]").forEach(chip => {
    chip.removeAttribute("data-project-edit");
    chip.removeAttribute("data-project-agent");
    chip.removeAttribute("data-project-current");
    chip.removeAttribute("title");
    chip.style.cursor = "default";
  });
}

function doRenderTaskPane(): void {
  const el = taskPane.value;
  if (!el) return;
  const c = chain.value;
  if (!c || !c.task) {
    el.innerHTML = '<div class="task-panel-loading">No chain data.</div>';
    return;
  }
  const task = c.task;
  const html = renderPanelCard(task, true, task.id, [task, ...(c.ancestors ?? []), ...(c.children ?? [])]);
  el.innerHTML = html;
  stripActionForms(el);
}

function doRenderReportPane(): void {
  const el = reportPane.value;
  if (!el) return;
  const c = chain.value;
  const task = c?.task ?? null;
  if (!task?.reportPath) {
    el.innerHTML = '<div class="task-panel-loading">No report yet for this task.</div>';
    return;
  }
  el.innerHTML = renderReportPane(task);
  reportRawText = null;
  el.querySelectorAll<HTMLElement>(".task-panel-report").forEach(rn => {
    loadReportNode(rn, (rawText) => {
      reportRawText = rawText;
      if (subView.value === "report") ui.raText = rawText;
    });
  });
}

function renderAll(): void {
  doRenderTaskPane();
  doRenderReportPane();
}

// Re-render whenever chain data arrives or updates
watch(chain, (newChain) => {
  nextTick(() => {
    renderAll();
    if (!hasAutoSwitched) {
      hasAutoSwitched = true;
      if (newChain?.task?.reportPath) subView.value = "report";
    }
  });
});

onMounted(() => nextTick(renderAll));

onDeactivated(() => {
  ui.raText = null;
});

function setSubView(view: "task" | "report"): void {
  subView.value = view;
  ui.raText = view === "report" ? reportRawText : null;
}

async function handleDoneReading(agent: string, id: string, btn: HTMLButtonElement): Promise<void> {
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, reason: "", status: "closed", cascade: false }),
    });
    const data = (await res.json()) as { ok?: boolean };
    if (!data.ok) return;
  } catch {}
  finally { btn.disabled = false; }
}

function onPanelClick(ev: MouseEvent): void {
  const t = ev.target as HTMLElement;

  const doneBtn = t.closest<HTMLElement>("[data-done-reading-id]");
  if (doneBtn) {
    ev.preventDefault();
    const agent = doneBtn.getAttribute("data-done-reading-agent") ?? "";
    const id = doneBtn.getAttribute("data-done-reading-id") ?? "";
    (doneBtn as HTMLButtonElement).disabled = true;
    handleDoneReading(agent, id, doneBtn as HTMLButtonElement);
    return;
  }

  const openTaskBtn = t.closest<HTMLElement>("[data-open-task]");
  if (openTaskBtn) {
    ev.preventDefault();
    const id = openTaskBtn.getAttribute("data-open-task") ?? "";
    if (id) ws.open({ kind: "envelope", taskId: id }, { preview: true });
    return;
  }

  const openFileBtn = t.closest<HTMLElement>("[data-open-file]");
  if (openFileBtn) {
    ev.preventDefault();
    const path = openFileBtn.getAttribute("data-open-file") ?? "";
    if (path) ws.open({ kind: "file", path }, { preview: true });
    return;
  }
}
</script>

<template>
  <div class="ev-root" @click="onPanelClick">
    <div class="ev-tab-bar">
      <button
        class="ev-tab"
        :class="{ 'is-active': subView === 'task' }"
        @click.stop="setSubView('task')"
        aria-selected="subView === 'task' ? 'true' : 'false'"
      >Task</button>
      <button
        class="ev-tab"
        :class="{ 'is-active': subView === 'report' }"
        @click.stop="setSubView('report')"
        aria-selected="subView === 'report' ? 'true' : 'false'"
      >Report</button>
    </div>

    <div ref="taskPane" class="ev-pane" :hidden="subView !== 'task'"></div>
    <div ref="reportPane" class="ev-pane" :hidden="subView !== 'report'"></div>

    <div class="ev-footer">
      <button class="ev-open-tasks-btn" @click.stop="ws.open({ kind: 'legacy', page: 'tasks' })">
        Open in Tasks
      </button>
    </div>
  </div>
</template>

<style scoped>
.ev-root {
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
  padding: 4px 14px;
  border: 1px solid var(--ts-border, #3a3a3a);
  background: transparent;
  color: var(--ts-text-secondary, #aaa);
  cursor: pointer;
  border-radius: 4px 4px 0 0;
  font-size: 0.85em;
}

.ev-tab.is-active {
  background: var(--ts-surface-2, #2a2a2a);
  color: var(--ts-text, #eee);
  border-bottom-color: var(--ts-surface-2, #2a2a2a);
}

.ev-pane {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.ev-footer {
  flex-shrink: 0;
  padding: 6px 12px;
  border-top: 1px solid var(--ts-border, #3a3a3a);
  text-align: right;
}

.ev-open-tasks-btn {
  background: transparent;
  border: 1px solid var(--ts-border, #3a3a3a);
  color: var(--ts-text-secondary, #aaa);
  cursor: pointer;
  font-size: 0.8em;
  padding: 3px 10px;
  border-radius: 3px;
}

.ev-open-tasks-btn:hover {
  color: var(--ts-text, #eee);
}
</style>
