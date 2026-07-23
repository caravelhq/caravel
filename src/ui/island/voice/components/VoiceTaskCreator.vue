<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useVoiceStore } from "../store/voice";
import { useTaskCreatorStore } from "../store/taskCreator";
import { stripMarkdown, esc, detectMimeType } from "../utils";

const voice = useVoiceStore();
const taskCreator = useTaskCreatorStore();
const mimeType = detectMimeType();

// ── Non-reactive audio state ─────────────────────────────────────────────────
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;
let busy = false;
type QueueItem = { audio: HTMLAudioElement | null; url: string | null; text: string };
let audioQueue: Promise<QueueItem | null>[] = [];
let queueRunning = false;
let queueGen = 0;
let currentAudio: HTMLAudioElement | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

// ── Reactive UI state ────────────────────────────────────────────────────────
const statusText = ref("Describe the task you want to create");
const isListening = ref(false);
const isProcessing = ref(false);
const heardText = ref("");
const replyText = ref("");
const submitError = ref("");
const submitted = ref(false);

// Draft fields mirrored from store for local editing
const draftTo = ref("");
const draftHeadline = ref("");
const draftBrief = ref("");
const draftProject = ref("");
const draftPriority = ref("P2");
const draftKind = ref("research");

const hasDraft = computed(() => taskCreator.draft !== null);
const isSubmitting = computed(() => taskCreator.submitting);

// ── TTS for task creator replies ─────────────────────────────────────────────
function stopAudio() {
  queueGen++;
  if (currentAudio) { currentAudio.pause(); currentAudio.src = ""; currentAudio = null; }
  audioQueue = [];
  queueRunning = false;
}

function enqueueChunk(chunkText: string) {
  const stripped = stripMarkdown(chunkText).trim();
  if (!stripped) return;
  const gen = queueGen;
  const p = fetch("/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: stripped }),
  })
    .then((res) => {
      if (gen !== queueGen) return null;
      if (!res.ok) return { audio: null as HTMLAudioElement | null, url: null as string | null, text: chunkText };
      return res.blob().then((blob) => {
        if (gen !== queueGen) return null;
        const url = URL.createObjectURL(blob);
        return { audio: new Audio(url), url, text: chunkText };
      });
    })
    .catch(() => ({ audio: null as HTMLAudioElement | null, url: null as string | null, text: chunkText }));
  audioQueue.push(p);
  if (!queueRunning) runQueue(gen);
}

async function runQueue(gen: number) {
  if (queueRunning) return;
  queueRunning = true;
  while (audioQueue.length > 0 && gen === queueGen) {
    const item = await audioQueue.shift()!;
    if (gen !== queueGen) { if (item?.url) URL.revokeObjectURL(item.url); continue; }
    if (!item?.audio) continue;
    currentAudio = item.audio;
    await new Promise<void>((resolve) => {
      item.audio!.onended = () => { URL.revokeObjectURL(item.url!); currentAudio = null; resolve(); };
      item.audio!.onerror = () => { URL.revokeObjectURL(item.url!); currentAudio = null; resolve(); };
      item.audio!.play().catch(() => { URL.revokeObjectURL(item.url!); currentAudio = null; resolve(); });
    });
  }
  if (gen === queueGen) queueRunning = false;
}

function speakReply(fullReply: string) {
  // Strip the <task> block before TTS — Claude's spoken ack is the text around it
  const spoken = fullReply.replace(/<task>[\s\S]*?<\/task>/gi, "").trim();
  if (!spoken) return;
  // Split into sentences for sequential TTS
  const sentences = spoken.match(/[^.!?]+[.!?]+/g) ?? [spoken];
  for (const s of sentences) {
    if (s.trim()) enqueueChunk(s.trim());
  }
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
  statusText.value = "Requesting microphone…";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    statusText.value = "Microphone unavailable";
    busy = false;
    return;
  }
  chunks = [];
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch {
    stopStream();
    statusText.value = "Describe the task you want to create";
    busy = false;
    return;
  }
  recorder.ondataavailable = (e: BlobEvent) => { if (e.data?.size > 0) chunks.push(e.data); };
  statusText.value = "Listening… (release to send)";
  heardText.value = "";
  replyText.value = "";
  isListening.value = true;
  recorder.start(200);
}

async function stopAndExtract() {
  if (!recorder || recorder.state === "inactive") return;
  recorder.onstop = async () => {
    isListening.value = false;
    statusText.value = "Transcribing…";
    isProcessing.value = true;
    const blob = new Blob(chunks, { type: mimeType! });
    chunks = [];
    recorder = null;
    stopStream();
    let text = "";
    try {
      const ext = mimeType!.includes("webm") ? ".webm" : ".ogg";
      const fd = new FormData();
      fd.append("audio", blob, `task-creator${ext}`);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
      const data: any = await res.json();
      if (data.ok && data.text) {
        text = data.text.trim();
      } else {
        statusText.value = "Transcription failed — try again";
        busy = false;
        isProcessing.value = false;
        return;
      }
    } catch {
      statusText.value = "Request failed — try again";
      busy = false;
      isProcessing.value = false;
      return;
    }
    if (!text) { statusText.value = "Nothing heard — try again"; busy = false; isProcessing.value = false; return; }
    heardText.value = text;
    statusText.value = "Extracting task…";
    taskCreator.addUserMessage(text);
    await extractTask(text);
    busy = false;
    isProcessing.value = false;
  };
  recorder.stop();
}

// ── Task extraction via /api/chat ────────────────────────────────────────────
// Uses an ephemeral chatId; the system prompt is embedded in the user message
// so the regular chat endpoint handles it without server changes.
async function extractTask(userText: string) {
  const ephemeralChatId = `voice-task-${Date.now()}`;
  const embeddedMessage = buildEmbeddedMessage(userText);
  try {
    const postRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: embeddedMessage, chatId: ephemeralChatId }),
    });
    const postData: any = await postRes.json();
    if (!postData.ok) {
      statusText.value = "Extraction failed — try again";
      return;
    }
  } catch {
    statusText.value = "Request failed — try again";
    return;
  }
  statusText.value = "Thinking…";
  const reply = await pollForReply(ephemeralChatId);
  if (!reply) { statusText.value = "No reply — try again"; return; }
  // Store in conversation
  taskCreator.addAssistantMessage(reply);
  replyText.value = reply;
  // Speak the non-task part
  speakReply(reply);
  // Parse task block
  const draft = taskCreator.parseTaskFromReply(reply);
  if (draft) {
    taskCreator.setDraft(draft);
    draftTo.value = draft.to;
    draftHeadline.value = draft.headline;
    draftBrief.value = draft.brief;
    draftProject.value = draft.project ?? "";
    draftPriority.value = draft.priority;
    draftKind.value = draft.kind;
    statusText.value = "Review and confirm";
  } else {
    statusText.value = "Couldn't extract task — try again";
  }
}

function buildEmbeddedMessage(userText: string): string {
  return `[VOICE TASK CREATOR — extract a task from the user's spoken request]

${taskCreator.SYSTEM_PROMPT}

---

User's voice request: "${userText}"`;
}

async function pollForReply(chatId: string, maxMs = 30000): Promise<string | null> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await delay(600);
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
      const data: any = await res.json();
      if (!data.ok || !data.chat) continue;
      const messages: any[] = data.chat.messages ?? [];
      const last = messages[messages.length - 1];
      if (!last) continue;
      if (last.role === "assistant" && last.state === "done") return last.text ?? null;
      if (last.role === "assistant") { statusText.value = "Thinking…"; }
    } catch { /* keep polling */ }
  }
  return null;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => { pollTimer = setTimeout(resolve, ms); });
}

// ── Task submission ───────────────────────────────────────────────────────────
async function submitTask() {
  if (!taskCreator.draft) return;
  taskCreator.updateDraftField("to", draftTo.value);
  taskCreator.updateDraftField("headline", draftHeadline.value);
  taskCreator.updateDraftField("brief", draftBrief.value);
  taskCreator.updateDraftField("project", draftProject.value || null);
  taskCreator.updateDraftField("priority", draftPriority.value);
  taskCreator.updateDraftField("kind", draftKind.value);
  submitError.value = "";
  const result = await taskCreator.submitDraft();
  if (result.ok) {
    submitted.value = true;
    document.dispatchEvent(new CustomEvent("voice:task-created", { detail: { id: result.id } }));
    speakReply("Task created — I've queued it for you.");
    // Auto-close after speaking
    setTimeout(() => {
      if (voice.mode === "task-creator") voice.close();
    }, 3000);
  } else {
    submitError.value = result.error ?? "Unknown error";
  }
}

// ── Hold-to-talk ─────────────────────────────────────────────────────────────
const HOLD_MS = 250;
let holdTimer2: ReturnType<typeof setTimeout> | null = null;
let holdMode = false;
let pressStart = 0;

function pressDown(e: Event) {
  e.preventDefault();
  pressStart = Date.now();
  holdTimer2 = setTimeout(() => {
    holdMode = true;
    if (!busy && (!recorder || recorder.state === "inactive")) startRecording();
  }, HOLD_MS);
}
function pressUp(e: Event) {
  e.preventDefault();
  if (holdTimer2) clearTimeout(holdTimer2);
  const dur = Date.now() - pressStart;
  if (holdMode) {
    holdMode = false;
    if (recorder?.state !== "inactive") stopAndExtract();
  } else if (dur < HOLD_MS) {
    if (recorder?.state !== "inactive") stopAndExtract();
    else if (!busy) startRecording();
  }
}
function pressLeave() {
  if (holdMode) {
    holdMode = false;
    if (holdTimer2) clearTimeout(holdTimer2);
    if (recorder?.state !== "inactive") stopAndExtract();
  }
}

// ── Open / close ─────────────────────────────────────────────────────────────
function openMode() {
  taskCreator.reset();
  busy = false;
  statusText.value = "Describe the task you want to create";
  isListening.value = false;
  isProcessing.value = false;
  heardText.value = "";
  replyText.value = "";
  submitError.value = "";
  submitted.value = false;
}

function closeMode() {
  stopStream();
  stopAudio();
  busy = false;
  if (recorder?.state !== "inactive") { recorder?.stop(); recorder = null; }
  if (pollTimer) clearTimeout(pollTimer);
}

watch(
  () => voice.mode,
  (mode, prev) => {
    if (mode === "task-creator" && prev !== "task-creator") openMode();
    if (prev === "task-creator" && mode !== "task-creator") closeMode();
  }
);

onMounted(() => { if (voice.mode === "task-creator") openMode(); });
onBeforeUnmount(() => { closeMode(); });

function cancel() { closeMode(); voice.close(); }
function resetDraft() {
  taskCreator.reset();
  heardText.value = "";
  replyText.value = "";
  submitted.value = false;
  statusText.value = "Describe the task you want to create";
}
</script>

<template>
  <!-- Stage 2: Voice Task Creator overlay -->
  <div class="voice-mode-overlay vtc-overlay" role="dialog" aria-modal="true">

    <!-- Transcript / result area -->
    <div class="voice-mode-transcript vtc-transcript">
      <template v-if="submitted">
        <div class="vtc-success">
          <i class="fa-solid fa-circle-check vtc-success-icon" />
          <div>Task created!</div>
        </div>
      </template>
      <template v-else-if="hasDraft">
        <!-- Confirmation card -->
        <div class="vtc-card">
          <div class="vtc-card-header">
            <i class="fa-solid fa-clipboard-list" /> Review task
          </div>
          <div class="vtc-field">
            <label>Agent</label>
            <input v-model="draftTo" class="vtc-input" />
          </div>
          <div class="vtc-field">
            <label>Priority</label>
            <select v-model="draftPriority" class="vtc-input vtc-select">
              <option>P0</option><option>P1</option><option>P2</option><option>P3</option>
            </select>
          </div>
          <div class="vtc-field">
            <label>Project</label>
            <input v-model="draftProject" class="vtc-input" placeholder="(none)" />
          </div>
          <div class="vtc-field">
            <label>Kind</label>
            <select v-model="draftKind" class="vtc-input vtc-select">
              <option>research</option><option>code</option><option>review</option>
              <option>summarise</option><option>decide</option><option>other</option>
            </select>
          </div>
          <div class="vtc-field">
            <label>Headline</label>
            <input v-model="draftHeadline" class="vtc-input" />
          </div>
          <div class="vtc-field vtc-brief-field">
            <label>Brief</label>
            <textarea v-model="draftBrief" class="vtc-input vtc-textarea" rows="4" />
          </div>
          <div v-if="submitError" class="vtc-error">{{ submitError }}</div>
          <div class="vtc-card-actions">
            <button class="vtc-btn vtc-btn-ghost" type="button" @click="resetDraft">
              <i class="fa-solid fa-rotate-left" /> Redo
            </button>
            <button
              class="vtc-btn vtc-btn-primary"
              type="button"
              :disabled="isSubmitting"
              @click="submitTask"
            >
              <i class="fa-solid fa-paper-plane" />
              {{ isSubmitting ? "Creating…" : "Create Task →" }}
            </button>
          </div>
        </div>
      </template>
      <template v-else>
        <!-- Before extraction: show heard text and status -->
        <div v-if="heardText" class="vm-heard">"{{ heardText }}"</div>
        <div v-if="replyText" class="vm-reply vm-active">{{ replyText }}</div>
      </template>
    </div>

    <!-- Controls -->
    <div class="vm-controls">
      <div class="voice-mode-status">{{ statusText }}</div>
      <button
        v-if="!hasDraft && !submitted"
        class="voice-mode-btn"
        :class="{ listening: isListening, processing: isProcessing }"
        type="button"
        aria-label="Hold to describe task"
        @mousedown="pressDown"
        @touchstart.prevent="pressDown"
        @mouseup="pressUp"
        @touchend.prevent="pressUp"
        @mouseleave="pressLeave"
      >
        <i :class="isListening ? 'fa-solid fa-stop' : 'fa-solid fa-microphone'" />
      </button>
      <button class="voice-mode-close" type="button" aria-label="Cancel" @click="cancel">
        <i class="fa-solid fa-xmark" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.vtc-overlay {
  --vtc-accent: #6ee7b7;
}

.vtc-transcript {
  padding: 20px 20px 8px;
}

.vtc-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
  color: var(--vtc-accent, #6ee7b7);
  font-size: 17px;
  font-weight: 500;
}
.vtc-success-icon { font-size: 48px; }

.vtc-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.vtc-card-header {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vtc-accent, #6ee7b7);
  margin-bottom: 4px;
}
.vtc-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.vtc-field label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted, #8a9ab0);
}
.vtc-input {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: var(--text, #e8edf4);
  font-family: inherit;
  font-size: 14px;
  padding: 6px 10px;
  width: 100%;
  box-sizing: border-box;
}
.vtc-input:focus { outline: none; border-color: var(--vtc-accent, #6ee7b7); }
.vtc-select { cursor: pointer; }
.vtc-textarea { resize: vertical; min-height: 70px; }
.vtc-brief-field { flex: 1; }
.vtc-error {
  color: #f87171;
  font-size: 13px;
}
.vtc-card-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 4px;
}
.vtc-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  padding: 8px 16px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s ease;
}
.vtc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.vtc-btn-ghost {
  background: rgba(255, 255, 255, 0.06);
  color: var(--muted, #8a9ab0);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.vtc-btn-primary {
  background: var(--vtc-accent, #6ee7b7);
  color: #0a1a12;
}
.vtc-btn-primary:hover:not(:disabled) { opacity: 0.9; }
</style>
