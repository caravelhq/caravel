import type { ResourceRef } from "./refs";
import type { TaskRow } from "../stores/tasks";
import type { ProjectCard } from "../stores/projects";
import type { ChatListEntry } from "../../services/chats";
import type { ResourceSpec } from "../stores/live";

export const TASKS_LIST_KEY = "tasks:list";

export const PROJECTS_LIST_KEY = "projects:list";

export const CHATS_LIST_KEY = "chats:list";

// Spec for the shared chats-list binding. One bind per strip mount (N5 — app-lifetime
// in TabStrip, not per-tab). Serves chat tab labels, the picker, and the unread indicator.
// Topic "chats" is emitted by live.ts whenever .caravel/chats/ changes (Phase 3).
export const chatsListSpec: ResourceSpec = {
  topics: ["chats"],
  fetch: async (): Promise<ChatListEntry[]> => {
    try {
      const r = await fetch("/api/chats");
      if (!r.ok) return [];
      const body = await r.json() as { ok: boolean; chats: ChatListEntry[] };
      return body.chats ?? [];
    } catch {
      return [];
    }
  },
};

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
    // WAL-138: no glyph for legacy panels. "l" rendered as a 3px sliver that read
    // as a stray pipe beside the label; these panels are named, not kind-coded.
    case "legacy": return "";
    case "chat": return "c";
  }
}

// Human-readable tab label. Resolves task headline from tasksList, project title from
// projectsList, chat name from chatsList. Falls back to id when not resolved.
export function refLabel(
  ref: ResourceRef,
  tasksList?: TaskRow[] | null,
  projectsList?: ProjectCard[] | null,
  chatsList?: ChatListEntry[] | null,
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
    case "chat": {
      const entry = chatsList?.find((c) => c.id === ref.chatId);
      return entry?.name || middleEllipsis(ref.chatId, 20);
    }
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
  chatsList?: ChatListEntry[] | null,
): string {
  switch (ref.kind) {
    case "dashboard": return "Dashboard";
    case "file": return ref.path + (ref.branch ? `@${ref.branch}` : "");
    case "legacy": return ref.page;
    case "project": {
      const card = projectsList?.find((p) => p.slug === ref.slug);
      return card?.title ? `${ref.slug} — ${card.title}` : ref.slug;
    }
    case "chat": {
      const entry = chatsList?.find((c) => c.id === ref.chatId);
      return entry?.name ? `${ref.chatId} — ${entry.name}` : ref.chatId;
    }
    case "envelope":
    case "report": {
      const row = tasksList?.find((t) => t.id === ref.taskId);
      return row?.headline ? `${ref.taskId} — ${row.headline}` : ref.taskId;
    }
  }
}
