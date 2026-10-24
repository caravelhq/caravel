<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { useTasksStore } from "../../stores/tasks";
import { useProjectsStore } from "../../stores/projects";
import { useWorkspaceStore } from "../../stores/workspace";
import { useAttentionStore } from "../../stores/attention";
import TaskRow from "./TaskRow.vue";
import { buildTaskTree, countNonTerminalDescendants, passesFilter, buildByParent } from "../../pages/tasks/tree";
import { createBulkBar } from "../../pages/tasks/bulk";
import { tasksListSpec } from "../../workspace/labels";
import { timeAgo } from "../../pages/tasks/helpers";
import { refKey } from "../../workspace/refs";
import type { TaskRow as TaskRowData } from "../../stores/tasks";

const tasksStore = useTasksStore();
const projectsStore = useProjectsStore();
const ws = useWorkspaceStore();
const attentionStore = useAttentionStore();

const treeEl = ref<HTMLElement | null>(null);

// DEC-0043: a picker sends detail to the OTHER split group.
// Derive which group this tasks picker is in from the workspace state.
// Pass opts.group = the other group so open() always targets across groups,
// regardless of which group currently has focus.
const pickerGroup = computed((): 0 | 1 => {
  const key = refKey({ kind: "legacy", page: "tasks" });
  const idx = ws.tabs.findIndex((t) => refKey(t) === key);
  return idx >= 0 ? ws.tabGroup(idx) : 0;
});

function openTask(taskId: string): void {
  const otherGroup = ws.splitOn ? ((1 - pickerGroup.value) as 0 | 1) : undefined;
  ws.open({ kind: "envelope", taskId }, { preview: true, ...(otherGroup !== undefined ? { group: otherGroup } : {}) });
}

function openProject(slug: string): void {
  const otherGroup = ws.splitOn ? ((1 - pickerGroup.value) as 0 | 1) : undefined;
  ws.open({ kind: "project", slug }, otherGroup !== undefined ? { group: otherGroup } : {});
}

function toggleGroup(key: string): void {
  if (tasksStore.collapsed[key]) delete tasksStore.collapsed[key];
  else tasksStore.collapsed[key] = true;
}

function toggleExpand(taskId: string): void {
  if (tasksStore.expanded[taskId]) delete tasksStore.expanded[taskId];
  else tasksStore.expanded[taskId] = true;
}

// ── "all" view flat tree ──────────────────────────────────────────────────

interface FlatRow { task: TaskRowData; depth: number; hasChildren: boolean; isExpanded: boolean; marker: string; }
interface Group { key: string; displayName: string; rows: FlatRow[]; isCollapsed: boolean; }

function flattenTree(tasks: TaskRowData[]): FlatRow[] {
  const bp = buildByParent(tasks);
  const tree = buildTaskTree(tasks);
  const result: FlatRow[] = [];
  const seen: Record<string, boolean> = {};

  function walk(node: TaskRowData, depth: number): void {
    if (seen[node.id] || depth > 32) return;
    seen[node.id] = true;
    const kids = tree.childrenOf[node.id] || [];
    const hasChildren = kids.length > 0;
    const queuedCount = countNonTerminalDescendants(node.id, bp);
    if (queuedCount > 0 && hasChildren && !tasksStore.expanded[node.id]) {
      tasksStore.expanded[node.id] = true;
    }
    const isExpanded = !!tasksStore.expanded[node.id];
    const marker = depth === 0 ? "●" : "└";
    result.push({ task: node, depth, hasChildren, isExpanded, marker });
    if (hasChildren && isExpanded) {
      for (const kid of kids) walk(kid, depth + 1);
    }
  }

  for (const root of tree.roots) walk(root, 0);
  return result;
}

const groups = computed((): Group[] => {
  if (tasksStore.view !== "all") return [];
  const filtered = tasksStore.cache.filter(t => passesFilter(t, tasksStore.filter));
  if (filtered.length === 0) return [];

  const groupMap: Record<string, TaskRowData[]> = {};
  for (const t of filtered) {
    const key = t.project || "__unassigned";
    (groupMap[key] = groupMap[key] || []).push(t);
  }

  return Object.keys(groupMap)
    .sort((a, b) => {
      if (a === "__unassigned" && b !== "__unassigned") return 1;
      if (b === "__unassigned" && a !== "__unassigned") return -1;
      const aLatest = groupMap[a].reduce((m, t) => Math.max(m, Date.parse(t.updated || "0") || 0), 0);
      const bLatest = groupMap[b].reduce((m, t) => Math.max(m, Date.parse(t.updated || "0") || 0), 0);
      return bLatest - aLatest;
    })
    .map(key => ({
      key,
      displayName: key === "__unassigned" ? "Unassigned" : key,
      rows: flattenTree(groupMap[key]),
      isCollapsed: !!tasksStore.collapsed[key],
    }));
});

const projectCards = computed(() => {
  if (tasksStore.view !== "projects") return [];
  return [...projectsStore.list].sort((a, b) => {
    const ta = a.lastTouched ? Date.parse(a.lastTouched) || 0 : 0;
    const tb = b.lastTouched ? Date.parse(b.lastTouched) || 0 : 0;
    if (tb !== ta) return tb - ta;
    return (a.slug || "").localeCompare(b.slug || "");
  });
});

// ── Bulk bar ──────────────────────────────────────────────────────────────

let bulkBarEl: HTMLElement | null = null;

function refreshTasksCache(): void {
  tasksListSpec.fetch().then((data) => {
    if (Array.isArray(data)) {
      tasksStore.cache = data;
      tasksStore.loaded = true;
    }
    attentionStore.fetch();
  }).catch(() => {});
}

function updateBulkBar(): void {
  const bar = bulkBarEl as HTMLElement & { update?: () => void } | null;
  if (bar?.update) bar.update();
}

function handleSelect(id: string, agent: string, defaultStatus: string, checked: boolean): void {
  if (checked) tasksStore.bulkSelected[id] = { agent, defaultStatus };
  else delete tasksStore.bulkSelected[id];
  updateBulkBar();
}

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let lpStartX = 0, lpStartY = 0;

onMounted(() => {
  const el = treeEl.value;
  if (!el) return;

  bulkBarEl = createBulkBar(
    el,
    () => tasksStore.bulkSelected,
    () => tasksStore.multiSelectActive,
    (v) => { tasksStore.multiSelectActive = v; },
    () => { tasksStore.bulkSelected = {}; },
    () => {},
    refreshTasksCache,
  );

  el.addEventListener("pointerdown", (ev: PointerEvent) => {
    if (ev.pointerType !== "touch") return;
    if ((ev.target as HTMLInputElement).type === "checkbox") return;
    const row = (ev.target as HTMLElement).closest(".task-tree-node");
    if (!row) return;
    lpStartX = ev.clientX; lpStartY = ev.clientY;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      tasksStore.multiSelectActive = true;
      el.classList.add("is-multiselect-active");
      updateBulkBar();
      if (navigator.vibrate) navigator.vibrate(40);
    }, 500);
  });
  el.addEventListener("pointermove", (ev: PointerEvent) => {
    if (!longPressTimer) return;
    const dx = ev.clientX - lpStartX, dy = ev.clientY - lpStartY;
    if (dx * dx + dy * dy > 64) { clearTimeout(longPressTimer); longPressTimer = null; }
  });
  const cancelLP = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
  el.addEventListener("pointerup", cancelLP);
  el.addEventListener("pointercancel", cancelLP);
});

onBeforeUnmount(() => {
  if (longPressTimer !== null) clearTimeout(longPressTimer);
  bulkBarEl = null;
});
</script>

<template>
  <div
    id="tasks-tree"
    ref="treeEl"
    class="tasks-tree"
    :class="{ 'is-multiselect-active': tasksStore.multiSelectActive }"
  >
    <!-- "all" view -->
    <template v-if="tasksStore.view === 'all'">
      <div v-if="!tasksStore.loaded" class="tasks-loading">Loading…</div>
      <div v-else-if="groups.length === 0" class="tasks-tree-empty">No tasks match this filter.</div>
      <template v-else>
        <div
          v-for="group in groups"
          :key="group.key"
          class="tasks-current-group"
          :class="{ 'is-collapsed': group.isCollapsed }"
          :data-group-id="group.key"
          :data-project-key="group.key"
        >
          <div class="tasks-current-group-head" @click="toggleGroup(group.key)">
            <span class="tasks-current-group-chevron"></span>
            <span class="tasks-current-group-name">{{ group.displayName }}</span>
            <span class="tasks-current-group-count">{{ group.rows.length }}</span>
          </div>
          <div v-if="!group.isCollapsed" class="tasks-current-group-body">
            <TaskRow
              v-for="flatRow in group.rows"
              :key="flatRow.task.id"
              :task="flatRow.task"
              :depth="flatRow.depth"
              :marker="flatRow.marker"
              :has-children="flatRow.hasChildren"
              :is-expanded="flatRow.isExpanded"
              :selectable="tasksStore.multiSelectActive"
              :checked="!!tasksStore.bulkSelected[flatRow.task.id]"
              :default-status="flatRow.task.status === 'done' ? 'closed' : 'cancelled'"
              :short-id="false"
              @open="openTask"
              @select="handleSelect"
              @toggle="toggleExpand"
            />
          </div>
        </div>
      </template>
    </template>

    <!-- "projects" view -->
    <template v-else>
      <div v-if="!projectsStore.listLoaded" class="tasks-loading">Loading projects…</div>
      <div v-else-if="projectCards.length === 0" class="tasks-current-empty">
        No projects yet. Tag a task with <code>project: &lt;slug&gt;</code>.
      </div>
      <div v-else class="tasks-projects-grid">
        <div
          v-for="card in projectCards"
          :key="card.slug"
          class="tasks-project-card"
          role="button"
          tabindex="0"
          :data-project-slug="card.slug"
          @click="openProject(card.slug)"
          @keydown.enter.prevent="openProject(card.slug)"
        >
          <div class="tasks-project-card-head">
            <div class="tasks-project-card-name">{{ card.title || card.slug || '(Unassigned)' }}</div>
            <span v-if="card.jira" class="tasks-project-card-jira">{{ card.jira }}</span>
            <span v-if="card.status" class="tasks-project-card-status">{{ card.status }}</span>
          </div>
          <div v-if="card.slug && card.title" class="tasks-project-card-slug">{{ card.slug }}</div>
          <div class="tasks-project-card-counts">
            <span class="count count-active">{{ card.counts?.active ?? 0 }} active</span>
            <span class="count count-done">{{ card.counts?.doneNotClosed ?? 0 }} done</span>
            <span class="count count-stuck">{{ card.counts?.stuck ?? 0 }} stuck</span>
            <span class="count count-closed">{{ card.counts?.closed ?? 0 }} closed</span>
          </div>
          <div class="tasks-project-card-foot">
            <span class="tasks-project-card-touched">{{ card.lastTouched ? timeAgo(card.lastTouched) : 'no activity' }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
