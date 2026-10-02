import { onMounted, onBeforeUnmount } from "vue";
import { detectMimeType, isRecordingSupported } from "./utils";

export function useDictation(): void {
  let recording = false;
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let targetEl: HTMLInputElement | HTMLTextAreaElement | null = null;
  let selStart = 0;
  let selEnd = 0;

  async function handleDictate() {
    // Toggle: second tap stops the current recording.
    if (recording) {
      recorder?.stop();
      return;
    }

    const focused = document.activeElement;
    if (
      !focused ||
      (focused.tagName !== "INPUT" && focused.tagName !== "TEXTAREA")
    )
      return;
    if (!isRecordingSupported()) return;

    const mimeType = detectMimeType();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return;
    }

    targetEl = focused as HTMLInputElement | HTMLTextAreaElement;
    selStart = targetEl.selectionStart ?? targetEl.value.length;
    selEnd = targetEl.selectionEnd ?? selStart;

    const chunks: Blob[] = [];
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      return;
    }

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data?.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      recording = false;

      const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
      const ext = mimeType?.includes("webm") ? ".webm" : ".ogg";
      const fd = new FormData();
      fd.append("audio", blob, `dictation${ext}`);

      let text = "";
      try {
        const res = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: fd,
        });
        const data: { ok: boolean; text?: string } = await res.json();
        if (data.ok && data.text) text = data.text.trim();
      } catch {
        return;
      }

      if (!text || !targetEl) return;

      const before = targetEl.value.slice(0, selStart);
      const after = targetEl.value.slice(selEnd);
      targetEl.value = before + text + after;
      targetEl.setSelectionRange(selStart + text.length, selStart + text.length);
      targetEl.dispatchEvent(new Event("input", { bubbles: true }));
      targetEl.focus();
      targetEl = null;
    };

    recording = true;
    recorder.start();
  }

  onMounted(() => {
    document.addEventListener("voice:dictate", handleDictate as EventListener);
  });

  onBeforeUnmount(() => {
    document.removeEventListener(
      "voice:dictate",
      handleDictate as EventListener
    );
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
  });
}
