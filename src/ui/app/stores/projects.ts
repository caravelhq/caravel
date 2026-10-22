// stores/projects.ts — project overview list and per-slug summaries.
// Replaces both module-level caches in pages/tasks/projects.ts (S4 / F13):
//   projectsOverviewCache (line :58) → this.list
//   projectsCache          (line :237) → same this.list, used by NewTaskModal

import { defineStore } from "pinia";
import { ref, reactive } from "vue";
import type { TaskRow } from "./tasks";

export interface ProjectCard {
  slug: string;
  title?: string;
  jira?: string;
  status?: string;
  lastTouched?: string;
  counts?: { active: number; doneNotClosed: number; stuck: number; closed: number };
}

export interface DocItem {
  path: string;
  title?: string;
  filename?: string;
  description?: string;
  doc_type?: string;
  last_updated?: string;
}

export interface ProjectSummary {
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

export const useProjectsStore = defineStore("projects", () => {
  // Overview list from /api/projects?counts=1 — replaces projectsOverviewCache
  const list = ref<ProjectCard[]>([]);
  const listLoaded = ref(false);
  const listError = ref<string | null>(null);
  let listInflight: Promise<ProjectCard[]> | null = null;

  async function loadList(): Promise<ProjectCard[]> {
    if (listLoaded.value) return list.value;
    if (listInflight) return listInflight;
    listInflight = (async () => {
      try {
        const r = await fetch("/api/projects?counts=1", { cache: "no-store" });
        const d = await r.json() as { ok?: boolean; projects?: ProjectCard[] };
        list.value = (d.ok && Array.isArray(d.projects)) ? d.projects : [];
        listError.value = null;
      } catch (e) {
        list.value = [];
        listError.value = String((e as Error).message || e);
      }
      listLoaded.value = true;
      listInflight = null;
      return list.value;
    })();
    return listInflight;
  }

  function invalidateList(): void {
    listLoaded.value = false;
    listInflight = null;
  }

  // Per-slug summaries from /api/projects/<slug>
  const summaries = reactive(new Map<string, ProjectSummary>());
  const summaryErrors = reactive(new Map<string, string | null>());
  const summaryInflights = new Map<string, Promise<ProjectSummary | null>>();

  async function loadSummary(slug: string): Promise<ProjectSummary | null> {
    if (summaries.has(slug)) return summaries.get(slug) ?? null;
    if (summaryInflights.has(slug)) return summaryInflights.get(slug) ?? null;
    const p = (async () => {
      try {
        const r = await fetch(`/api/projects/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const d = await r.json() as { ok?: boolean; summary?: ProjectSummary };
        const summary = (d.ok && d.summary) ? d.summary : null;
        if (summary) summaries.set(slug, summary);
        summaryErrors.set(slug, null);
        return summary;
      } catch (e) {
        summaryErrors.set(slug, String((e as Error).message || e));
        return null;
      } finally {
        summaryInflights.delete(slug);
      }
    })();
    summaryInflights.set(slug, p);
    return p;
  }

  function invalidateSummary(slug: string): void {
    summaries.delete(slug);
    summaryErrors.delete(slug);
    summaryInflights.delete(slug);
  }

  // Per-slug expansion state — NOT force-reset on render (F2 / renderProjectPage:217 bug)
  const expansionBySlug = reactive(new Map<string, Record<string, boolean>>());

  function getExpansion(slug: string): Record<string, boolean> {
    if (!expansionBySlug.has(slug)) expansionBySlug.set(slug, {});
    return expansionBySlug.get(slug)!;
  }

  // Per-slug hide-closed state — initialised from localStorage, written back on change
  const hideClosedBySlug = reactive(new Map<string, boolean>());

  function _lcKey(slug: string): string {
    return "caravel.project.hideClosed." + (slug || "__unassigned__");
  }

  function getHideClosed(slug: string): boolean {
    if (hideClosedBySlug.has(slug)) return hideClosedBySlug.get(slug)!;
    try {
      const v = window.localStorage?.getItem(_lcKey(slug)) === "1";
      hideClosedBySlug.set(slug, v);
      return v;
    } catch {
      return false;
    }
  }

  function setHideClosed(slug: string, hide: boolean): void {
    hideClosedBySlug.set(slug, hide);
    try {
      if (hide) window.localStorage?.setItem(_lcKey(slug), "1");
      else window.localStorage?.removeItem(_lcKey(slug));
    } catch {}
  }

  return {
    list,
    listLoaded,
    listError,
    loadList,
    invalidateList,
    summaries,
    summaryErrors,
    loadSummary,
    invalidateSummary,
    getExpansion,
    getHideClosed,
    setHideClosed,
  };
});
