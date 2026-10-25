<script setup lang="ts">
/**
 * ProjectView.vue — Phase 4 step 2.
 * Ports renderProjectPage (projects.ts:143–239) component by component.
 *
 * Kelly's change: Active leaves row LIST is dropped.
 * summary.leaves still feeds the "Active leaves" metric count (line :168 in the original).
 *
 * No force-expand on every render (the projects.ts:217 bug):
 *   expansion state lives in stores/projects.ts and is updated only on user action.
 *
 * Doc cards open file: tabs via ws.open (data-open-file handled in template click).
 *
 * WAL-116: error state with retry for summary load.
 */
import { ref, computed, watch, onMounted } from "vue";
import { useWorkspaceStore } from "../stores/workspace";
import { useProjectsStore } from "../stores/projects";
import { useNewTaskStore } from "../stores/newTask";
import { useResource } from "../composables/useResource";
import { buildTaskTree } from "../pages/tasks/tree";
import { fmtDaysHours, timeAgo } from "../pages/tasks/helpers";
import TaskRow from "../components/tasks/TaskRow.vue";
import type { ResourceRef } from "../workspace/refs";
import type { TaskRow as TaskRowData } from "../stores/tasks";
import type { DocItem, ProjectSummary } from "../stores/projects";

const props = defineProps<{ resource: ResourceRef }>();

const ws = useWorkspaceStore();
const projects = useProjectsStore();
const nt = useNewTaskStore();

const slug = computed((): string =>
  props.resource.kind === "project" ? props.resource.slug : ""
);

// ── Live binding: project:<slug> on topic "tasks" (Step 5 wires the actual live update;
// here we just use the fetch path so the structure is already in place) ────────────────

const liveKey = computed(() => `project:${slug.value}`);

const { entry } = useResource(liveKey, {
  topics: ["tasks"],
  fetch: async () => {
    if (props.resource.kind !== "project") return null;
    const s = slug.value;
    const r = await fetch(`/api/projects/${encodeURIComponent(s)}`);
    return r.ok ? r.json() : null;
  },
}, { keepAliveAware: true });

const summary = computed((): ProjectSummary | null => {
  const data = entry.value?.data as { ok?: boolean; summary?: ProjectSummary } | null | undefined;
  return data?.ok && data.summary ? data.summary : null;
});

const loadError = computed((): string | null => entry.value?.error ?? null);

// ── Expansion + hide-closed state from store ──────────────────────────────

const expanded = computed(() => projects.getExpansion(slug.value));
const hideClosed = computed(() => projects.getHideClosed(slug.value));

function toggleExpand(taskId: string): void {
  const exp = projects.getExpansion(slug.value);
  exp[taskId] = !exp[taskId];
}

function toggleHideClosed(): void {
  projects.setHideClosed(slug.value, !hideClosed.value);
}

// ── Data shapes ───────────────────────────────────────────────────────────

const displayName = computed(() =>
  summary.value?.title || (slug.value === "" ? "(Unassigned)" : slug.value)
);

const medClose = computed(() => fmtDaysHours(summary.value?.metrics?.medianCloseTimeMs || 0));
const medAge = computed(() => fmtDaysHours(summary.value?.metrics?.medianActiveAgeMs || 0));
const leavesCount = computed(() => summary.value?.leaves?.length ?? 0);

const docs = computed(() => summary.value?.docs ?? { primary: [], fdps: [], other: [] });
const hasDocs = computed(() =>
  docs.value.primary.length > 0 || docs.value.fdps.length > 0 || docs.value.other.length > 0
);

// Family trees — filtered by hide-closed, NOT force-expanded
const familiesFiltered = computed((): TaskRowData[] => {
  const fam = summary.value?.families ?? [];
  return hideClosed.value ? fam.filter(t => !(t.closed && t.closed.status)) : fam;
});

interface FlatRow { task: TaskRowData; depth: number; hasChildren: boolean; isExpanded: boolean; }

const familyFlat = computed((): FlatRow[] => {
  if (!familiesFiltered.value.length) return [];
  const tree = buildTaskTree(familiesFiltered.value);
  const exp = expanded.value;
  const result: FlatRow[] = [];
  const seen: Record<string, boolean> = {};

  function walk(node: TaskRowData, depth: number): void {
    if (seen[node.id] || depth > 32) return;
    seen[node.id] = true;
    const kids = tree.childrenOf[node.id] || [];
    const isExpanded = !!exp[node.id];
    result.push({ task: node, depth, hasChildren: kids.length > 0, isExpanded });
    if (kids.length > 0 && isExpanded) {
      for (const kid of kids) walk(kid, depth + 1);
    }
  }

  for (const root of tree.roots) walk(root, 0);
  return result;
});

// Closed section
const closedTasks = computed((): TaskRowData[] =>
  hideClosed.value ? [] : (summary.value?.closedTasks ?? [])
);

// ── Actions ───────────────────────────────────────────────────────────────

function openNewTask(): void {
  nt.open({ project: slug.value });
}

function openFile(path: string): void {
  ws.open({ kind: "file", path }, { preview: true });
}

function onDocClick(ev: MouseEvent): void {
  const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-open-file]");
  if (!btn) return;
  ev.preventDefault();
  const path = btn.getAttribute("data-open-file") ?? "";
  if (path) openFile(path);
}

function docTitle(doc: DocItem): string {
  return doc.title || doc.filename || "(untitled)";
}

function docMeta(doc: DocItem): string {
  const parts: string[] = [];
  if (doc.doc_type) parts.push(doc.doc_type);
  if (doc.last_updated) parts.push(doc.last_updated);
  return parts.join(" · ");
}

function openTask(taskId: string): void {
  ws.open({ kind: "envelope", taskId }, { preview: true });
}

// Reload on slug change
watch(slug, () => {});  // useResource handles rebind via key watch
</script>

<template>
  <div class="pv-root" @click="onDocClick">

    <!-- Loading / error states -->
    <div v-if="!summary && !loadError" class="pv-loading">Loading…</div>
    <div v-else-if="loadError" class="pv-error">
      <span>Error loading project: {{ loadError }}</span>
    </div>

    <template v-else-if="summary">

      <!-- Head -->
      <div class="pv-head">
        <div class="pv-head-row">
          <div class="pv-title">{{ displayName }}</div>
          <span v-if="summary.jira" class="pv-jira">{{ summary.jira }}</span>
          <span v-if="summary.status" class="pv-status">{{ summary.status }}</span>
        </div>
        <div v-if="summary.title && slug && slug !== ''" class="pv-slug">{{ slug }}</div>

        <!-- Metrics (3 items; Active leaves shows count — no row list per Kelly's decision) -->
        <div class="pv-metrics">
          <span class="pv-metric">
            <span class="pv-metric-label">Median close time</span>
            <span class="pv-metric-value">{{ medClose }}</span>
          </span>
          <span class="pv-metric">
            <span class="pv-metric-label">Median active age</span>
            <span class="pv-metric-value">{{ medAge }}</span>
          </span>
          <span class="pv-metric">
            <span class="pv-metric-label">Active leaves</span>
            <span class="pv-metric-value">{{ leavesCount }}</span>
          </span>
        </div>

        <!-- Actions -->
        <div class="pv-actions">
          <button
            v-if="slug && slug !== ''"
            type="button"
            class="pv-btn pv-btn-primary"
            @click.stop="openNewTask"
          >+ New task here</button>
          <label class="pv-btn pv-hide-closed-toggle">
            <input type="checkbox" :checked="hideClosed" @change="toggleHideClosed" />
            <span>Hide closed</span>
          </label>
        </div>
      </div>

      <!-- Documents -->
      <div v-if="hasDocs" class="pv-docs">
        <div class="pv-section-head">Documents</div>
        <div class="pv-docs-grid">
          <button
            v-for="doc in docs.primary"
            :key="doc.path"
            type="button"
            class="pv-doc-card kind-primary"
            :data-open-file="doc.path"
          >
            <div class="pv-doc-title">{{ docTitle(doc) }}</div>
            <div v-if="doc.description" class="pv-doc-desc">{{ doc.description.slice(0, 140) }}</div>
            <div v-if="docMeta(doc)" class="pv-doc-meta">{{ docMeta(doc) }}</div>
          </button>
          <button
            v-for="doc in docs.fdps"
            :key="doc.path"
            type="button"
            class="pv-doc-card kind-fdp"
            :data-open-file="doc.path"
          >
            <div class="pv-doc-title">{{ docTitle(doc) }}</div>
            <div v-if="doc.description" class="pv-doc-desc">{{ doc.description.slice(0, 140) }}</div>
            <div v-if="docMeta(doc)" class="pv-doc-meta">{{ docMeta(doc) }}</div>
          </button>
        </div>
        <details v-if="docs.other.length" class="pv-docs-other">
          <summary>Other docs ({{ docs.other.length }})</summary>
          <div class="pv-docs-grid">
            <button
              v-for="doc in docs.other"
              :key="doc.path"
              type="button"
              class="pv-doc-card kind-other"
              :data-open-file="doc.path"
            >
              <div class="pv-doc-title">{{ docTitle(doc) }}</div>
              <div v-if="doc.description" class="pv-doc-desc">{{ doc.description.slice(0, 140) }}</div>
              <div v-if="docMeta(doc)" class="pv-doc-meta">{{ docMeta(doc) }}</div>
            </button>
          </div>
        </details>
      </div>

      <!-- Family trees -->
      <div v-if="familyFlat.length > 0" class="pv-section">
        <div class="pv-section-head">Family trees</div>
        <div class="pv-trees">
          <TaskRow
            v-for="flatRow in familyFlat"
            :key="flatRow.task.id"
            :task="flatRow.task"
            :depth="flatRow.depth"
            :marker="flatRow.depth === 0 ? '●' : '└'"
            :hasChildren="flatRow.hasChildren"
            :isExpanded="flatRow.isExpanded"
            @open="openTask"
            @toggle="toggleExpand"
          />
        </div>
      </div>

      <!-- Closed tasks -->
      <details v-if="closedTasks.length > 0" class="pv-section pv-closed">
        <summary class="pv-section-head">Closed ({{ closedTasks.length }})</summary>
        <div class="pv-closed-list">
          <TaskRow
            v-for="t in closedTasks"
            :key="t.id"
            :task="t"
            :depth="0"
            @open="openTask"
          />
        </div>
      </details>

    </template>
  </div>
</template>

<style scoped>
.pv-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  background: var(--panel, #0f1e33);
  border: 1px solid rgba(255, 255, 255, 0.133);
}

.pv-loading,
.pv-error {
  padding: 20px;
  color: var(--ts-text-secondary, #aaa);
  font-size: 0.85em;
}

.pv-error { color: var(--ts-error, #e07070); }

/* Head */
.pv-head {
  margin-bottom: 12px;
  border-bottom: 1px solid var(--ts-border, #3a3a3a);
  padding-bottom: 10px;
}

.pv-head-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 2px;
}

.pv-title {
  font-size: 1.1em;
  font-weight: 600;
}

.pv-jira,
.pv-status {
  font-size: 0.75em;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--ts-surface-2, #2a2a2a);
  color: var(--ts-text-secondary, #aaa);
}

.pv-slug {
  font-size: 0.75em;
  color: var(--ts-text-secondary, #aaa);
  margin-bottom: 6px;
}

.pv-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 6px 0;
}

.pv-metric {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.pv-metric-label {
  font-size: 0.7em;
  color: var(--ts-text-secondary, #aaa);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pv-metric-value {
  font-size: 0.9em;
  font-weight: 600;
}

.pv-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.pv-btn {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.82em;
  cursor: pointer;
  border: 1px solid var(--ts-border, #3a3a3a);
  background: transparent;
  color: var(--ts-text-secondary, #aaa);
}

.pv-btn-primary {
  background: var(--ts-accent, #3a6a9a);
  color: #fff;
  border-color: var(--ts-accent, #3a6a9a);
}

.pv-btn-primary:hover { opacity: 0.85; }

.pv-hide-closed-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

/* Documents */
.pv-docs {
  margin-bottom: 12px;
}

.pv-section-head {
  font-size: 0.78em;
  color: var(--ts-text-secondary, #aaa);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
  cursor: pointer;
  user-select: none;
}

.pv-docs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 6px;
  margin-bottom: 6px;
}

.pv-doc-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  background: var(--ts-surface-2, #2a2a2a);
  border: 1px solid var(--ts-border, #3a3a3a);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  color: inherit;
}

.pv-doc-card:hover { border-color: var(--ts-accent, #3a6a9a); }

.pv-doc-title { font-size: 0.82em; font-weight: 500; }
.pv-doc-desc { font-size: 0.75em; color: var(--ts-text-secondary, #aaa); }
.pv-doc-meta { font-size: 0.7em; color: var(--ts-text-secondary, #666); }

.pv-docs-other summary { font-size: 0.78em; color: var(--ts-text-secondary, #aaa); cursor: pointer; }

/* Sections */
.pv-section {
  margin-bottom: 12px;
}

.pv-trees {
  border: 1px solid var(--ts-border, #3a3a3a);
  border-radius: 4px;
  overflow: hidden;
}

.pv-tree-expand {
  display: block;
  width: 100%;
  padding: 3px 8px;
  background: transparent;
  border: none;
  color: var(--ts-text-secondary, #aaa);
  font-size: 0.75em;
  text-align: left;
  cursor: pointer;
}

.pv-tree-expand:hover { color: var(--ts-text, #eee); }

/* Closed */
.pv-closed { margin-bottom: 12px; }
.pv-closed-list {
  border: 1px solid var(--ts-border, #3a3a3a);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 4px;
}
</style>
