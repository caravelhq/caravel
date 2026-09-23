// Resource reference — the typed address for any tab in the workspace.
// Kinds registered in Phase 3: dashboard, file, report, legacy.
// envelope, project, chat are declared here but unregistered until Phases 4–5.

export type ResourceRef =
  | { kind: "dashboard" }
  | { kind: "file"; path: string; branch?: string }
  | { kind: "report"; taskId: string; path?: string }
  | { kind: "envelope"; taskId: string }
  | { kind: "project"; slug: string }
  | { kind: "chat"; chatId: string }
  | { kind: "legacy"; page: "tasks" | "chat" | "files" };

export function refKey(ref: ResourceRef): string {
  switch (ref.kind) {
    case "dashboard": return "dashboard";
    case "file": return ref.branch ? `file:${ref.path}@${ref.branch}` : `file:${ref.path}`;
    case "report": return `report:${ref.taskId}`;
    case "envelope": return `envelope:${ref.taskId}`;
    case "project": return `project:${ref.slug}`;
    case "chat": return `chat:${ref.chatId}`;
    case "legacy": return `legacy:${ref.page}`;
  }
}
