// globals.d.ts — window extension types for cross-page globals.

declare interface Window {
  __loadFile?: (path: string) => void;
  __loadDirectory?: (path: string) => void;
  __loadTaskDetail?: (taskId: string) => void;
  __ensureTasksLoaded?: () => void;
  __chatSessionId?: string;
  __pendingAgentId?: string;
  __fetchSummary?: () => void;
}
