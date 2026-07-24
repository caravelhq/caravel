<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import {
  BModal,
  BFormGroup,
  BFormInput,
  BFormTextarea,
  BFormSelect,
  BFormSelectOption,
  BButton,
  BAlert,
} from "bootstrap-vue-next";
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
  <BModal
    v-model="showModal"
    size="lg"
    no-close-on-backdrop
    hide-footer
    scrollable
    centered
    @hide="onModalHide"
  >
    <template #title>
      <span class="vtc-modal-title">
        <i class="fa-solid fa-list-check me-2" style="color: #6ee7b7" />
        Create a task from voice
      </span>
    </template>

    <!-- ── Success state ───────────────────────────────────────────────── -->
    <template v-if="submitted">
      <div class="vtc-success text-center py-4">
        <i class="fa-solid fa-circle-check vtc-success-icon mb-3" />
        <div class="fw-medium fs-5">Task created!</div>
        <div class="text-secondary mt-1">Closing in a moment…</div>
      </div>
    </template>

    <!-- ── Confirmation form ───────────────────────────────────────────── -->
    <template v-else-if="hasDraft">
      <div v-if="replyText" class="vtc-claude-reply mb-3 p-3 rounded">
        <small class="text-secondary d-block mb-1">Claude said</small>
        {{ replyText.replace(/<task>[\s\S]*?<\/task>/gi, "").trim() }}
      </div>

      <BFormGroup label="Agent" label-for="vtc-to" class="mb-2">
        <BFormInput id="vtc-to" v-model="draftTo" size="sm" />
      </BFormGroup>

      <div class="row g-2 mb-2">
        <div class="col-6">
          <BFormGroup label="Priority" label-for="vtc-priority">
            <BFormSelect id="vtc-priority" v-model="draftPriority" size="sm">
              <BFormSelectOption v-for="p in priorityOptions" :key="p" :value="p">{{ p }}</BFormSelectOption>
            </BFormSelect>
          </BFormGroup>
        </div>
        <div class="col-6">
          <BFormGroup label="Kind" label-for="vtc-kind">
            <BFormSelect id="vtc-kind" v-model="draftKind" size="sm">
              <BFormSelectOption v-for="k in kindOptions" :key="k" :value="k">{{ k }}</BFormSelectOption>
            </BFormSelect>
          </BFormGroup>
        </div>
      </div>

      <BFormGroup label="Project" label-for="vtc-project" class="mb-2">
        <BFormInput id="vtc-project" v-model="draftProject" size="sm" placeholder="(none)" />
      </BFormGroup>

      <BFormGroup label="Headline" label-for="vtc-headline" class="mb-2">
        <BFormInput id="vtc-headline" v-model="draftHeadline" size="sm" />
      </BFormGroup>

      <BFormGroup label="Brief" label-for="vtc-brief" class="mb-3">
        <BFormTextarea id="vtc-brief" v-model="draftBrief" rows="4" size="sm" />
      </BFormGroup>

      <BAlert v-if="submitError" variant="danger" :model-value="true" class="mb-3">
        {{ submitError }}
      </BAlert>

      <div class="d-flex gap-2 justify-content-end">
        <BButton variant="secondary" size="sm" @click="resetDraft">
          <i class="fa-solid fa-rotate-left me-1" /> Redo
        </BButton>
        <BButton variant="success" size="sm" :disabled="isSubmitting" @click="submitTask">
          <i class="fa-solid fa-paper-plane me-1" />
          {{ isSubmitting ? "Creating…" : "Create Task" }}
        </BButton>
      </div>
    </template>

    <!-- ── Voice capture phase ─────────────────────────────────────────── -->
    <template v-else>
      <div class="vtc-capture text-center py-3">
        <div class="voice-mode-status mb-4">{{ statusText }}</div>

        <button
          class="voice-mode-btn mx-auto mb-4"
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

        <div v-if="heardText" class="vm-heard mt-2">"{{ heardText }}"</div>
        <div v-if="replyText" class="vm-reply vm-active mt-2">{{ replyText }}</div>
      </div>
    </template>
  </BModal>
</template>

<style scoped>
.vtc-modal-title {
  font-family: "Space Grotesk", sans-serif;
  font-weight: 600;
}

.vtc-success-icon {
  font-size: 3rem;
  color: #6ee7b7;
  display: block;
}

.vtc-capture .voice-mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}

.vtc-claude-reply {
  font-size: 14px;
  background: rgba(110, 231, 183, 0.06);
  border: 1px solid rgba(110, 231, 183, 0.15);
  color: inherit;
  font-style: italic;
}

/* Keep dark-context voice overlay styles working inside the modal body */
.voice-mode-status {
  color: var(--bs-secondary-color, #adb5bd);
}
.vm-heard {
  font-style: italic;
  color: var(--bs-body-color, #dee2e6);
}
.vm-reply.vm-active {
  color: #6ee7b7;
  font-weight: 500;
}
</style>
