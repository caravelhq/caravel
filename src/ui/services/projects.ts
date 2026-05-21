// WAL-63 Phase 3+4: read-only listing of project folders under
// Notes/Projects/. Powers the dashboard new-task form's project dropdown
// (Phase 3), the Projects view cards (Phase 4), and the Project page
// (Phase 4 + 4a documents shelf).
//
// A project here is any direct child directory of `Notes/Projects/`. We
// also pull a light bit of metadata from `<project>/README.md` frontmatter
// when it exists (title, jira, status) so the dropdown / cards can sort
// and label sensibly without forcing every caller to read the file itself.
// Sort order: alphabetical by slug — predictable for keyboard nav.

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { listTasks, type TaskRow } from "./multiAgent";

const PROJECT_ROOT = process.cwd();
const PROJECTS_DIR = join(PROJECT_ROOT, "Notes", "Projects");
const FDP_DIR = join(PROJECT_ROOT, "repos", "dev", "features");

export interface ProjectInfo {
  slug: string;
  hasReadme: boolean;
  title: string | null;
  jira: string | null;
  status: string | null;
}

// WAL-63 Phase 4: roll-up counts surfaced on the Projects card grid.
//
// active        — closed: null (not retired by Kelly) — total live envelopes
// doneNotClosed — status: done AND closed: null (worker finished, awaiting triage)
// stuck         — status: failed:* OR waiting:on:task pointing at a failed/ envelope
//                 (a softer "needs your eyes" signal than the plan's strict
//                 definition; surfaces dependency-stuck work without doing the
//                 cross-task lookup the plan calls for, which can land later).
// closed        — closed.status non-null — historical view
// total         — every envelope in this project, including archived
export interface ProjectCounts {
  active: number;
  doneNotClosed: number;
  stuck: number;
  closed: number;
  total: number;
}

export interface ProjectCard extends ProjectInfo {
  counts: ProjectCounts;
  lastTouched: string | null; // max(updated) across tasks; null when project has no tasks yet
}

// WAL-63 Phase 4a: a single document on the project's shelf — either a
// markdown file living in Notes/Projects/<slug>/ or an FDP linked from a
// task envelope's context: array. Frontmatter is sniffed best-effort so
// title/description/last_updated render cleanly without forcing every
// project doc to carry the v1.2 frontmatter contract.
export interface ProjectDoc {
  path: string;       // repo-relative
  filename: string;
  title: string | null;
  description: string | null;
  doc_type: string | null;
  status: string | null;
  last_updated: string | null;
}

export interface ProjectDocs {
  primary: ProjectDoc[]; // README, Project_Plan, Decision_Log
  fdps: ProjectDoc[];    // repos/dev/features/TPD-*.md linked from task context
  other: ProjectDoc[];   // every other markdown in the project folder
}

export interface ProjectMetrics {
  medianCloseTimeMs: number | null; // median(closed.at - created) across closed tasks
  medianActiveAgeMs: number | null; // median(now - created) across active leaves
}

export interface ProjectSummary extends ProjectCard {
  leaves: TaskRow[];      // active leaves only (closed: null AND no active descendant in this project)
  families: TaskRow[];    // every task in the project (for tree-building UI-side)
  closedTasks: TaskRow[]; // closed only, sorted by closed.at desc
  docs: ProjectDocs;
  metrics: ProjectMetrics;
}

function parseFrontmatter(content: string): Record<string, string> | null {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[kv[1]] = value;
  }
  return out;
}

export async function listProjects(): Promise<ProjectInfo[]> {
  if (!existsSync(PROJECTS_DIR)) return [];

  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."));

  const out: ProjectInfo[] = [];
  for (const d of dirs) {
    const slug = d.name;
    const readmePath = join(PROJECTS_DIR, slug, "README.md");
    let hasReadme = false;
    let title: string | null = null;
    let jira: string | null = null;
    let status: string | null = null;
    try {
      const st = await stat(readmePath);
      if (st.isFile()) {
        hasReadme = true;
        const content = await readFile(readmePath, "utf-8");
        const fm = parseFrontmatter(content);
        if (fm) {
          title = fm.title ?? null;
          jira = fm.jira ?? null;
          status = fm.status ?? null;
        }
      }
    } catch {
      // No README is fine — slug-only project listing.
    }
    out.push({ slug, hasReadme, title, jira, status });
  }

  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

// === Phase 4: card-grid overview =============================================

function bucketCounts(tasks: TaskRow[]): ProjectCounts {
  const counts: ProjectCounts = {
    active: 0,
    doneNotClosed: 0,
    stuck: 0,
    closed: 0,
    total: tasks.length,
  };
  for (const t of tasks) {
    const isClosed = !!(t.closed && t.closed.status);
    if (isClosed) {
      counts.closed += 1;
      continue;
    }
    counts.active += 1;
    if (t.status === "done") counts.doneNotClosed += 1;
    if (t.status.startsWith("failed:") || t.status.startsWith("waiting:on:task")) {
      counts.stuck += 1;
    }
  }
  return counts;
}

function maxUpdated(tasks: TaskRow[]): string | null {
  let best: string | null = null;
  for (const t of tasks) {
    if (!t.updated) continue;
    if (!best || t.updated > best) best = t.updated;
  }
  return best;
}

// listProjectsWithCounts is the data source for the Projects card grid. One
// listTasks() call (includeArchived: true so closed-aged-into-archived rows
// roll into counts.closed) feeds every per-project bucket. Per-card cost is
// O(tasks/slugs) which is negligible at WAL-63 scale.
export async function listProjectsWithCounts(): Promise<ProjectCard[]> {
  const [infos, tasks] = await Promise.all([
    listProjects(),
    listTasks({ includeArchived: true }),
  ]);

  // Bucket tasks by project. Tasks without a project tag fall into the
  // synthetic "" bucket — surfaced by the UI as "Unassigned" alongside the
  // real project cards.
  const byProject = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const key = t.project ?? "";
    const list = byProject.get(key);
    if (list) list.push(t);
    else byProject.set(key, [t]);
  }

  const out: ProjectCard[] = [];
  // Real project folders first (every entry in infos), then any "unassigned"
  // bucket if it has tasks. Folders with no tasks still surface — they're
  // valid pre-work projects waiting to be populated.
  const knownSlugs = new Set(infos.map((i) => i.slug));
  for (const info of infos) {
    const tasksForSlug = byProject.get(info.slug) ?? [];
    out.push({
      ...info,
      counts: bucketCounts(tasksForSlug),
      lastTouched: maxUpdated(tasksForSlug),
    });
  }
  // Any project keys that exist as task tags but have no matching folder —
  // also any synthetic "" key for unassigned. Surface those so Kelly can see
  // either (a) a folder she hasn't created yet for an existing workstream, or
  // (b) the Unassigned bucket itself.
  for (const [key, tasksForKey] of byProject.entries()) {
    if (key === "") {
      if (tasksForKey.length > 0) {
        out.push({
          slug: "",
          hasReadme: false,
          title: "(Unassigned)",
          jira: null,
          status: null,
          counts: bucketCounts(tasksForKey),
          lastTouched: maxUpdated(tasksForKey),
        });
      }
      continue;
    }
    if (knownSlugs.has(key)) continue;
    out.push({
      slug: key,
      hasReadme: false,
      title: null,
      jira: null,
      status: null,
      counts: bucketCounts(tasksForKey),
      lastTouched: maxUpdated(tasksForKey),
    });
  }
  return out;
}

// === Phase 4: per-project summary ============================================

function pickFirstDescriptionLine(content: string): string | null {
  const body = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").trimStart();
  // Skip leading markdown headers (any number); use the first prose paragraph.
  const lines = body.split("\n");
  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;
    if (/^#{1,6}\s/.test(stripped)) continue;
    return stripped.slice(0, 180);
  }
  return null;
}

async function readDocMetadata(absPath: string): Promise<ProjectDoc | null> {
  try {
    const st = await stat(absPath);
    if (!st.isFile()) return null;
    const content = await readFile(absPath, "utf-8");
    const fm = parseFrontmatter(content) ?? {};
    const filename = basename(absPath);
    return {
      path: relative(PROJECT_ROOT, absPath),
      filename,
      title: fm.title ?? null,
      description: fm.description ?? pickFirstDescriptionLine(content),
      doc_type: fm.doc_type ?? null,
      status: fm.status ?? null,
      last_updated: fm.last_updated ?? st.mtime.toISOString().slice(0, 10),
    };
  } catch {
    return null;
  }
}

const PRIMARY_FILENAMES = new Set(["README.md", "Project_Plan.md", "Decision_Log.md"]);
const PRIMARY_ORDER = ["README.md", "Project_Plan.md", "Decision_Log.md"];

async function gatherDocs(slug: string, families: TaskRow[]): Promise<ProjectDocs> {
  const docs: ProjectDocs = { primary: [], fdps: [], other: [] };
  const projectDir = join(PROJECTS_DIR, slug);

  // Folder scan — primary + other.
  if (existsSync(projectDir)) {
    const entries = await readdir(projectDir, { withFileTypes: true }).catch(() => [] as Array<{ isFile: () => boolean; name: string }>);
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.toLowerCase().endsWith(".md")) continue;
      const meta = await readDocMetadata(join(projectDir, e.name));
      if (!meta) continue;
      if (PRIMARY_FILENAMES.has(e.name)) {
        docs.primary.push(meta);
      } else {
        docs.other.push(meta);
      }
    }
    docs.primary.sort((a, b) => PRIMARY_ORDER.indexOf(a.filename) - PRIMARY_ORDER.indexOf(b.filename));
    docs.other.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  // Linked FDPs — scan task context paths.
  const fdpPaths = new Set<string>();
  for (const t of families) {
    for (const c of t.context) {
      const m = /^repos\/dev\/features\/(TPD-[^/]+\.md)$/.exec(c.trim());
      if (m) fdpPaths.add(c.trim());
    }
  }
  for (const rel of Array.from(fdpPaths).sort()) {
    const abs = join(PROJECT_ROOT, rel);
    if (!existsSync(abs)) continue;
    const meta = await readDocMetadata(abs);
    if (meta) docs.fdps.push(meta);
  }
  // Also pick up any FDPs that exist in the canonical FDP dir and reference
  // this project's jira key via their parent: frontmatter — Phase 4b polish,
  // skipped for now to keep the scan cheap.
  void FDP_DIR;

  return docs;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function computeMetrics(families: TaskRow[], leaves: TaskRow[]): ProjectMetrics {
  const now = Date.now();
  const closeDeltas: number[] = [];
  for (const t of families) {
    if (!(t.closed && t.closed.status)) continue;
    if (!t.closed.at || !t.created) continue;
    const cAt = Date.parse(t.closed.at);
    const cReated = Date.parse(t.created);
    if (!Number.isFinite(cAt) || !Number.isFinite(cReated)) continue;
    const delta = cAt - cReated;
    if (delta >= 0) closeDeltas.push(delta);
  }
  const activeAges: number[] = [];
  for (const t of leaves) {
    if (!t.created) continue;
    const c = Date.parse(t.created);
    if (!Number.isFinite(c)) continue;
    activeAges.push(now - c);
  }
  return {
    medianCloseTimeMs: median(closeDeltas),
    medianActiveAgeMs: median(activeAges),
  };
}

// Active-leaf detection — same rule as the Current view's renderCurrentView
// in client.js: closed: null AND no descendant where closed: null. Scoped to
// the project's own families because cross-project descendants don't change
// the leaf set within this workstream.
function computeLeaves(families: TaskRow[]): TaskRow[] {
  const byParent = new Map<string, TaskRow[]>();
  for (const t of families) {
    if (!t.parent) continue;
    const list = byParent.get(t.parent);
    if (list) list.push(t);
    else byParent.set(t.parent, [t]);
  }
  const isActive = (t: TaskRow) => !(t.closed && t.closed.status);
  function hasActiveDescendant(id: string, seen: Set<string>): boolean {
    if (seen.has(id)) return false;
    seen.add(id);
    const kids = byParent.get(id) ?? [];
    for (const k of kids) {
      if (isActive(k)) return true;
      if (hasActiveDescendant(k.id, seen)) return true;
    }
    return false;
  }
  return families.filter((t) => isActive(t) && !hasActiveDescendant(t.id, new Set()));
}

export async function getProjectSummary(slug: string): Promise<ProjectSummary | null> {
  const projects = await listProjects();
  // Allow "" (Unassigned) and ad-hoc slugs that exist as task tags but no
  // folder — both surface via the card grid, so the Project page must too.
  const info = projects.find((p) => p.slug === slug)
    ?? { slug, hasReadme: false, title: slug === "" ? "(Unassigned)" : null, jira: null, status: null };

  const allTasks = await listTasks({ includeArchived: true });
  const families = allTasks.filter((t) => (t.project ?? "") === slug);
  const leaves = computeLeaves(families);
  const closedTasks = families
    .filter((t) => t.closed && t.closed.status)
    .sort((a, b) => (b.closed?.at ?? "").localeCompare(a.closed?.at ?? ""));

  const docs = await gatherDocs(slug, families);
  const counts = bucketCounts(families);
  const metrics = computeMetrics(families, leaves);

  return {
    ...info,
    counts,
    lastTouched: maxUpdated(families),
    leaves,
    families,
    closedTasks,
    docs,
    metrics,
  };
}
