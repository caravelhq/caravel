import type { ResourceRef } from "./refs";
import type { TaskRow } from "../stores/tasks";
import type { ProjectCard } from "../stores/projects";
import type { ResourceSpec } from "../stores/live";

export const TASKS_LIST_KEY = "tasks:list";

export const PROJECTS_LIST_KEY = "projects:list";

// Spec for the shared projects-list binding. One bind per strip mount, mirrors tasksListSpec.
export const projectsListSpec: ResourceSpec = {
  topics: ["tasks"],
  fetch: async (): Promise<ProjectCard[]> => {
    try {
      const r = await fetch("/api/projects?counts=1");
      if (!r.ok) return [];
      const body = await r.json() as { ok: boolean; projects: ProjectCard[] };
      return body.projects ?? [];
    } catch {
      return [];
    }
  },
};

// Spec for the shared tasks-list binding. One bind per strip mount, not one per tab.
export const tasksListSpec: ResourceSpec = {
  topics: ["tasks"],
  fetch: async (): Promise<TaskRow[]> => {
    try {
      const r = await fetch("/api/tasks?limit=120");
      if (!r.ok) return [];
      const body = await r.json() as { ok: boolean; tasks: TaskRow[] };
      return body.tasks ?? [];
    } catch {
      return [];
    }
  },
};

// Keep the suffix discriminator when truncating (e.g. TSK-2026-10-14-0030.01 → TSK-…-0030.01).
// The suffix after the last "-" differentiates orchestration fan-out siblings (.01, .02, …NN).
export function middleEllipsis(s: string, max = 13): string {
  if (s.length <= max) return s;
  const lastDash = s.lastIndexOf("-");
  const suffix = lastDash >= 0 ? s.slice(lastDash) : "";
  const prefixLen = max - 1 - suffix.length;
  if (prefixLen <= 0) return s.slice(0, max - 1) + "…";
  return s.slice(0, prefixLen) + "…" + suffix;
}

// One leading character per kind — lets a mixed strip read at a glance.
export function refGlyph(ref: ResourceRef): string {
  switch (ref.kind) {
    case "dashboard": return "⊞";
    case "file": return "f";
    case "report": return "r";
    case "envelope": return "t";
    case "project": return "p";
    case "legacy": return "l";
    case "chat": return "c";
  }
}

// Human-readable tab label. Resolves task headline from tasksList, project title from projectsList.
// Falls back to slug / middle-ellipsised id when not resolved.
export function refLabel(
  ref: ResourceRef,
  tasksList?: TaskRow[] | null,
  projectsList?: ProjectCard[] | null,
): string {
  switch (ref.kind) {
    case "dashboard": return "Dashboard";
    case "file": return ref.path.split("/").pop() || ref.path;
    // WAL-138: the tasks picker is the "Open" panel — it will house Chat (Phase 5)
    // and Files (Phase 6) as sub-tabs beside Projects | Tasks. Chat and Files keep
    // their own labels until they migrate.
    case "legacy": return ref.page === "tasks" ? "Open" : ref.page.charAt(0).toUpperCase() + ref.page.slice(1);
    case "project": {
      const card = projectsList?.find((p) => p.slug === ref.slug);
      return card?.title || ref.slug;
    }
    case "chat": return ref.chatId;
    case "envelope":
    case "report": {
      const row = tasksList?.find((t) => t.id === ref.taskId);
      if (row?.headline) return row.headline;
      return middleEllipsis(ref.taskId);
    }
  }
}

// Full identity string for the title attribute (shown on hover).
export function refTitle(
  ref: ResourceRef,
  tasksList?: TaskRow[] | null,
  projectsList?: ProjectCard[] | null,
): string {
  switch (ref.kind) {
    case "dashboard": return "Dashboard";
    case "file": return ref.path + (ref.branch ? `@${ref.branch}` : "");
    case "legacy": return ref.page;
    case "project": {
      const card = projectsList?.find((p) => p.slug === ref.slug);
      return card?.title ? `${ref.slug} — ${card.title}` : ref.slug;
    }
    case "chat": return ref.chatId;
    case "envelope":
    case "report": {
      const row = tasksList?.find((t) => t.id === ref.taskId);
      return row?.headline ? `${ref.taskId} — ${row.headline}` : ref.taskId;
    }
  }
}
