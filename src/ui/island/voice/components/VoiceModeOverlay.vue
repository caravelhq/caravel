<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useVoiceStore } from "../store/voice";
import { stripMarkdown, esc, extractChunks, detectMimeType } from "../utils";

const voice = useVoiceStore();
const mimeType = detectMimeType();

// ── Non-reactive recording/audio state ──────────────────────────────────────
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;
let busy = false;
type QueueItem = { audio: HTMLAudioElement | null; url: string | null; text: string };
let audioQueue: Promise<QueueItem | null>[] = [];
let queueRunning = false;
let queueGen = 0;
let currentAudio: HTMLAudioElement | null = null;
let spokenChunks: string[] = [];
let turnCursor = 0;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let holdMode = false;
let pressStart = 0;
let prevVmChunk: ((text: string, isDone: boolean) => void) | undefined;
let fastPollController: AbortController | null = null;

// ── Template-reactive state ──────────────────────────────────────────────────
const statusText = ref("Press and hold to talk");
const btnClass = ref("");
const transcriptHtml = ref("");
const isListening = ref(false);

function setStatus(text: string, cls: string) {
  statusText.value = text;
  btnClass.value = cls;
}

function renderTranscript() {
  if (!spokenChunks.length) { transcriptHtml.value = ""; return; }
  transcriptHtml.value = spokenChunks
    .map((chunk, i) => {
      const active = i === spokenChunks.length - 1;
      return `<div class="vm-reply${active ? " vm-active" : ""}">${esc(chunk)}</div>`;
    })
    .join("");
}

// ── TTS audio queue ──────────────────────────────────────────────────────────
function stopAudio() {
  queueGen++;
  // Cancel the fast-poll loop (queueGen bump already breaks it, but abort the fetch too)
  if (fastPollController) { fastPollController.abort(); fastPollController = null; }
  spokenChunks = [];
  if (currentAudio) { currentAudio.pause(); currentAudio.src = ""; currentAudio = null; }
  audioQueue = [];
  queueRunning = false;
  voice.playing = false;
  renderTranscript();
}

function enqueueChunk(chunkText: string) {
  const stripped = stripMarkdown(chunkText).trim();
  if (!stripped) return;
  const displayText = chunkText.trim();
  const gen = queueGen;
  const p = fetch("/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: stripped }),
  })
    .then((res) => {
      if (gen !== queueGen) return null;
      if (!res.ok) {
        return res.json()
          .catch(() => ({}))
          .then(() => ({ audio: null as HTMLAudioElement | null, url: null as string | null, text: displayText }));
      }
      return res.blob().then((blob) => {
        if (gen !== queueGen) return null;
        const url = URL.createObjectURL(blob);
        return { audio: new Audio(url), url, text: displayText };
      });
    })
    .catch(() => ({ audio: null as HTMLAudioElement | null, url: null as string | null, text: displayText }));
  audioQueue.push(p);
  if (!queueRunning) runQueue(gen);
}

async function runQueue(gen: number) {
  if (queueRunning) return;
  queueRunning = true;
  while (audioQueue.length > 0 && gen === queueGen) {
    const item = await audioQueue.shift()!;
    if (gen !== queueGen) { if (item?.url) URL.revokeObjectURL(item.url); continue; }
    if (!item) continue;
    spokenChunks.push(item.text);
    renderTranscript();
    if (!item.audio) continue;
    setStatus("Speaking…", "speaking");
    voice.playing = true;
    currentAudio = item.audio;
    await new Promise<void>((resolve) => {
      item.audio!.onended = () => { URL.revokeObjectURL(item.url!); currentAudio = null; resolve(); };
      item.audio!.onerror = () => { URL.revokeObjectURL(item.url!); currentAudio = null; resolve(); };
      item.audio!.play().catch(() => { URL.revokeObjectURL(item.url!); currentAudio = null; resolve(); });
    });
  }
  if (gen === queueGen) {
    queueRunning = false;
    busy = false;
    voice.playing = false;
    if (voice.mode === "chat") setStatus("Press and hold to talk", "");
  }
}

// Called either by the fast-poll loop or by the vanilla pollChat hook.
// onAssistantChunk is idempotent: turnCursor tracks consumed characters,
// so double-calls with the same fullText produce no duplicate chunks.
function onAssistantChunk(fullText: string, isDone: boolean) {
  if (voice.mode !== "chat") return;
  if (fullText.length < turnCursor) { turnCursor = 0; stopAudio(); }
  const pending = fullText.slice(turnCursor);
  if (!pending) return;
  const result = extractChunks(pending, isDone);
  if (result.consumed > 0) turnCursor += result.consumed;
  for (const chunk of result.chunks) { if (chunk.trim()) enqueueChunk(chunk); }
  if (result.chunks.length) busy = true;
}

// ── Dedicated fast-poll loop ─────────────────────────────────────────────────
// Polls /api/chats/{chatId} at 200ms so interim streaming chunks reach TTS
// without waiting for vanilla's 500ms pollChat interval. Vanilla hook remains
// as belt-and-braces but this is the primary streaming path.
async function streamChatReply(chatId: string) {
  if (!chatId) return;
  if (fastPollController) { fastPollController.abort(); }
  const controller = new AbortController();
  fastPollController = controller;
  const gen = queueGen;

  while (!controller.signal.aborted && gen === queueGen) {
    await new Promise((r) => setTimeout(r, 200));
    if (controller.signal.aborted || gen !== queueGen) break;
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
        signal: controller.signal,
      });
      if (!res.ok) break;
      const data: any = await res.json();
      if (!data?.ok || !data?.chat?.messages) continue;
      const msgs: any[] = data.chat.messages;
      const lastAssistant = [...msgs].reverse().find((m: any) => m.role === "assistant");
      if (!lastAssistant?.text) continue;
      const st = lastAssistant.state;
      const isDone = !st || st === "done";
      if (isDone || st === "streaming") {
        onAssistantChunk(lastAssistant.text, isDone);
        if (isDone && voice.mode === "chat") setStatus("Press and hold to talk", "");
      }
      if (isDone) break;
    } catch (e: any) {
      if ((e as Error)?.name === "AbortError") break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (fastPollController === controller) fastPollController = null;
}

// ── Recording / STT ──────────────────────────────────────────────────────────
function stopStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function startRecording() {
  if (busy || !mimeType) return;
  busy = true;
  stopAudio();
  setStatus("Requesting microphone…", "");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    setStatus("Microphone unavailable", "");
    busy = false;
    return;
  }
  chunks = [];
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch {
    stopStream();
    setStatus("Press and hold to talk", "");
    busy = false;
    return;
  }
  recorder.ondataavailable = (e: BlobEvent) => { if (e.data?.size > 0) chunks.push(e.data); };
  setStatus("Listening… (release to send)", "listening");
  transcriptHtml.value = "";
  isListening.value = true;
  voice.recording = true;
  recorder.start(200);
}

async function stopAndSubmit() {
  if (!recorder || recorder.state === "inactive") return;
  recorder.onstop = async () => {
    isListening.value = false;
    voice.recording = false;
    setStatus("Transcribing…", "processing");
    const blob = new Blob(chunks, { type: mimeType! });
    chunks = [];
    recorder = null;
    stopStream();
    voice.transcribing = true;
    let text = "";
    try {
      const ext = mimeType!.includes("webm") ? ".webm" : ".ogg";
      const fd = new FormData();
      fd.append("audio", blob, `vm-island${ext}`);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
      const data: any = await res.json();
      if (data.ok && data.text) {
        text = data.text.trim();
      } else {
        setStatus("Transcription failed — try again", "");
        busy = false;
        voice.transcribing = false;
        return;
      }
    } catch {
      setStatus("Request failed — try again", "");
      busy = false;
      voice.transcribing = false;
      return;
    }
    voice.transcribing = false;
    if (!text) { setStatus("Nothing heard — try again", ""); busy = false; return; }
    transcriptHtml.value = `<div class="vm-heard">"${esc(text)}"</div>`;
    setStatus("Sending…", "processing");
    const chatId = (window as any).__chatSessionId;
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, chatId }),
      });
      spokenChunks = [];
      turnCursor = 0;
      // Start dedicated 200ms poll — don't wait for vanilla's 500ms pollChat
      streamChatReply(chatId);
    } catch {
      console.error("[voice-island] chat send failed");
    }
    setStatus("Waiting for reply…", "processing");
  };
  recorder.stop();
}

// ── Press/hold interaction ───────────────────────────────────────────────────
const HOLD_MS = 250;
function pressDown(e: Event) {
  e.preventDefault();
  pressStart = Date.now();
  holdTimer = setTimeout(() => {
    holdMode = true;
    if (!busy && (!recorder || recorder.state === "inactive")) startRecording();
  }, HOLD_MS);
}
function pressUp(e: Event) {
  e.preventDefault();
  if (holdTimer) clearTimeout(holdTimer);
  const dur = Date.now() - pressStart;
  if (holdMode) {
    holdMode = false;
    if (recorder?.state !== "inactive") stopAndSubmit();
  } else if (dur < HOLD_MS) {
    if (recorder?.state !== "inactive") stopAndSubmit();
    else if (!busy) startRecording();
  }
}
function pressLeave() {
  if (holdMode) {
    holdMode = false;
    if (holdTimer) clearTimeout(holdTimer);
    if (recorder?.state !== "inactive") stopAndSubmit();
  }
}

// ── Open / close ─────────────────────────────────────────────────────────────
function restoreVmHook() {
  (window as any).__vmOnAssistantChunk = prevVmChunk;
  prevVmChunk = undefined;
}

function openMode() {
  busy = false;
  spokenChunks = [];
  turnCursor = 0;
  setStatus("Press and hold to talk", "");
  isListening.value = false;
  transcriptHtml.value = "";
  // Prime cursor to skip assistant text already in history
  const hist = (window as any).__chatHistory;
  if (Array.isArray(hist) && hist.length) {
    const last = hist[hist.length - 1];
    if (last?.role === "assistant" && last.text) turnCursor = last.text.length;
  }
  // Keep vanilla hook as belt-and-braces; primary streaming now via streamChatReply
  prevVmChunk = (window as any).__vmOnAssistantChunk;
  (window as any).__vmOnAssistantChunk = onAssistantChunk;
}

function closeMode() {
  stopStream();
  stopAudio();
  busy = false;
  if (recorder?.state !== "inactive") { recorder?.stop(); recorder = null; }
  restoreVmHook();
}

// React to voice store mode changes
watch(
  () => voice.mode,
  (mode, prev) => {
    if (mode === "chat" && prev !== "chat") openMode();
    if (prev === "chat" && mode !== "chat") closeMode();
  }
);

onMounted(() => {
  if (voice.mode === "chat") openMode();
});
onBeforeUnmount(() => {
  stopStream();
  stopAudio();
  if (voice.mode === "chat") restoreVmHook();
});

function close() {
  closeMode();
  voice.close();
}
</script>

<template>
  <div class="voice-mode-overlay" role="dialog" aria-modal="true" aria-live="polite">
    <div class="voice-mode-transcript" v-html="transcriptHtml" />
    <div class="vm-controls">
      <div class="voice-mode-status">{{ statusText }}</div>
      <button
        class="voice-mode-btn"
        :class="btnClass"
        type="button"
        aria-label="Push to talk"
        @mousedown="pressDown"
        @touchstart.prevent="pressDown"
        @mouseup="pressUp"
        @touchend.prevent="pressUp"
        @mouseleave="pressLeave"
      >
        <i :class="isListening ? 'fa-solid fa-stop' : 'fa-solid fa-microphone'" />
      </button>
      <button class="voice-mode-close" type="button" aria-label="Exit voice mode" @click="close">
        <i class="fa-solid fa-xmark" />
      </button>
    </div>
  </div>
</template>
