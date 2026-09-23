<template>
  <div id="tasks-panel" class="tasks-panel">
    <div class="tasks-view-tabs" id="tasks-view-tabs" role="tablist" aria-label="Tasks view">
      <button type="button" class="tasks-view-tab is-active" data-view="projects" role="tab" aria-selected="true">Projects</button>
      <button type="button" class="tasks-view-tab" data-view="all" role="tab" aria-selected="false">All</button>
    </div>
    <div class="tasks-toolbar">
      <div class="tasks-toolbar-left">
        <button id="tasks-picker-toggle" class="tasks-toolbar-btn tasks-picker-toggle" type="button" aria-expanded="true" title="Show task list">List</button>
        <button id="tasks-project-btn" class="tasks-toolbar-btn" type="button" title="Go to project for this task" disabled aria-disabled="true">Project</button>
      </div>
      <div class="tasks-filter-chips" id="tasks-filter-chips" role="tablist" aria-label="Filter tasks by status">
        <button type="button" class="tasks-filter-chip is-active" data-filter="all">All</button>
        <button type="button" class="tasks-filter-chip" data-filter="open">Open</button>
        <button type="button" class="tasks-filter-chip" data-filter="waiting">Waiting</button>
        <button type="button" class="tasks-filter-chip" data-filter="done">Done</button>
        <button type="button" class="tasks-filter-chip" data-filter="failed">Failed</button>
      </div>
      <div class="tasks-toolbar-right">
        <button id="tasks-new-btn" class="tasks-toolbar-btn" type="button" title="Create a new task">+ New</button>
        <button id="tasks-refresh" class="tasks-toolbar-btn" type="button" title="Refresh" aria-label="Refresh">↻</button>
      </div>
    </div>
    <div class="tasks-split">
      <div class="tasks-sidebar" id="tasks-sidebar">
        <div id="tasks-user-blocked" class="tasks-user-blocked" hidden></div>
        <div class="tasks-tree" id="tasks-tree">
          <div class="tasks-loading">Loading…</div>
        </div>
      </div>
      <div class="tasks-content" id="tasks-content">
        <div class="tasks-viewer" id="tasks-viewer" hidden>
          <div class="tasks-viewer-head">
            <div class="tasks-viewer-headline-wrap">
              <div class="tasks-viewer-id" id="tasks-viewer-id"></div>
              <div class="tasks-viewer-headline" id="tasks-viewer-headline">Task</div>
            </div>
            <div class="tasks-viewer-status-wrap">
              <span class="tasks-viewer-status" id="tasks-viewer-status"></span>
            </div>
          </div>
          <div class="tasks-viewer-tabs" role="tablist" aria-label="Task views">
            <button type="button" class="tasks-viewer-tab is-active" data-view="task" role="tab" aria-selected="true">Task</button>
            <button type="button" class="tasks-viewer-tab" data-view="report" role="tab" aria-selected="false">Report</button>
          </div>
          <div class="tasks-viewer-body" id="tasks-viewer-body">
            <div class="task-panel-loading">Loading task…</div>
          </div>
        </div>
        <div class="tasks-project-pane" id="tasks-project-pane" hidden></div>
        <div class="tasks-empty" id="tasks-empty">Select a task on the left, or click <strong>+ New</strong> to create one.</div>
        <form class="multi-agent-new tasks-new-form" id="multi-agent-new" hidden>
          <div class="multi-agent-new-head">Create task</div>
          <div class="multi-agent-new-parent" id="multi-agent-new-parent-chip" hidden>
            <span>↳ child of <strong id="multi-agent-new-parent-id"></strong></span>
            <button type="button" class="multi-agent-new-parent-clear" id="multi-agent-new-parent-clear" title="Clear parent">✕</button>
          </div>
          <label class="multi-agent-new-block">
            <span>Headline <em class="multi-agent-new-hint">(required, ≤10 words)</em></span>
            <input id="multi-agent-new-headline" type="text" maxlength="120" placeholder="BLE plugin survey" required />
            <span class="multi-agent-new-counter" id="multi-agent-new-headline-count">0 / 10 words</span>
          </label>
          <div class="multi-agent-new-grid">
            <label class="multi-agent-new-field">
              <span>Target</span>
              <select id="multi-agent-new-to"></select>
            </label>
            <label class="multi-agent-new-field">
              <span>Project</span>
              <select id="multi-agent-new-project">
                <option value="">(auto from context)</option>
                <option value="__none__">(none / unassigned)</option>
              </select>
            </label>
          </div>
          <label class="multi-agent-new-block">
            <span>Brief</span>
            <textarea id="multi-agent-new-brief" rows="4" placeholder="Why and what — specific enough that two workers wouldn't duplicate effort." required></textarea>
          </label>
          <label class="multi-agent-new-block">
            <span>Depends on <em class="multi-agent-new-hint">(task IDs, one per line)</em></span>
            <textarea id="multi-agent-new-needs" rows="2" placeholder="TSK-2026-08-01-0001&#10;TSK-2026-08-01-0002"></textarea>
          </label>
          <details class="multi-agent-new-advanced" id="multi-agent-new-advanced">
            <summary class="multi-agent-new-advanced-toggle">▸ Advanced</summary>
            <div class="multi-agent-new-advanced-body">
              <div class="multi-agent-new-grid">
                <label class="multi-agent-new-field">
                  <span>Kind</span>
                  <select id="multi-agent-new-kind">
                    <option value="research">research</option>
                    <option value="code">code</option>
                    <option value="review">review</option>
                    <option value="summarise">summarise</option>
                    <option value="decide">decide</option>
                    <option value="other">other</option>
                  </select>
                </label>
                <label class="multi-agent-new-field">
                  <span>From</span>
                  <input id="multi-agent-new-from" type="text" value="user" />
                </label>
              </div>
              <label class="multi-agent-new-block">
                <span>Output format</span>
                <textarea id="multi-agent-new-output" rows="2" placeholder="What 'done' looks like."></textarea>
              </label>
              <label class="multi-agent-new-block">
                <span>Context (one per line — file path, jira:KEY, or URL)</span>
                <textarea id="multi-agent-new-context" rows="2" placeholder="Notes/Projects/...&#10;jira:WAL-XX"></textarea>
              </label>
            </div>
          </details>
          <div class="multi-agent-new-actions">
            <span class="multi-agent-new-status" id="multi-agent-new-status"></span>
            <button class="multi-agent-new-cancel" id="multi-agent-new-cancel" type="button">Cancel</button>
            <button class="multi-agent-new-submit" id="multi-agent-new-submit" type="submit">Dispatch</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from "vue";
import { useTasksStore } from "../stores/tasks";
import { useAttentionStore } from "../stores/attention";
import { useLiveStore } from "../stores/live";
import { renderAttentionTiers } from "./tasks/tiers";
import {
  buildTaskTree, renderTreeBranch, renderCurrentView, renderAllTasksView, expandAncestors,
} from "./tasks/tree";
import {
  createBulkBar, handleRowCheckboxChange as handleCheckboxChange, updateGroupSelectAll,
} from "./tasks/bulk";
import {
  renderProjectsView, renderProjectPage, openProjectPanel as doOpenProjectPanel,
  invalidateProjectsCache, getProjectHideClosed, setProjectHideClosed, ensureProjectsLoaded,
} from "./tasks/projects";
import {
  renderPanelCard, renderReportPane, renderTaskTree,
  loadReportNode, setActiveReportDoc, appendReportExtras,
} from "./tasks/viewer";
import { statusClass, isPanelNarrow } from "./tasks/helpers";
import { useRouter } from "vue-router";
import { useUiStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspace";

const tasksStore = useTasksStore();
const attentionStore = useAttentionStore();
const live = useLiveStore();
const ui = useUiStore();
const ws = useWorkspaceStore();

// ── DOM refs ──────────────────────────────────────────────────────────────
let tasksTreeEl: HTMLElement | null = null;
let tasksViewTabsEl: HTMLElement | null = null;
let tasksFilterChipsEl: HTMLElement | null = null;
let tasksSidebarEl: HTMLElement | null = null;
let tasksPickerToggleEl: HTMLButtonElement | null = null;
let tasksProjectBtnEl: HTMLButtonElement | null = null;
let tasksRefreshBtnEl: HTMLButtonElement | null = null;
let tasksNewBtnEl: HTMLButtonElement | null = null;
let tasksViewerEl: HTMLElement | null = null;
let tasksProjectPaneEl: HTMLElement | null = null;
let tasksEmptyEl: HTMLElement | null = null;
let tasksNewFormEl: HTMLFormElement | null = null;
let tasksUserBlockedEl: HTMLElement | null = null;
let bulkBarEl: HTMLElement | null = null;

let taskPanelBodyEl: HTMLElement | null = null;
let taskPanelHeadlineEl: HTMLElement | null = null;
let taskPanelIdEl: HTMLElement | null = null;
let taskPanelStatusEl: HTMLElement | null = null;

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let lpStartX = 0, lpStartY = 0;

const router = useRouter();
let currentTaskChain: { task?: Record<string, unknown>; ancestors?: Record<string, unknown>[]; children?: Record<string, unknown>[] } | null = null;

// Re-render the attention-tier sidebar whenever the store updates (covers mount race + 30s re-poll).
watch(() => attentionStore.tiers, (tiers) => {
  if (tasksUserBlockedEl) renderAttentionTiers(tasksUserBlockedEl, tiers);
});

// ── Picker helpers ────────────────────────────────────────────────────────

function setRightPaneMode(mode: "empty" | "view" | "new" | "project"): void {
  tasksStore.pane = mode;
  if (tasksViewerEl) tasksViewerEl.hidden = mode !== "view";
  if (tasksProjectPaneEl) tasksProjectPaneEl.hidden = mode !== "project";
  if (tasksEmptyEl) tasksEmptyEl.hidden = mode !== "empty";
  if (tasksNewFormEl) tasksNewFormEl.hidden = mode !== "new";
  if (mode !== "view") {
    // Viewer shown via part-2 — nothing to clear here yet.
  }
  // Narrow panel: switching the right pane to view/new/project means the user
  // wants to SEE it, so collapse the picker; "empty" goes back to the list.
  // Vanilla did this via setTasksPickerCollapsed (client.js:5283) and the
  // collapse class lives on .tasks-sidebar — the port put `tasks-list-hidden`
  // on #tasks-panel, where the only rule that matches it styles the filter
  // chips, so the list never actually hid. Desktop showed both panes side by
  // side, so the fault was invisible until a phone-width panel.
  // Threshold is the panel's own width, not the viewport (container-query
  // semantics), so a narrow panel inside a wide window behaves the same.
  const panel = document.getElementById("tasks-panel");
  const collapse = mode !== "empty";
  if (isPanelNarrow("tasks-panel", 1199)) {
    if (tasksSidebarEl) tasksSidebarEl.classList.toggle("tasks-sidebar-collapsed", collapse);
    if (tasksPickerToggleEl) tasksPickerToggleEl.setAttribute("aria-expanded", collapse ? "false" : "true");
    if (panel) panel.classList.toggle("tasks-list-hidden", collapse);
  } else {
    // Wide: both panes coexist — never hide the list.
    if (tasksSidebarEl) tasksSidebarEl.classList.remove("tasks-sidebar-collapsed");
    if (tasksPickerToggleEl) tasksPickerToggleEl.setAttribute("aria-expanded", "true");
    if (panel) panel.classList.remove("tasks-list-hidden");
  }
}

function updateBulkBar(): void {
  if (bulkBarEl && typeof (bulkBarEl as unknown as { update?: () => void }).update === "function") {
    (bulkBarEl as unknown as { update: () => void }).update();
  }
}

function renderTaskPicker(): void {
  if (!tasksTreeEl) return;
  const view = tasksStore.view;
  const filter = tasksStore.filter;
  const expanded = tasksStore.expanded;
  const collapsed = tasksStore.collapsed;
  const currentTaskId = tasksStore.currentTaskId;
  const bulkSelected = tasksStore.bulkSelected;
  const multiSelectActive = tasksStore.multiSelectActive;

  if (view === "projects") {
    renderProjectsView(tasksTreeEl, tasksStore.currentProjectSlug);
  } else if (view === "all") {
    renderAllTasksView(tasksTreeEl, tasksStore.cache, filter, currentTaskId, bulkSelected, expanded, collapsed);
  } else {
    // Default: current (leaf) view — rendered as project tree for "projects" default
    renderProjectsView(tasksTreeEl, tasksStore.currentProjectSlug);
  }

  // Render attention tiers.
  if (tasksUserBlockedEl) renderAttentionTiers(tasksUserBlockedEl, attentionStore.tiers);

  // Sync project button.
  if (tasksProjectBtnEl) {
    const hasProject = !!tasksStore.currentTaskProject;
    tasksProjectBtnEl.disabled = !hasProject;
    tasksProjectBtnEl.setAttribute("aria-disabled", hasProject ? "false" : "true");
  }
}

async function fetchTasks(): Promise<void> {
  if (!tasksTreeEl) return;
  tasksTreeEl.innerHTML = '<div class="tasks-loading">Loading…</div>';
  try {
    const res = await fetch("/api/tasks?limit=120", { cache: "no-store" });
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.tasks)) {
      tasksTreeEl.innerHTML = '<div class="tasks-tree-empty">Unable to load tasks.</div>';
      return;
    }
    tasksStore.cache = data.tasks;
    tasksStore.loaded = true;
    renderTaskPicker();
  } catch (err) {
    tasksTreeEl.innerHTML = '<div class="tasks-tree-empty">Error: ' + String((err as Error).message || err) + "</div>";
  }
}

async function openTaskPanel(taskId: string): Promise<void> {
  if (!taskId || !taskPanelBodyEl) return;
  const prevPane = tasksStore.pane;
  const sameTask = taskId === tasksStore.currentTaskId;
  if (prevPane === "project") tasksStore.taskFromProjectSlug = tasksStore.currentProjectSlug;
  else if (!sameTask) tasksStore.taskFromProjectSlug = null;

  tasksStore.currentTaskId = taskId;
  tasksStore.currentTaskProject = null;
  setRightPaneMode("view");

  if (taskPanelIdEl) taskPanelIdEl.textContent = taskId;
  if (taskPanelHeadlineEl) taskPanelHeadlineEl.textContent = "Loading…";
  if (taskPanelStatusEl) { taskPanelStatusEl.textContent = ""; taskPanelStatusEl.className = "tasks-viewer-status"; }
  taskPanelBodyEl.innerHTML = '<div class="task-panel-loading">Loading task…</div>';

  expandAncestors(taskId, tasksStore.cache, tasksStore.expanded);
  renderTaskPicker();

  if (tasksTreeEl) {
    tasksTreeEl.querySelectorAll(".tasks-tree-row, .tasks-current-row").forEach(r => {
      r.classList.toggle("is-active", r.getAttribute("data-task-id") === taskId);
    });
  }

  try {
    const res = await fetch("/api/tasks/" + encodeURIComponent(taskId), { cache: "no-store" });
    const data = await res.json();
    if (!data.ok || !data.chain) {
      taskPanelBodyEl.innerHTML = '<div class="task-panel-loading">Unable to load task.</div>';
      return;
    }
    currentTaskChain = data.chain;
    const task = data.chain.task;
    if (task) {
      tasksStore.currentTaskProject = task.project || null;
      if (tasksProjectBtnEl) {
        tasksProjectBtnEl.disabled = !task.project;
        tasksProjectBtnEl.setAttribute("aria-disabled", task.project ? "false" : "true");
      }
      if (taskPanelHeadlineEl) {
        taskPanelHeadlineEl.textContent = task.headline || task.brief || "Task " + taskId;
        taskPanelHeadlineEl.dataset.taskId = task.id || "";
        taskPanelHeadlineEl.dataset.agent = task.agent || task.to || "";
        taskPanelHeadlineEl.dataset.locked = task.status === "claimed" ? "true" : "false";
        taskPanelHeadlineEl.title = task.status === "claimed" ? "Cannot rename while the worker is claimed" : "Click to rename — Enter to save, Esc to cancel";
        taskPanelHeadlineEl.classList.toggle("is-editable", task.status !== "claimed");
      }
      if (taskPanelStatusEl) {
        taskPanelStatusEl.textContent = task.status || "?";
        taskPanelStatusEl.className = "tasks-viewer-status " + statusClass(task.status);
      }
    }

    const viewMode = tasksStore.currentViewMode;
    const taskHtml = task ? renderPanelCard(task, true, taskId, tasksStore.cache) : '<div class="task-panel-loading">No chain data.</div>';
    const reportHtml = task?.reportPath ? renderReportPane(task) : '<div class="task-panel-loading">No report yet for this task.</div>';

    taskPanelBodyEl.innerHTML =
      '<div class="tasks-viewer-pane" data-pane="task"' + (viewMode === "task" ? "" : " hidden") + ">" + taskHtml + "</div>" +
      '<div class="tasks-viewer-pane" data-pane="report"' + (viewMode === "report" ? "" : " hidden") + ">" + reportHtml + "</div>";

    taskPanelBodyEl.querySelectorAll<HTMLElement>(".task-panel-report").forEach(rn => loadReportNode(rn));
  } catch (err) {
    taskPanelBodyEl.innerHTML = '<div class="task-panel-loading">Error: ' + String((err as Error).message || err) + "</div>";
  }
}

async function openProjectPanel(slug: string): Promise<void> {
  tasksStore.currentProjectSlug = slug;
  setRightPaneMode("project");
  if (!tasksProjectPaneEl) return;
  tasksProjectPaneEl.innerHTML = '<div class="task-panel-loading">Loading project…</div>';
  if (tasksTreeEl) {
    tasksTreeEl.querySelectorAll(".tasks-project-card").forEach(card => {
      card.classList.toggle("is-active", card.getAttribute("data-project-slug") === slug);
    });
  }
  try {
    const res = await fetch("/api/projects/" + encodeURIComponent(slug || ""), { cache: "no-store" });
    const data = await res.json();
    if (!data.ok || !data.summary) {
      tasksProjectPaneEl.innerHTML = '<div class="task-panel-loading">Unable to load project.</div>';
      return;
    }
    renderProjectPage(
      tasksProjectPaneEl, data.summary,
      tasksStore.expanded, tasksStore.currentTaskId, tasksStore.bulkSelected
    );
  } catch (err) {
    tasksProjectPaneEl.innerHTML = '<div class="task-panel-loading">Error: ' + String((err as Error).message || err) + "</div>";
  }
}

// ── Action submit helpers ─────────────────────────────────────────────────

function setViewMode(mode: "task" | "report"): void {
  tasksStore.currentViewMode = mode;
  taskPanelBodyEl?.querySelectorAll<HTMLElement>(".tasks-viewer-pane").forEach(p => {
    p.hidden = p.getAttribute("data-pane") !== mode;
  });
  document.querySelectorAll(".tasks-viewer-tab").forEach(t => {
    const isActive = t.getAttribute("data-view") === mode;
    t.classList.toggle("is-active", isActive);
    t.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

async function submitNext(wrapper: HTMLElement | null): Promise<void> {
  if (!wrapper) return;
  const agent = wrapper.getAttribute("data-next-agent") || "";
  const taskId = wrapper.getAttribute("data-next-id") || "";
  const source = wrapper.getAttribute("data-next-source") || "revisit";
  const input = wrapper.querySelector<HTMLTextAreaElement>(".task-panel-next-input");
  const btn = wrapper.querySelector<HTMLButtonElement>(".task-panel-next-submit");
  const statusEl = wrapper.querySelector<HTMLElement>(".task-panel-next-status");
  const targetSel = wrapper.querySelector<HTMLSelectElement>(".task-panel-next-target-select");
  const headlineEl = wrapper.querySelector<HTMLInputElement>(".task-panel-next-headline-input");
  const instruction = (input?.value || "").trim();
  if (!instruction) {
    if (statusEl) { statusEl.textContent = "Type an instruction first."; statusEl.className = "task-panel-unblock-status task-panel-next-status is-error"; }
    return;
  }
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.textContent = "Spawning child…"; statusEl.className = "task-panel-unblock-status task-panel-next-status"; }
  try {
    const payload: Record<string, string> = { agent, instruction, source };
    const target = targetSel?.value;
    if (target && target !== agent) payload.target = target;
    const headline = (headlineEl?.value || "").trim();
    if (headline) payload.headline = headline;
    const res = await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/next", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!data.ok) {
      if (statusEl) { statusEl.textContent = "Error: " + (data.error || "unknown"); statusEl.className = "task-panel-unblock-status task-panel-next-status is-error"; }
      if (btn) btn.disabled = false;
      return;
    }
    if (statusEl) { statusEl.textContent = "Child " + (data.id || "?") + " queued."; statusEl.className = "task-panel-unblock-status task-panel-next-status is-ok"; }
    if (data.id) openTaskPanel(data.id);
    fetchTasks();
    attentionStore.fetch();
  } catch (err) {
    if (statusEl) { statusEl.textContent = "Error: " + String((err as Error).message || err); statusEl.className = "task-panel-unblock-status task-panel-next-status is-error"; }
    if (btn) btn.disabled = false;
  }
}

async function submitClose(wrapper: HTMLElement | null): Promise<void> {
  if (!wrapper) return;
  const agent = wrapper.getAttribute("data-close-agent") || "";
  const taskId = wrapper.getAttribute("data-close-id") || "";
  const defaultStatus = wrapper.getAttribute("data-close-default-status") || "closed";
  const input = wrapper.querySelector<HTMLTextAreaElement>(".task-panel-close-input");
  const cascadeBox = wrapper.querySelector<HTMLInputElement>(".task-panel-close-cascade-checkbox");
  const btn = wrapper.querySelector<HTMLButtonElement>(".task-panel-close-submit");
  const statusEl = wrapper.querySelector<HTMLElement>(".task-panel-close-status");
  if (!agent || !taskId) return;
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.textContent = "Closing…"; statusEl.className = "task-panel-close-status task-panel-unblock-status"; }
  try {
    const res = await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/close", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, reason: (input?.value || "").trim(), status: defaultStatus, cascade: !!cascadeBox?.checked }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (statusEl) { statusEl.textContent = "Error: " + (data.error || "unknown"); statusEl.className = "task-panel-close-status task-panel-unblock-status is-error"; }
      if (btn) btn.disabled = false;
      return;
    }
    if (statusEl) { statusEl.textContent = "Closed."; statusEl.className = "task-panel-close-status task-panel-unblock-status is-ok"; }
    openTaskPanel(taskId); fetchTasks(); attentionStore.fetch();
  } catch (err) {
    if (statusEl) { statusEl.textContent = "Error: " + String((err as Error).message || err); statusEl.className = "task-panel-close-status task-panel-unblock-status is-error"; }
    if (btn) btn.disabled = false;
  }
}

async function submitDoneReading(agent: string, taskId: string, btn: HTMLElement | null): Promise<void> {
  if (!agent || !taskId) return;
  try {
    const res = await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/close", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, reason: "", status: "closed", cascade: false }),
    });
    const data = await res.json();
    if (!data.ok) return;
    openTaskPanel(taskId); fetchTasks(); attentionStore.fetch();
  } catch (_) {}
  finally { if (btn) (btn as HTMLButtonElement).disabled = false; }
}

async function submitAbort(wrapper: HTMLElement | null): Promise<void> {
  if (!wrapper) return;
  const agent = wrapper.getAttribute("data-abort-agent") || "";
  const taskId = wrapper.getAttribute("data-abort-id") || "";
  const input = wrapper.querySelector<HTMLTextAreaElement>(".task-panel-abort-input");
  const btn = wrapper.querySelector<HTMLButtonElement>(".task-panel-abort-submit");
  const statusEl = wrapper.querySelector<HTMLElement>(".task-panel-abort-status");
  if (!agent || !taskId) return;
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.textContent = "Killing worker…"; statusEl.className = "task-panel-abort-status task-panel-unblock-status"; }
  try {
    const res = await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/abort", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, reason: (input?.value || "").trim() }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (statusEl) { statusEl.textContent = "Error: " + (data.error || "unknown"); statusEl.className = "task-panel-abort-status task-panel-unblock-status is-error"; }
      if (btn) btn.disabled = false; return;
    }
    if (statusEl) { statusEl.textContent = data.mode === "stale" ? "Cancelled (stale claim cleared)." : "Worker killed — finalising…"; statusEl.className = "task-panel-abort-status task-panel-unblock-status is-ok"; }
    setTimeout(() => { openTaskPanel(taskId); fetchTasks(); attentionStore.fetch(); }, data.mode === "stale" ? 0 : 1200);
  } catch (err) {
    if (statusEl) { statusEl.textContent = "Error: " + String((err as Error).message || err); statusEl.className = "task-panel-abort-status task-panel-unblock-status is-error"; }
    if (btn) btn.disabled = false;
  }
}

async function submitReopen(btn: HTMLElement | null): Promise<void> {
  if (!btn) return;
  const agent = btn.getAttribute("data-reopen-agent") || "";
  const taskId = btn.getAttribute("data-reopen-task") || "";
  if (!agent || !taskId) return;
  (btn as HTMLButtonElement).disabled = true;
  try {
    const res = await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/reopen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent }) });
    const data = await res.json();
    if (!data.ok) { (btn as HTMLButtonElement).disabled = false; return; }
    openTaskPanel(taskId); fetchTasks(); attentionStore.fetch();
  } catch (_) { (btn as HTMLButtonElement).disabled = false; }
}

async function submitResume(btn: HTMLElement | null): Promise<void> {
  if (!btn) return;
  const agent = btn.getAttribute("data-resume-agent") || "";
  const taskId = btn.getAttribute("data-resume-task") || "";
  if (!agent || !taskId) return;
  (btn as HTMLButtonElement).disabled = true;
  try {
    const res = await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent }) });
    const data = await res.json();
    if (!data.ok) { (btn as HTMLButtonElement).disabled = false; return; }
    openTaskPanel(taskId); fetchTasks(); attentionStore.fetch();
  } catch (_) { (btn as HTMLButtonElement).disabled = false; }
}

// Defect 7 / V11 — NEVER sends. Prefills the chat input, user presses Send.
function launchChatForTask(taskId: string, parentAgent: string, msgEl: HTMLTextAreaElement | null): void {
  if (!taskId) return;
  if (!parentAgent) return;
  const taskRoot = String(taskId).split(".")[0];
  const threadId = "task-" + taskRoot + "-" + parentAgent;
  const typedMsg = (msgEl?.value || "").trim();
  const initialMsg = typedMsg ? "Continue after " + taskId + "\n" + typedMsg : "Continue after " + taskId + "\n";
  window.__chatSessionId = threadId;
  window.__pendingAgentId = parentAgent;
  router.push("/chat").then(() => {
    setTimeout(() => {
      const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
      if (!chatInput) return;
      chatInput.value = initialMsg;
      try { chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length); } catch (_) {}
      chatInput.focus();
      chatInput.dispatchEvent(new Event("input", { bubbles: true }));
    }, 50);
  });
}

function openFollowOnForm(sourceTaskId: string, sourceAgent: string): void {
  if (!tasksNewFormEl || !sourceTaskId) return;
  const chain = currentTaskChain;
  let sourceCard: Record<string, unknown> | null = null;
  const childReviewPaths: string[] = [];
  if (chain) {
    if ((chain.task as { id?: string })?.id === sourceTaskId) {
      sourceCard = chain.task as Record<string, unknown>;
      for (const ch of chain.children || []) {
        const rp = (ch as { reportPath?: string }).reportPath;
        if (rp) childReviewPaths.push(rp);
      }
    } else {
      const all = [...(chain.ancestors || []), ...(chain.children || [])];
      sourceCard = (all.find(a => (a as { id?: string }).id === sourceTaskId) as Record<string, unknown>) || null;
    }
  }
  const contextLines: string[] = [];
  if (sourceCard?.reportPath) {
    contextLines.push(sourceCard.reportPath as string);
    for (const d of (sourceCard.deliverables as string[]) || []) contextLines.push(d);
  }
  for (const rp of childReviewPaths) { if (!contextLines.includes(rp)) contextLines.push(rp); }
  const srcHeadline = String((sourceCard?.headline as string) || sourceTaskId);
  const headlineSuggest = ("Follow-on: " + srcHeadline.split(/\s+/).filter(Boolean).slice(0, 8).join(" ")).trim();
  const briefSuggest = "Follow-on from " + sourceTaskId + " — " + srcHeadline.slice(0, 120) + ".\n\n";

  tasksNewFormEl.setAttribute("data-parent", sourceTaskId);
  const parentChipEl = document.getElementById("multi-agent-new-parent-chip");
  const parentChipIdEl = document.getElementById("multi-agent-new-parent-id");
  if (parentChipEl) parentChipEl.removeAttribute("hidden");
  if (parentChipIdEl) parentChipIdEl.textContent = sourceTaskId;
  const headlineEl = document.getElementById("multi-agent-new-headline") as HTMLInputElement | null;
  if (headlineEl) headlineEl.value = headlineSuggest;
  const briefEl = document.getElementById("multi-agent-new-brief") as HTMLTextAreaElement | null;
  if (briefEl) briefEl.value = briefSuggest;
  const ctxEl = document.getElementById("multi-agent-new-context") as HTMLTextAreaElement | null;
  if (ctxEl) ctxEl.value = contextLines.join("\n");
  if (sourceCard?.project) {
    const projEl = document.getElementById("multi-agent-new-project") as HTMLSelectElement | null;
    if (projEl) ensureProjectsLoaded(projEl).then(() => { if (projEl) projEl.value = sourceCard!.project as string; });
  }
  setRightPaneMode("new");
  headlineEl?.focus();
}

function onPanelBodyClick(ev: MouseEvent): void {
  const t = ev.target as HTMLElement;
  const nextBtn = t.closest<HTMLElement>(".task-panel-next-submit");
  if (nextBtn) { ev.preventDefault(); submitNext(nextBtn.closest(".task-panel-next")); return; }

  const throwBtn = t.closest<HTMLElement>("[data-throw-path]");
  if (throwBtn) {
    ev.preventDefault();
    const path = throwBtn.getAttribute("data-throw-path") || "";
    const kind = (throwBtn.getAttribute("data-throw-kind") || "report") as "file" | "report";
    if (path) {
      if (kind === "report") {
        const taskId = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
        ws.open({ kind: "report", taskId, path }, { side: true });
      } else {
        ws.open({ kind: "file", path }, { side: true });
      }
    }
    return;
  }

  const pillBtn = t.closest<HTMLElement>("[data-doc-pill]");
  if (pillBtn) { ev.preventDefault(); setActiveReportDoc(pillBtn.closest(".task-panel-report-pane"), pillBtn.getAttribute("data-doc-pill") || ""); return; }

  const doneReadingBtn = t.closest<HTMLElement>("[data-done-reading-id]");
  if (doneReadingBtn) {
    ev.preventDefault();
    (doneReadingBtn as HTMLButtonElement).disabled = true;
    submitDoneReading(doneReadingBtn.getAttribute("data-done-reading-agent") || "", doneReadingBtn.getAttribute("data-done-reading-id") || "", doneReadingBtn);
    return;
  }

  const toggleCloseBtn = t.closest("[data-toggle-close]");
  if (toggleCloseBtn) {
    ev.preventDefault();
    const closeForm = toggleCloseBtn.closest(".task-panel-card")?.querySelector<HTMLElement>(".task-panel-close-form");
    if (closeForm) { closeForm.hidden = false; closeForm.querySelector<HTMLElement>(".task-panel-close-input")?.focus(); closeForm.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    return;
  }
  const closeSubmitBtn = t.closest(".task-panel-close-submit");
  if (closeSubmitBtn) { ev.preventDefault(); submitClose(closeSubmitBtn.closest(".task-panel-close-form")); return; }
  const closeCancelBtn = t.closest(".task-panel-close-cancel");
  if (closeCancelBtn) { ev.preventDefault(); const f = closeCancelBtn.closest<HTMLElement>(".task-panel-close-form"); if (f) f.hidden = true; return; }

  const toggleAbortBtn = t.closest("[data-toggle-abort]");
  if (toggleAbortBtn) {
    ev.preventDefault();
    const abortForm = toggleAbortBtn.closest(".task-panel-card")?.querySelector<HTMLElement>(".task-panel-abort-form");
    if (abortForm) { abortForm.hidden = false; abortForm.querySelector<HTMLElement>(".task-panel-abort-input")?.focus(); abortForm.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    return;
  }
  const abortSubmitBtn = t.closest(".task-panel-abort-submit");
  if (abortSubmitBtn) { ev.preventDefault(); submitAbort(abortSubmitBtn.closest(".task-panel-abort-form")); return; }
  const abortCancelBtn = t.closest(".task-panel-abort-cancel");
  if (abortCancelBtn) { ev.preventDefault(); const f = abortCancelBtn.closest<HTMLElement>(".task-panel-abort-form"); if (f) f.hidden = true; return; }

  const reopenBtn = t.closest<HTMLElement>("[data-reopen-task]");
  if (reopenBtn) { ev.preventDefault(); submitReopen(reopenBtn); return; }
  const resumeBtn = t.closest<HTMLElement>("[data-resume-task]");
  if (resumeBtn) { ev.preventDefault(); submitResume(resumeBtn); return; }

  const followonBtn = t.closest("[data-followon-task]");
  if (followonBtn) {
    ev.preventDefault();
    const continueForm = taskPanelBodyEl?.querySelector<HTMLElement>(".task-panel-next");
    if (continueForm) {
      continueForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
      continueForm.querySelector<HTMLElement>(".task-panel-next-input")?.focus();
      const det = continueForm.closest("details"); if (det) det.open = true;
    } else {
      openFollowOnForm(followonBtn.getAttribute("data-followon-task") || "", followonBtn.getAttribute("data-followon-agent") || "");
    }
    return;
  }

  const openTaskBtn = t.closest("[data-open-task]");
  if (openTaskBtn) { ev.preventDefault(); openTaskPanel(openTaskBtn.getAttribute("data-open-task") || ""); return; }

  const openFileBtn = t.closest("[data-open-file]");
  if (openFileBtn) {
    ev.preventDefault();
    const filePath = openFileBtn.getAttribute("data-open-file");
    if (!filePath) return;
    // Alt-click → open as side tab. Plain click → Files panel.
    if ((ev as MouseEvent).altKey) {
      const taskId = filePath.split("/").pop()?.replace(/\.md$/, "") ?? filePath;
      ws.open({ kind: "report", taskId, path: filePath }, { side: true });
    } else {
      ui.filesNav = { path: filePath, kind: "file", backTaskId: tasksStore.currentTaskId || undefined };
      router.push("/files");
    }
    return;
  }

  const openFolderBtn = t.closest("[data-open-folder]");
  if (openFolderBtn) {
    ev.preventDefault();
    const folderPath = openFolderBtn.getAttribute("data-open-folder") || ".";
    ui.filesNav = { path: folderPath, kind: "dir", backTaskId: tasksStore.currentTaskId || undefined };
    router.push("/files");
    return;
  }

  const toggleChatBtn = t.closest("[data-toggle-chat]");
  if (toggleChatBtn) {
    ev.preventDefault();
    const chatCard = toggleChatBtn.closest(".task-panel-card");
    const chatFormEl = chatCard?.querySelector<HTMLElement>(".task-panel-chat-form");
    const chatAgent = chatFormEl?.getAttribute("data-chat-parent-agent") || "";
    const chatMsgEl = chatFormEl?.querySelector<HTMLTextAreaElement>(".task-panel-chat-msg-input") || null;
    launchChatForTask(toggleChatBtn.getAttribute("data-toggle-chat") || "", chatAgent, chatMsgEl);
    return;
  }
}

// ── New-task form ─────────────────────────────────────────────────────────

let agentsCache: Array<{ name: string; emoji?: string; displayName?: string }> = [];

async function loadAgentsForForm(): Promise<void> {
  try {
    const res = await fetch("/api/agents");
    const data = await res.json();
    if (data?.ok && Array.isArray(data.agents)) agentsCache = data.agents;
  } catch (_) {}
  populateTaskTargetSelect();
}

function populateTaskTargetSelect(): void {
  const sel = document.getElementById("multi-agent-new-to") as HTMLSelectElement | null;
  if (!sel) return;
  const prev = sel.value;
  const coord = agentsCache.find(a => a.name === "alice");
  const rest = agentsCache.filter(a => a.name !== "alice");
  const ordered = coord ? [coord, ...rest] : rest;
  sel.innerHTML = ordered.map(a => {
    const label = (a.emoji ? a.emoji + " " : "") + (a.displayName || a.name);
    return `<option value="${label.replace(/"/g, "&quot;")}">${label}</option>`.replace(/value="[^"]*"/, `value="${a.name.replace(/"/g, "&quot;")}"`);
  }).join("");
  if (prev) sel.value = prev;
}

function updateHeadlineCount(): void {
  const input = document.getElementById("multi-agent-new-headline") as HTMLInputElement | null;
  const counter = document.getElementById("multi-agent-new-headline-count");
  if (!input || !counter) return;
  const words = (input.value || "").trim().split(/\s+/).filter(Boolean).length;
  counter.textContent = words + " / 10 words";
  counter.classList.toggle("is-over", words > 10);
}

function clearParentChip(): void {
  if (!tasksNewFormEl) return;
  tasksNewFormEl.removeAttribute("data-parent");
  const chipEl = document.getElementById("multi-agent-new-parent-chip");
  const chipIdEl = document.getElementById("multi-agent-new-parent-id");
  if (chipEl) chipEl.setAttribute("hidden", "");
  if (chipIdEl) chipIdEl.textContent = "";
}

async function submitNewTask(ev: SubmitEvent): Promise<void> {
  ev.preventDefault();
  const headline = (document.getElementById("multi-agent-new-headline") as HTMLInputElement | null)?.value.trim() || "";
  const to = (document.getElementById("multi-agent-new-to") as HTMLSelectElement | null)?.value || "";
  const kind = (document.getElementById("multi-agent-new-kind") as HTMLSelectElement | null)?.value || "";
  const from = (document.getElementById("multi-agent-new-from") as HTMLInputElement | null)?.value.trim() || "user";
  const brief = (document.getElementById("multi-agent-new-brief") as HTMLTextAreaElement | null)?.value.trim() || "";
  const output = (document.getElementById("multi-agent-new-output") as HTMLTextAreaElement | null)?.value.trim() || "";
  const contextRaw = (document.getElementById("multi-agent-new-context") as HTMLTextAreaElement | null)?.value.trim() || "";
  const context = contextRaw ? contextRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  const needsRaw = (document.getElementById("multi-agent-new-needs") as HTMLTextAreaElement | null)?.value.trim() || "";
  const needs = needsRaw ? needsRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  const newStatus = document.getElementById("multi-agent-new-status");
  const submitBtn = document.getElementById("multi-agent-new-submit") as HTMLButtonElement | null;

  const headlineWords = headline.split(/\s+/).filter(Boolean).length;
  if (!headline) {
    if (newStatus) { newStatus.textContent = "Headline is required (≤10 words)."; newStatus.className = "multi-agent-new-status is-error"; }
    return;
  }
  if (headlineWords > 10) {
    if (newStatus) { newStatus.textContent = `Headline too long (${headlineWords} words; max 10).`; newStatus.className = "multi-agent-new-status is-error"; }
    return;
  }
  if (!brief) {
    if (newStatus) { newStatus.textContent = "Brief is required."; newStatus.className = "multi-agent-new-status is-error"; }
    return;
  }
  if (!to) {
    populateTaskTargetSelect();
    if (newStatus) { newStatus.textContent = "Pick a target agent."; newStatus.className = "multi-agent-new-status is-error"; }
    return;
  }

  if (newStatus) { newStatus.textContent = "Dispatching…"; newStatus.className = "multi-agent-new-status"; }
  if (submitBtn) submitBtn.disabled = true;

  try {
    const payload: Record<string, unknown> = { headline, to, from: from || "user", kind, brief, output_format: output, context };
    if (needs.length > 0) payload.needs = needs;
    const projectEl = document.getElementById("multi-agent-new-project") as HTMLSelectElement | null;
    if (projectEl) {
      const projVal = (projectEl.value || "").trim();
      if (projVal === "__none__") payload.project = null;
      else if (projVal) payload.project = projVal;
    }
    const parentAttr = tasksNewFormEl?.getAttribute("data-parent");
    if (parentAttr) payload.parent = parentAttr;

    const res = await fetch("/api/tasks/new", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!data.ok) {
      if (newStatus) { newStatus.textContent = "Error: " + (data.error || "unknown"); newStatus.className = "multi-agent-new-status is-error"; }
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (newStatus) { newStatus.textContent = "Dispatched " + data.id; newStatus.className = "multi-agent-new-status is-ok"; }
    // Reset transient fields; keep kind/to for quick re-dispatch.
    ["multi-agent-new-headline", "multi-agent-new-brief", "multi-agent-new-output", "multi-agent-new-context", "multi-agent-new-needs"].forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) el.value = "";
    });
    clearParentChip();
    updateHeadlineCount();
    if (submitBtn) submitBtn.disabled = false;
    fetchTasks();
    attentionStore.fetch();
    if (data.id) openTaskPanel(data.id);
    else setRightPaneMode("empty");
  } catch (err) {
    if (newStatus) { newStatus.textContent = "Error: " + String((err as Error).message || err); newStatus.className = "multi-agent-new-status is-error"; }
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ── Event handlers ────────────────────────────────────────────────────────

function onTreeChange(ev: Event): void {
  handleCheckboxChange(ev, tasksStore.bulkSelected, updateBulkBar);
}

function onTreeClick(ev: MouseEvent): void {
  const target = ev.target as HTMLElement;
  if (target && (target as HTMLInputElement).type === "checkbox") { ev.stopPropagation(); return; }

  const groupHead = target.closest("[data-toggle-group]");
  if (groupHead) {
    ev.preventDefault();
    const gk = groupHead.getAttribute("data-toggle-group");
    if (gk) {
      if (tasksStore.collapsed[gk]) delete tasksStore.collapsed[gk];
      else tasksStore.collapsed[gk] = true;
      renderTaskPicker();
    }
    return;
  }

  const projectCard = target.closest(".tasks-project-card");
  if (projectCard) {
    ev.preventDefault();
    const slug = projectCard.getAttribute("data-project-slug");
    if (slug !== null) { tasksStore.taskFromProjectSlug = null; openProjectPanel(slug); }
    return;
  }

  const tierRow = target.closest("[data-open-task]");
  if (tierRow) {
    ev.preventDefault();
    const taskId = tierRow.getAttribute("data-open-task");
    if (taskId) openTaskPanel(taskId);
    return;
  }

  const chevron = target.closest("[data-toggle-expand]");
  if (chevron) {
    ev.preventDefault(); ev.stopPropagation();
    const pid = chevron.getAttribute("data-toggle-expand");
    if (pid) {
      if (tasksStore.expanded[pid]) delete tasksStore.expanded[pid];
      else tasksStore.expanded[pid] = true;
      renderTaskPicker();
    }
    return;
  }

  const row = target.closest(".tasks-tree-row, .tasks-current-row");
  if (row) {
    const taskId = row.getAttribute("data-task-id");
    if (taskId) openTaskPanel(taskId);
  }
}

function onTreeKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  if ((ev.target as HTMLInputElement).type === "checkbox") return;
  const row = (ev.target as HTMLElement).closest(".tasks-tree-row, .tasks-current-row");
  if (!row) return;
  ev.preventDefault();
  const taskId = row.getAttribute("data-task-id");
  if (taskId) openTaskPanel(taskId);
}

function onProjectPaneClick(ev: MouseEvent): void {
  const target = ev.target as HTMLElement;
  // Defect 2 / V10 fix: checkbox clicks handled by change event.
  if ((target as HTMLInputElement).type === "checkbox") { ev.stopPropagation(); return; }

  const docBtn = target.closest("[data-open-file]");
  if (docBtn) {
    ev.preventDefault();
    const path = docBtn.getAttribute("data-open-file");
    if (path) {
      ui.filesNav = { path, kind: "file", backTaskId: tasksStore.currentTaskId || undefined };
      router.push("/files");
    }
    return;
  }

  const newHere = target.closest("[data-project-new-task]");
  if (newHere) {
    ev.preventDefault();
    const newSlug = newHere.getAttribute("data-project-new-task");
    if (newSlug) openNewTaskFormForProject(newSlug);
    return;
  }

  const chevron = target.closest("[data-toggle-expand]");
  if (chevron) {
    ev.preventDefault(); ev.stopPropagation();
    const pid = chevron.getAttribute("data-toggle-expand");
    if (pid && tasksStore.currentProjectSlug !== null) {
      if (tasksStore.expanded[pid]) delete tasksStore.expanded[pid];
      else tasksStore.expanded[pid] = true;
      openProjectPanel(tasksStore.currentProjectSlug);
    }
    return;
  }

  const row = target.closest(".tasks-tree-row, .tasks-current-row");
  if (row) {
    const taskId = row.getAttribute("data-task-id");
    if (taskId) {
      tasksStore.taskFromProjectSlug = tasksStore.currentProjectSlug;
      openTaskPanel(taskId);
    }
  }
}

function onProjectPaneChange(ev: Event): void {
  const target = ev.target as HTMLInputElement;
  if (target.type === "checkbox" &&
      (target.classList.contains("current-row-select") || target.classList.contains("current-group-select-all"))) {
    handleCheckboxChange(ev, tasksStore.bulkSelected, updateBulkBar);
    return;
  }
  const toggle = target.closest ? (target.closest("[data-project-hide-closed]") as HTMLInputElement | null) : null;
  if (toggle) {
    const s = toggle.getAttribute("data-project-hide-closed") || "";
    setProjectHideClosed(s, toggle.checked);
    if (tasksStore.currentProjectSlug !== null) openProjectPanel(tasksStore.currentProjectSlug);
  }
}

function openNewTaskFormForProject(slug: string): void {
  if (!tasksNewFormEl) return;
  tasksNewFormEl.removeAttribute("data-parent");
  const chip = document.getElementById("multi-agent-new-parent-chip");
  const chipId = document.getElementById("multi-agent-new-parent-id");
  if (chip) chip.setAttribute("hidden", "");
  if (chipId) chipId.textContent = "";
  const projectSelect = document.getElementById("multi-agent-new-project") as HTMLSelectElement | null;
  if (projectSelect) {
    ensureProjectsLoaded(projectSelect).then(() => {
      if (slug && slug !== "__none__") projectSelect.value = slug;
    });
  }
  setRightPaneMode("new");
  const headlineEl = document.getElementById("multi-agent-new-headline") as HTMLInputElement | null;
  if (headlineEl) headlineEl.focus();
}

// ── Mount ─────────────────────────────────────────────────────────────────

onMounted(() => {
  tasksTreeEl           = document.getElementById("tasks-tree");
  tasksViewTabsEl       = document.getElementById("tasks-view-tabs");
  tasksFilterChipsEl    = document.getElementById("tasks-filter-chips");
  tasksSidebarEl        = document.getElementById("tasks-sidebar");
  tasksPickerToggleEl   = document.getElementById("tasks-picker-toggle") as HTMLButtonElement | null;
  tasksProjectBtnEl     = document.getElementById("tasks-project-btn") as HTMLButtonElement | null;
  tasksRefreshBtnEl     = document.getElementById("tasks-refresh") as HTMLButtonElement | null;
  tasksNewBtnEl         = document.getElementById("tasks-new-btn") as HTMLButtonElement | null;
  tasksViewerEl         = document.getElementById("tasks-viewer");
  tasksProjectPaneEl    = document.getElementById("tasks-project-pane");
  tasksEmptyEl          = document.getElementById("tasks-empty");
  tasksNewFormEl        = document.getElementById("multi-agent-new") as HTMLFormElement | null;
  tasksUserBlockedEl    = document.getElementById("tasks-user-blocked");
  taskPanelBodyEl       = document.getElementById("tasks-viewer-body");
  taskPanelHeadlineEl   = document.getElementById("tasks-viewer-headline");
  taskPanelIdEl         = document.getElementById("tasks-viewer-id");
  taskPanelStatusEl     = document.getElementById("tasks-viewer-status");

  // Viewer task/report tab switching.
  document.querySelectorAll(".tasks-viewer-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.getAttribute("data-view") as "task" | "report" | null;
      if (v) setViewMode(v);
    });
  });

  // Delegated click handler for the task detail panel.
  if (taskPanelBodyEl) {
    taskPanelBodyEl.addEventListener("click", onPanelBodyClick as EventListener);
  }

  // Headline click-to-edit.
  if (taskPanelHeadlineEl) {
    taskPanelHeadlineEl.addEventListener("click", async () => {
      const el = taskPanelHeadlineEl!;
      if (el.dataset.locked === "true") return;
      const taskId = el.dataset.taskId;
      if (!taskId) return;
      const current = el.textContent || "";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "tasks-viewer-headline-input";
      input.value = current;
      input.style.width = "100%";
      el.replaceWith(input);
      input.focus();
      input.select();
      const restore = () => {
        if (!input.isConnected) return;
        input.replaceWith(el);
      };
      input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const next = input.value.trim();
          if (!next || next === current) { restore(); return; }
          try {
            await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/rename", {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ headline: next }),
            });
            el.textContent = next;
          } catch (_) {}
          if (input.isConnected) restore();
        } else if (e.key === "Escape") {
          restore();
        }
      });
      input.addEventListener("blur", restore);
    });
  }

  if (tasksTreeEl) {
    bulkBarEl = createBulkBar(
      tasksTreeEl,
      () => tasksStore.bulkSelected,
      () => tasksStore.multiSelectActive,
      (v) => { tasksStore.multiSelectActive = v; },
      () => { tasksStore.bulkSelected = {}; },
      renderTaskPicker,
      fetchTasks,
    );
    tasksTreeEl.addEventListener("change", onTreeChange);
    tasksTreeEl.addEventListener("click", onTreeClick as EventListener);
    tasksTreeEl.addEventListener("keydown", onTreeKeydown as EventListener);

    // Mobile long-press → multi-select mode.
    tasksTreeEl.addEventListener("pointerdown", (ev: PointerEvent) => {
      if (ev.pointerType !== "touch") return;
      if ((ev.target as HTMLInputElement).type === "checkbox") return;
      const row = (ev.target as HTMLElement).closest(".tasks-current-row");
      if (!row) return;
      lpStartX = ev.clientX; lpStartY = ev.clientY;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        tasksStore.multiSelectActive = true;
        tasksTreeEl!.classList.add("is-multiselect-active");
        updateBulkBar();
        if (navigator.vibrate) navigator.vibrate(40);
      }, 500);
    });
    tasksTreeEl.addEventListener("pointermove", (ev: PointerEvent) => {
      if (!longPressTimer) return;
      const dx = ev.clientX - lpStartX, dy = ev.clientY - lpStartY;
      if (dx * dx + dy * dy > 64) { clearTimeout(longPressTimer); longPressTimer = null; }
    });
    const cancelLP = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
    tasksTreeEl.addEventListener("pointerup", cancelLP);
    tasksTreeEl.addEventListener("pointercancel", cancelLP);
  }

  if (tasksProjectPaneEl) {
    tasksProjectPaneEl.addEventListener("click", onProjectPaneClick as EventListener);
    tasksProjectPaneEl.addEventListener("change", onProjectPaneChange);
  }

  // Delegated click for attention-tier sidebar rows (opens task panel).
  if (tasksUserBlockedEl) {
    tasksUserBlockedEl.addEventListener("click", (ev) => {
      const row = (ev.target as HTMLElement).closest<HTMLElement>("[data-open-task]");
      if (!row) return;
      ev.preventDefault();
      const taskId = row.getAttribute("data-open-task");
      if (taskId) openTaskPanel(taskId);
    });
  }

  if (tasksViewTabsEl) {
    tasksViewTabsEl.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest(".tasks-view-tab");
      if (!btn) return;
      const v = btn.getAttribute("data-view") as "projects" | "all" | null;
      if (!v || v === tasksStore.view) return;
      tasksStore.view = v;
      tasksStore.taskFromProjectSlug = null;
      tasksViewTabsEl!.querySelectorAll(".tasks-view-tab").forEach(t => {
        const isActive = t === btn;
        t.classList.toggle("is-active", isActive);
        t.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      if (v === "projects") invalidateProjectsCache();
      else if (tasksProjectPaneEl && !tasksProjectPaneEl.hidden) {
        setRightPaneMode(tasksStore.currentTaskId ? "view" : "empty");
      }
      renderTaskPicker();
    });
  }

  if (tasksFilterChipsEl) {
    tasksFilterChipsEl.addEventListener("click", (ev) => {
      const chip = (ev.target as HTMLElement).closest(".tasks-filter-chip");
      if (!chip) return;
      const f = chip.getAttribute("data-filter") as typeof tasksStore.filter | null;
      if (!f) return;
      tasksStore.filter = f;
      tasksFilterChipsEl!.querySelectorAll(".tasks-filter-chip").forEach(c => {
        c.classList.toggle("is-active", c === chip);
      });
      renderTaskPicker();
    });
  }

  if (tasksRefreshBtnEl) {
    tasksRefreshBtnEl.addEventListener("click", () => { invalidateProjectsCache(); fetchTasks(); });
  }
  if (tasksPickerToggleEl) {
    tasksPickerToggleEl.addEventListener("click", () => {
      if (tasksSidebarEl) tasksSidebarEl.classList.remove("tasks-sidebar-collapsed");
      if (tasksPickerToggleEl) tasksPickerToggleEl.setAttribute("aria-expanded", "true");
      const panel = document.getElementById("tasks-panel");
      if (panel) panel.classList.remove("tasks-list-hidden");
    });
  }
  if (tasksProjectBtnEl) {
    tasksProjectBtnEl.addEventListener("click", () => {
      if (tasksProjectBtnEl!.disabled || !tasksStore.currentTaskProject) return;
      openProjectPanel(tasksStore.currentTaskProject);
    });
  }
  if (tasksNewBtnEl && tasksNewFormEl) {
    tasksNewBtnEl.addEventListener("click", () => {
      tasksNewFormEl!.removeAttribute("data-parent");
      const chip = document.getElementById("multi-agent-new-parent-chip");
      const chipId = document.getElementById("multi-agent-new-parent-id");
      if (chip) chip.setAttribute("hidden", "");
      if (chipId) chipId.textContent = "";
      const projectSelect = document.getElementById("multi-agent-new-project") as HTMLSelectElement | null;
      if (projectSelect) ensureProjectsLoaded(projectSelect);
      setRightPaneMode("new");
      const hl = document.getElementById("multi-agent-new-headline") as HTMLInputElement | null;
      if (hl) hl.focus();
    });
  }

  // Cancel button on new form.
  const cancelBtn = document.getElementById("multi-agent-new-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", () => {
    clearParentChip();
    const newStatusEl = document.getElementById("multi-agent-new-status");
    if (newStatusEl) newStatusEl.textContent = "";
    setRightPaneMode(tasksStore.currentTaskId ? "view" : "empty");
  });

  // Parent chip clear button.
  const parentClearBtn = document.getElementById("multi-agent-new-parent-clear");
  if (parentClearBtn) parentClearBtn.addEventListener("click", () => clearParentChip());

  // Headline word counter.
  const headlineInput = document.getElementById("multi-agent-new-headline");
  if (headlineInput) {
    headlineInput.addEventListener("input", updateHeadlineCount);
    updateHeadlineCount();
  }

  // New-task form submit.
  if (tasksNewFormEl) {
    tasksNewFormEl.addEventListener("submit", submitNewTask as EventListener);
  }

  // Load agents catalog for the target select.
  loadAgentsForForm();

  // Attention tiers — live channel replaces the 30s poll.
  // 'tasks' topic included so tree-level changes (moves, closes) also refresh the tiers.
  live.bind("attention", {
    topics: ["attention", "tasks"],
    fetch: () =>
      attentionStore.fetch().then(() => attentionStore.tiers),
  });

  // Initial load.
  if (!tasksStore.loaded) {
    fetchTasks();
  } else {
    renderTaskPicker();
    // Restore task panel if we're returning to this route with a task already open.
    if (tasksStore.pane === "view" && tasksStore.currentTaskId) {
      openTaskPanel(tasksStore.currentTaskId);
    } else if (tasksStore.pane === "project" && tasksStore.currentProjectSlug) {
      openProjectPanel(tasksStore.currentProjectSlug);
    }
  }
});

onBeforeUnmount(() => {
  live.unbind("attention");
  if (longPressTimer !== null) clearTimeout(longPressTimer);
});
</script>
