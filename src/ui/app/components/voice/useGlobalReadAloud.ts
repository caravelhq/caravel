// useGlobalReadAloud — tab-aware, sidecar-backed, chunk-based read-aloud engine.
// Ported from client.js:sbDoReadAloud (lines 3055-3165).
//
// Reads ui.raText (set by the active page/view) and ui.raFilePath, calls the
// sidecar to strip markdown, extracts sentence chunks for skip control,
// offers resume when returning to the same content, and drives AudioModal via
// ui.raChunks / ui.raChunkIndex / ui.raShowResume.
import { useUiStore } from "../../stores/ui";
import { extractChunks, stripMarkdown, speakFetch } from "./utils";

export function useGlobalReadAloud(): {
  doReadAloud: () => Promise<void>;
  stopReadAloud: () => void;
} {
  const ui = useUiStore();
  let gen = 0;
  let currentAudio: HTMLAudioElement | null = null;

  function stopPlayback(): void {
    gen++;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    ui.raState = "idle";
    ui.raChunkIndex = -1;
    ui.audioModalOpen = false;
    ui.raShowResume = false;
    ui.raUnwire();
  }

  function playFrom(allChunks: string[], resumeKey: string, index: number, g: number): void {
    if (g !== gen) return;
    if (index >= allChunks.length) {
      ui.raState = "idle";
      ui.raChunkIndex = -1;
      ui.audioModalOpen = false;
      ui.raShowResume = false;
      ui.raUnwire();
      try { sessionStorage.removeItem("ra_resume"); } catch (_) {}
      return;
    }

    ui.raChunkIndex = index;
    try {
      sessionStorage.setItem("ra_resume", JSON.stringify({ key: resumeKey, index }));
    } catch (_) {}

    const stripped = stripMarkdown(allChunks[index]!).trim();
    if (!stripped) { playFrom(allChunks, resumeKey, index + 1, g); return; }

    speakFetch(stripped)
      .then(async (res) => {
        if (g !== gen) return;
        if (!res.ok) { playFrom(allChunks, resumeKey, index + 1, g); return; }
        const blob = await res.blob();
        if (g !== gen) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          currentAudio = null;
          if (g === gen) playFrom(allChunks, resumeKey, index + 1, g);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          currentAudio = null;
          if (g === gen) playFrom(allChunks, resumeKey, index + 1, g);
        };
        audio.play().catch(() => {
          URL.revokeObjectURL(url);
          currentAudio = null;
          if (g === gen) playFrom(allChunks, resumeKey, index + 1, g);
        });
      })
      .catch(() => {
        if (g === gen) playFrom(allChunks, resumeKey, index + 1, g);
      });
  }

  async function doReadAloud(): Promise<void> {
    if (ui.raState === "playing") { stopPlayback(); return; }

    const rawText = ui.raText;
    const rawFilePath = ui.raFilePath;
    if (!rawText) return;

    // Signal any per-message audio in ChatPage to stop.
    ui.raStopSignal++;

    ui.raState = "loading";
    ui.audioModalOpen = true;

    // Call sidecar to convert markdown to readable prose.
    let text: string | null = null;
    const sidecarBody = rawFilePath && /\.md$/i.test(rawFilePath)
      ? { path: rawFilePath }
      : { text: rawText };
    try {
      const resp = await fetch("/api/voice/sidecar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sidecarBody),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.text) text = data.text as string;
      }
    } catch (_) {}

    if (!text) text = rawText;
    if (!text.trim()) { ui.raState = "idle"; ui.audioModalOpen = false; return; }

    // Extract sentence chunks for skip control.
    const { chunks } = extractChunks(text, true);
    const allChunks = chunks.filter((c) => c.trim());
    if (allChunks.length === 0) allChunks.push(text.trim());

    ui.raChunks = allChunks;

    // Resume key: stable identifier for this content (first 80 chars + length).
    const resumeKey = text.slice(0, 80).trim() + "|" + text.length;
    let startIndex = 0;

    // Offer resume if returning to the same content mid-read.
    try {
      const saved = JSON.parse(sessionStorage.getItem("ra_resume") || "null") as {
        key: string; index: number;
      } | null;
      if (
        saved &&
        saved.key === resumeKey &&
        typeof saved.index === "number" &&
        saved.index > 0 &&
        saved.index < allChunks.length
      ) {
        ui.raResumeIndex = saved.index;
        ui.raShowResume = true;
        ui.raState = "playing";

        // Wait for user to pick Start over / Resume (resolved via raResumeFrom wiring).
        startIndex = await new Promise<number>((resolve) => {
          ui.raWire(
            (i) => {
              // skipTo called mid-resume-prompt: start from chosen index immediately.
              resolve(i);
            },
            () => { stopPlayback(); resolve(-1); },
            (i) => { resolve(i); },
          );
        });
        ui.raShowResume = false;
        if (startIndex < 0) return;
      }
    } catch (_) {}

    // Populate chunk state and wire skip/stop actions for AudioModal.
    const g = ++gen;
    ui.raChunkIndex = startIndex;
    ui.raState = "playing";

    ui.raWire(
      (i) => {
        // Skip: stop current audio and start from chunk i.
        gen++;
        const ng = gen;
        if (currentAudio) { currentAudio.pause(); currentAudio.src = ""; currentAudio = null; }
        playFrom(allChunks, resumeKey, i, ng);
      },
      () => { stopPlayback(); },
    );

    playFrom(allChunks, resumeKey, startIndex, g);
  }

  return { doReadAloud, stopReadAloud: stopPlayback };
}
