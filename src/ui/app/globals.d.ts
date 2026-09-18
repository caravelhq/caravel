// globals.d.ts — window extension types for cross-page globals.

declare interface Window {
  // Files page
  __loadFile?: (path: string) => void;
  __loadDirectory?: (path: string) => void;
  // Tasks page
  __loadTaskDetail?: (taskId: string) => void;
  __ensureTasksLoaded?: () => void;
  // Chat page (prefill from task launcher, launchChatForTask)
  __chatSessionId?: string;
  __pendingAgentId?: string;
  __chatHistory?: Array<{ role: string; text: string; state?: string }>;
  // Dashboard
  __fetchSummary?: () => void;
  // Voice integration (VoiceIsland ↔ ChatPage)
  __vmOnAssistantChunk?: (text: string, done: boolean) => void;
  __ttsResetAutoRead?: () => void;
  __updateSpeakerDisabled?: () => void;
  __applyTtsButtonVisibility?: () => void;
  __micEnabled?: boolean;
  // Navigation
  __taskBackContext?: unknown;
  __renderFilesBackButton?: () => void;
}
