// globals.d.ts — window extension types for cross-page globals.

declare interface Window {
  // Chat voice seam (Phase 5.2 — kept alive until VoiceModeOverlay is rewritten)
  __chatHistory?: Array<{ role: string; text: string; state?: string }>;
  // Dashboard
  __fetchSummary?: () => void;
  // Voice integration (VoiceIsland ↔ ChatView)
  __vmOnAssistantChunk?: (text: string, done: boolean) => void;
  __updateSpeakerDisabled?: () => void;
  __applyTtsButtonVisibility?: () => void;
  __micEnabled?: boolean;
  // Navigation
  __taskBackContext?: unknown;
  // Reading pane — throw a ref from vanilla DOM code (Phase 2)
  __throwToReadingPane?: (ref: { kind: string; path: string; branch?: string }) => void;
}
