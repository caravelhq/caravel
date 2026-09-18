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
import { onMounted, onBeforeUnmount } from "vue";
import { useTasksStore } from "../stores/tasks";
import { useAttentionStore } from "../stores/attention";
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

const tasksStore = useTasksStore();
const attentionStore = useAttentionStore();

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

let attentionIntervalId: ReturnType<typeof setInterval> | null = null;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let lpStartX = 0, lpStartY = 0;

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
  if (mode === "view" || mode === "project" || mode === "new") {
    const panel = document.getElementById("tasks-panel");
    if (panel) panel.classList.add("tasks-list-hidden");
  } else {
    const panel = document.getElementById("tasks-panel");
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

// Part 2 fills this in fully — stub opens viewer section and sets ID.
function openTaskPanel(taskId: string): void {
  tasksStore.currentTaskId = taskId;
  const task = tasksStore.cache.find(t => t.id === taskId);
  if (task) tasksStore.currentTaskProject = task.project || null;
  setRightPaneMode("view");
  // taskFromProjectSlug: if we opened from a project pane, remember that.
  if (tasksStore.pane !== "project") tasksStore.taskFromProjectSlug = null;

  // Sync project button.
  if (tasksProjectBtnEl) {
    const hasProject = !!tasksStore.currentTaskProject;
    tasksProjectBtnEl.disabled = !hasProject;
    tasksProjectBtnEl.setAttribute("aria-disabled", hasProject ? "false" : "true");
  }

  // Expand ancestors so the active row is visible.
  expandAncestors(taskId, tasksStore.cache, tasksStore.expanded);

  // Part 2 loads the viewer body.
  if (window.__loadTaskDetail) window.__loadTaskDetail(taskId);
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
    if (path && window.__loadFile) window.__loadFile(path);
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
  if (cancelBtn) cancelBtn.addEventListener("click", () => setRightPaneMode("empty"));

  // Attention tiers.
  attentionStore.fetch();
  attentionIntervalId = setInterval(() => attentionStore.fetch(), 30000);

  // Expose for router / other pages.
  window.__ensureTasksLoaded = () => {
    if (!tasksStore.loaded) fetchTasks();
    else fetchTasks();
  };

  // Initial load.
  if (!tasksStore.loaded) fetchTasks();
  else renderTaskPicker();
});

onBeforeUnmount(() => {
  if (attentionIntervalId !== null) clearInterval(attentionIntervalId);
  if (longPressTimer !== null) clearTimeout(longPressTimer);
  // Remove window global to avoid leaking across page navigations.
  if (typeof window.__ensureTasksLoaded !== "undefined") {
    delete (window as unknown as Record<string, unknown>).__ensureTasksLoaded;
  }
});
</script>
