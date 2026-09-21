// projects.ts — project card grid, project pane renderer, doc cards.
// Ported from client.js:5965–6213.

import { escapeHtml, timeAgo, fmtDaysHours, shorten } from "./helpers";
import { buildTaskTree, renderTreeBranch, renderCurrentRow } from "./tree";
import type { TaskRow } from "../../stores/tasks";

export interface ProjectCard {
  slug: string;
  title?: string;
  jira?: string;
  status?: string;
  lastTouched?: string;
  counts?: { active: number; doneNotClosed: number; stuck: number; closed: number };
}

interface DocItem {
  path: string;
  title?: string;
  filename?: string;
  description?: string;
  doc_type?: string;
  last_updated?: string;
}

interface ProjectSummary {
  slug: string;
  title?: string;
  jira?: string;
  status?: string;
  metrics?: { medianCloseTimeMs?: number; medianActiveAgeMs?: number };
  leaves: TaskRow[];
  families: TaskRow[];
  closedTasks: TaskRow[];
  docs?: { primary: DocItem[]; fdps: DocItem[]; other: DocItem[] };
}

// ── localStorage helpers ─────────────────────────────────────────────────

function hideClosedKey(slug: string): string {
  return "caravel.project.hideClosed." + (slug || "__unassigned__");
}
export function getProjectHideClosed(slug: string): boolean {
  try {
    return !!(window.localStorage && window.localStorage.getItem(hideClosedKey(slug)) === "1");
  } catch (_) { return false; }
}
export function setProjectHideClosed(slug: string, hide: boolean): void {
  try {
    if (!window.localStorage) return;
    if (hide) window.localStorage.setItem(hideClosedKey(slug), "1");
    else window.localStorage.removeItem(hideClosedKey(slug));
  } catch (_) {}
}

// ── Projects overview ────────────────────────────────────────────────────

let projectsOverviewCache: ProjectCard[] | null = null;

export function invalidateProjectsCache(): void {
  projectsOverviewCache = null;
}

export async function loadProjectsOverview(): Promise<ProjectCard[]> {
  if (projectsOverviewCache !== null) return projectsOverviewCache;
  try {
    const res = await fetch("/api/projects?counts=1", { cache: "no-store" });
    const data = await res.json();
    projectsOverviewCache = (data && data.ok && Array.isArray(data.projects)) ? data.projects : [];
  } catch (_) {
    projectsOverviewCache = [];
  }
  return projectsOverviewCache!;
}

export function renderProjectCard(card: ProjectCard, currentProjectSlug: string | null): string {
  const displayName = card.title || (card.slug === "" ? "(Unassigned)" : card.slug);
  const slugLine = (card.slug && card.slug !== "" && card.title) ? card.slug : "";
  const jiraPill = card.jira ? '<span class="tasks-project-card-jira">' + escapeHtml(card.jira) + "</span>" : "";
  const statusPill = card.status ? '<span class="tasks-project-card-status">' + escapeHtml(card.status) + "</span>" : "";
  const counts = card.counts || { active: 0, doneNotClosed: 0, stuck: 0, closed: 0 };
  const touched = card.lastTouched ? timeAgo(card.lastTouched) : "no activity";
  const isActive = currentProjectSlug !== null && currentProjectSlug === card.slug;
  return (
    '<div class="tasks-project-card' + (isActive ? " is-active" : "") + '" data-project-slug="' + escapeHtml(card.slug || "") + '" role="button" tabindex="0">' +
    '<div class="tasks-project-card-head"><div class="tasks-project-card-name">' + escapeHtml(displayName) + "</div>" + jiraPill + statusPill + "</div>" +
    (slugLine ? '<div class="tasks-project-card-slug">' + escapeHtml(slugLine) + "</div>" : "") +
    '<div class="tasks-project-card-counts">' +
    '<span class="count count-active" title="Active">' + counts.active + " active</span>" +
    '<span class="count count-done" title="Done, not yet closed">' + counts.doneNotClosed + " done</span>" +
    '<span class="count count-stuck" title="Failed or waiting on dependency">' + counts.stuck + " stuck</span>" +
    '<span class="count count-closed" title="Closed">' + counts.closed + " closed</span>" +
    "</div>" +
    '<div class="tasks-project-card-foot"><span class="tasks-project-card-touched">' + escapeHtml(touched) + "</span></div>" +
    "</div>"
  );
}

export function renderProjectsView(
  tasksTreeEl: HTMLElement,
  currentProjectSlug: string | null
): void {
  tasksTreeEl.innerHTML = '<div class="tasks-current-empty">Loading projects…</div>';
  loadProjectsOverview().then(cards => {
    if (!cards.length) {
      tasksTreeEl.innerHTML = '<div class="tasks-current-empty">No projects yet. Tag a task with <code>project: &lt;slug&gt;</code> or create a <code>Notes/Projects/&lt;slug&gt;/</code> folder.</div>';
      return;
    }
    cards.sort((a, b) => {
      if (a.slug === "" && b.slug !== "") return 1;
      if (b.slug === "" && a.slug !== "") return -1;
      const ta = a.lastTouched ? Date.parse(a.lastTouched) || 0 : 0;
      const tb = b.lastTouched ? Date.parse(b.lastTouched) || 0 : 0;
      if (tb !== ta) return tb - ta;
      return a.slug.localeCompare(b.slug);
    });
    let html = '<div class="tasks-projects-grid">';
    for (const card of cards) html += renderProjectCard(card, currentProjectSlug);
    html += "</div>";
    tasksTreeEl.innerHTML = html;
  }).catch(err => {
    tasksTreeEl.innerHTML = '<div class="tasks-current-empty">Error loading projects: ' + escapeHtml(String((err as Error).message || err)) + "</div>";
  });
}

// ── Project pane ─────────────────────────────────────────────────────────

function renderDocCard(doc: DocItem, kind: string): string {
  const title = doc.title || doc.filename || "(untitled)";
  const desc = doc.description ? escapeHtml(shorten(doc.description, 140)) : "";
  const meta: string[] = [];
  if (doc.doc_type) meta.push(escapeHtml(doc.doc_type));
  if (doc.last_updated) meta.push(escapeHtml(doc.last_updated));
  return (
    '<button type="button" class="tasks-project-doc-card kind-' + escapeHtml(kind || "other") + '" data-open-file="' + escapeHtml(doc.path) + '">' +
    '<div class="tasks-project-doc-card-title">' + escapeHtml(title) + "</div>" +
    (desc ? '<div class="tasks-project-doc-card-desc">' + desc + "</div>" : "") +
    (meta.length ? '<div class="tasks-project-doc-card-meta">' + meta.join(" · ") + "</div>" : "") +
    "</button>"
  );
}

export function renderProjectPage(
  projectPaneEl: HTMLElement,
  summary: ProjectSummary,
  expanded: Record<string, boolean>,
  currentTaskId: string | null,
  bulkSelected: Record<string, { agent: string; defaultStatus: string }>
): void {
  const { slug } = summary;
  const displayName = summary.title || (slug === "" ? "(Unassigned)" : slug);
  const hideClosed = getProjectHideClosed(slug);

  let headParts = '<div class="tasks-project-head">';
  headParts += '<div class="tasks-project-head-row">';
  headParts += '<div class="tasks-project-title">' + escapeHtml(displayName) + "</div>";
  if (summary.jira) headParts += '<span class="tasks-project-jira">' + escapeHtml(summary.jira) + "</span>";
  if (summary.status) headParts += '<span class="tasks-project-status">' + escapeHtml(summary.status) + "</span>";
  headParts += "</div>";
  if (summary.title && slug && slug !== "") {
    headParts += '<div class="tasks-project-slug">' + escapeHtml(slug) + "</div>";
  }
  const medClose = fmtDaysHours(summary.metrics?.medianCloseTimeMs || 0);
  const medAge = fmtDaysHours(summary.metrics?.medianActiveAgeMs || 0);
  headParts += '<div class="tasks-project-metrics">';
  headParts += '<span class="metric"><span class="metric-label">Median close time</span><span class="metric-value">' + escapeHtml(medClose) + "</span></span>";
  headParts += '<span class="metric"><span class="metric-label">Median active age</span><span class="metric-value">' + escapeHtml(medAge) + "</span></span>";
  headParts += '<span class="metric"><span class="metric-label">Active leaves</span><span class="metric-value">' + summary.leaves.length + "</span></span>";
  headParts += "</div>";
  headParts += '<div class="tasks-project-actions">';
  if (slug && slug !== "") headParts += '<button type="button" class="task-panel-action is-primary" data-project-new-task="' + escapeHtml(slug) + '">+ New task here</button>';
  headParts += '<label class="task-panel-action task-panel-close-cascade tasks-project-hide-toggle">' +
    '<input type="checkbox" data-project-hide-closed="' + escapeHtml(slug) + '"' + (hideClosed ? " checked" : "") + " />" +
    "<span>Hide closed</span></label>";
  headParts += "</div></div>";

  const docs = summary.docs || { primary: [], fdps: [], other: [] };
  let docsHtml = "";
  if (docs.primary.length || docs.fdps.length || docs.other.length) {
    docsHtml += '<div class="tasks-project-docs"><div class="tasks-project-docs-head">Documents</div><div class="tasks-project-docs-grid">';
    for (const d of docs.primary) docsHtml += renderDocCard(d, "primary");
    for (const d of docs.fdps) docsHtml += renderDocCard(d, "fdp");
    docsHtml += "</div>";
    if (docs.other.length) {
      docsHtml += '<details class="tasks-project-docs-other"><summary>Other docs (' + docs.other.length + ')</summary>';
      docsHtml += '<div class="tasks-project-docs-grid">';
      for (const d of docs.other) docsHtml += renderDocCard(d, "other");
      docsHtml += "</div></details>";
    }
    docsHtml += "</div>";
  }

  let leavesHtml = '<div class="tasks-project-section"><div class="tasks-project-section-head">Active leaves (' + summary.leaves.length + ")</div>";
  if (summary.leaves.length === 0) {
    leavesHtml += '<div class="tasks-current-empty">No active leaves — inbox zero for this project. ✨</div>';
  } else {
    leavesHtml += '<div class="tasks-current">';
    const sorted = summary.leaves.slice().sort((a, b) => (Date.parse(b.updated || "0") || 0) - (Date.parse(a.updated || "0") || 0));
    for (const t of sorted) leavesHtml += renderCurrentRow(t, currentTaskId, bulkSelected);
    leavesHtml += "</div>";
  }
  leavesHtml += "</div>";

  const familiesScoped = hideClosed
    ? summary.families.filter(t => !(t.closed && t.closed.status))
    : summary.families;
  let familiesHtml = "";
  if (familiesScoped.length > 0) {
    familiesHtml += '<div class="tasks-project-section"><div class="tasks-project-section-head">Family trees</div><div class="tasks-project-trees">';
    const tree = buildTaskTree(familiesScoped);
    const byParent: Record<string, TaskRow[]> = {};
    for (const t of familiesScoped) {
      const p = (t.parent && t.parent !== "null") ? t.parent : null;
      if (!p) continue;
      (byParent[p] = byParent[p] || []).push(t);
    }
    for (const root of tree.roots) expanded[root.id] = true;
    const out: string[] = [];
    for (const root of tree.roots) {
      renderTreeBranch(tree, root, 0, out, expanded, byParent, currentTaskId);
    }
    familiesHtml += out.join("") + "</div></div>";
  }

  let closedHtml = "";
  if (summary.closedTasks.length > 0 && !hideClosed) {
    closedHtml += '<details class="tasks-project-section tasks-project-closed">';
    closedHtml += '<summary class="tasks-project-section-head">Closed (' + summary.closedTasks.length + ")</summary>";
    closedHtml += '<div class="tasks-current">';
    for (const t of summary.closedTasks) closedHtml += renderCurrentRow(t, currentTaskId, bulkSelected);
    closedHtml += "</div></details>";
  }

  projectPaneEl.innerHTML = headParts + docsHtml + leavesHtml + familiesHtml + closedHtml;
}

let projectsCache: ProjectCard[] | null = null;

export async function ensureProjectsLoaded(select: HTMLSelectElement): Promise<void> {
  if (!select) return;
  if (projectsCache !== null) {
    populateProjectSelect(select, projectsCache);
    return;
  }
  try {
    const res = await fetch("/api/projects", { cache: "no-store" });
    const data = await res.json();
    projectsCache = (data && data.ok && Array.isArray(data.projects)) ? data.projects : [];
  } catch (_) {
    projectsCache = [];
  }
  populateProjectSelect(select, projectsCache!);
}

function populateProjectSelect(select: HTMLSelectElement, projects: ProjectCard[]): void {
  const current = select.value;
  let html = '<option value="">(auto from context)</option><option value="__none__">(none / unassigned)</option>';
  for (const p of projects) {
    const label = p.title ? p.slug + " — " + p.title : p.slug;
    html += '<option value="' + escapeHtml(p.slug) + '">' + escapeHtml(label) + "</option>";
  }
  select.innerHTML = html;
  if (current && Array.from(select.options).some(o => o.value === current)) {
    select.value = current;
  }
}
