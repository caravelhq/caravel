// globals.d.ts — window extension types for cross-page globals.

declare interface Window {
  // Chat page (prefill from task launcher)
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
  // Reading pane — throw a ref from vanilla DOM code (Phase 2)
  __throwToReadingPane?: (ref: { kind: string; path: string; branch?: string }) => void;
}
