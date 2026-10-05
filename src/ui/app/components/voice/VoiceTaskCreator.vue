<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import BaseModal from "../modal/BaseModal.vue";
import { useVoiceStore } from "./store/voice";
import { useTaskCreatorStore } from "./store/taskCreator";
import { stripMarkdown, esc, detectMimeType, speakFetch } from "./utils";

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
const showModal = ref(false);
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

const priorityOptions = ["P0", "P1", "P2", "P3"];
const kindOptions = ["research", "code", "review", "summarise", "decide", "other"];

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
  const p = speakFetch(stripped)
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
  const spoken = fullReply.replace(/<task>[\s\S]*?<\/task>/gi, "").trim();
  if (!spoken) return;
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
  taskCreator.addAssistantMessage(reply);
  replyText.value = reply;
  speakReply(reply);
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

function cancel() { closeMode(); voice.close(); }
function resetDraft() {
  taskCreator.reset();
  heardText.value = "";
  replyText.value = "";
  submitted.value = false;
  statusText.value = "Describe the task you want to create";
}

// BModal @hide fires when user closes (X, Esc, backdrop). Guard against
// double-calls when showModal is set to false externally.
function onModalHide() {
  if (voice.mode === "task-creator") cancel();
}

watch(
  () => voice.mode,
  (mode, prev) => {
    if (mode === "task-creator" && prev !== "task-creator") {
      openMode();
      showModal.value = true;
    }
    if (prev === "task-creator" && mode !== "task-creator") {
      showModal.value = false;
      closeMode();
    }
  }
);

onMounted(() => {
  if (voice.mode === "task-creator") {
    openMode();
    showModal.value = true;
  }
});
onBeforeUnmount(() => { closeMode(); });
</script>

<template>
  <BaseModal
    :open="showModal"
    size="lg"
    title="Create a task from voice"
    :dismissible="true"
    @close="onModalHide"
  >
    <!-- No default Done footer — the form carries its own action buttons -->
    <template #footer></template>

    <!-- ── Success state ──────────────────────────────────────────────── -->
    <div v-if="submitted" class="vtc-success">
      <span class="vtc-success-icon">✓</span>
      <div class="vtc-success-label">Task created!</div>
      <div class="vtc-success-sub">Closing in a moment…</div>
    </div>

    <!-- ── Confirmation form ──────────────────────────────────────────── -->
    <div v-else-if="hasDraft" class="vtc-form">
      <div v-if="replyText" class="vtc-claude-reply">
        <span class="vtc-claude-label">Claude said</span>
        {{ replyText.replace(/<task>[\s\S]*?<\/task>/gi, "").trim() }}
      </div>

      <div class="vtc-field">
        <label class="vtc-label" for="vtc-to">Agent</label>
        <input id="vtc-to" v-model="draftTo" class="vtc-input" type="text" />
      </div>

      <div class="vtc-row">
        <div class="vtc-field">
          <label class="vtc-label" for="vtc-priority">Priority</label>
          <select id="vtc-priority" v-model="draftPriority" class="vtc-select">
            <option v-for="p in priorityOptions" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
        <div class="vtc-field">
          <label class="vtc-label" for="vtc-kind">Kind</label>
          <select id="vtc-kind" v-model="draftKind" class="vtc-select">
            <option v-for="k in kindOptions" :key="k" :value="k">{{ k }}</option>
          </select>
        </div>
      </div>

      <div class="vtc-field">
        <label class="vtc-label" for="vtc-project">Project</label>
        <input id="vtc-project" v-model="draftProject" class="vtc-input" type="text" placeholder="(none)" />
      </div>

      <div class="vtc-field">
        <label class="vtc-label" for="vtc-headline">Headline</label>
        <input id="vtc-headline" v-model="draftHeadline" class="vtc-input" type="text" />
      </div>

      <div class="vtc-field">
        <label class="vtc-label" for="vtc-brief">Brief</label>
        <textarea id="vtc-brief" v-model="draftBrief" class="vtc-textarea" rows="4" />
      </div>

      <div v-if="submitError" class="vtc-error">{{ submitError }}</div>

      <div class="vtc-actions">
        <button class="vtc-btn vtc-btn--secondary" type="button" @click="resetDraft">↺ Redo</button>
        <button class="vtc-btn vtc-btn--primary" type="button" :disabled="isSubmitting" @click="submitTask">
          {{ isSubmitting ? "Creating…" : "✈ Create Task" }}
        </button>
      </div>
    </div>

    <!-- ── Voice capture phase ────────────────────────────────────────── -->
    <div v-else class="vtc-capture">
      <div class="vtc-status">{{ statusText }}</div>

      <button
        class="voice-mode-btn vtc-mic-btn"
        :class="{ listening: isListening, processing: isProcessing }"
        type="button"
        aria-label="Hold to describe task"
        @mousedown="pressDown"
        @touchstart.prevent="pressDown"
        @mouseup="pressUp"
        @touchend.prevent="pressUp"
        @mouseleave="pressLeave"
      >
        <span v-if="isListening">◼</span>
        <span v-else>🎙</span>
      </button>

      <div v-if="heardText" class="vm-heard">"{{ heardText }}"</div>
      <div v-if="replyText" class="vm-reply vm-active">{{ replyText }}</div>
    </div>
  </BaseModal>
</template>

<style scoped>
.vtc-success {
  text-align: center;
  padding: 2rem 0;
}
.vtc-success-icon {
  display: block;
  font-size: 3rem;
  color: #6ee7b7;
  margin-bottom: 0.75rem;
}
.vtc-success-label {
  font-size: 1.1rem;
  font-weight: 600;
}
.vtc-success-sub {
  color: var(--text-muted, #8a9bb8);
  margin-top: 0.25rem;
}

.vtc-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.vtc-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.vtc-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.vtc-label {
  font-size: 0.78rem;
  color: var(--text-muted, #8a9bb8);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.vtc-input,
.vtc-select,
.vtc-textarea {
  background: var(--surface-2, #1a2030);
  border: 1px solid var(--border-subtle, #333);
  border-radius: 4px;
  color: inherit;
  font-size: 0.875rem;
  padding: 6px 8px;
  width: 100%;
  font-family: inherit;
}
.vtc-textarea { resize: vertical; min-height: 80px; }
.vtc-input:focus,
.vtc-select:focus,
.vtc-textarea:focus {
  outline: 2px solid var(--accent, #7dc5ff);
  outline-offset: -1px;
}
.vtc-claude-reply {
  font-size: 13px;
  background: rgba(110, 231, 183, 0.06);
  border: 1px solid rgba(110, 231, 183, 0.15);
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  color: inherit;
  font-style: italic;
}
.vtc-claude-label {
  display: block;
  font-size: 0.72rem;
  color: var(--text-muted, #8a9bb8);
  text-transform: uppercase;
  margin-bottom: 4px;
  font-style: normal;
}
.vtc-error {
  background: rgba(239,68,68,0.12);
  border: 1px solid rgba(239,68,68,0.4);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  color: #f87171;
}
.vtc-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 0.25rem;
}
.vtc-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 5px;
  font-size: 0.875rem;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.1s;
}
.vtc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.vtc-btn--secondary {
  background: var(--surface-3, #2a3040);
  color: inherit;
}
.vtc-btn--secondary:hover { opacity: 0.8; }
.vtc-btn--primary {
  background: #6ee7b7;
  color: #0a1020;
  font-weight: 600;
}
.vtc-btn--primary:hover { opacity: 0.85; }

.vtc-capture {
  text-align: center;
  padding: 1.5rem 0;
}
.vtc-status {
  color: var(--text-muted, #8a9bb8);
  margin-bottom: 1.5rem;
}
.vtc-mic-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
}
.vm-heard {
  font-style: italic;
  color: var(--text-secondary, #c8d8ee);
  margin-top: 0.5rem;
}
.vm-reply.vm-active {
  color: #6ee7b7;
  font-weight: 500;
  margin-top: 0.5rem;
}
</style>
