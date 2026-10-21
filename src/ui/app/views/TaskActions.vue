<script setup lang="ts">
/**
 * TaskActions.vue — full action-parity matrix for EnvelopeView.
 *
 * Action-parity matrix (from renderPanelCard + /api/tasks/* endpoints):
 *
 * | # | Control              | Shown when                                        | Endpoint                       |
 * |---|----------------------|---------------------------------------------------|--------------------------------|
 * | 1 | Continue (form)      | isCurrent && isTerminal && !isClosed              | POST /api/tasks/{id}/next      |
 * | 2 | ↳ Next (button)      | isCurrent && !isClosed                            | POST /api/tasks/{id}/next      |
 * | 3 | ✓ Done reading       | isCurrent && isTerminal && !isClaimed && !isClosed | POST /api/tasks/{id}/close     |
 * | 4 | ✕ Cancel (form)      | isCurrent && !isTerminal && !isClaimed && !isClosed | POST /api/tasks/{id}/close    |
 * | 5 | ✕ Abort (form)       | isCurrent && isClaimed && !isClosed               | POST /api/tasks/{id}/abort     |
 * | 6 | ↻ Reopen             | isCurrent && isClosed                             | POST /api/tasks/{id}/reopen    |
 * | 7 | ▷ Resume             | isCurrent && isPaused && !isClosed                | POST /api/tasks/{id}/resume    |
 * | 8 | 💬 Chat (form toggle) | always (form body: isCurrent)                    | POST /api/chat (dispatch)      |
 * | 9 | 📁 Project chip      | always visible (edit: isCurrent → EnvelopeHeader)  | POST /api/tasks/{id}/project   |
 * |10 | ✎ Rename headline    | isCurrent (inline in EnvelopeHeader)              | POST /api/tasks/{id}/rename    |
 *
 * Controls 9+10 are wired in EnvelopeHeader; this component handles 1–8.
 *
 * WAL-116: every action has error state + retry (no wedge on transient failure).
 */
import { ref, computed } from "vue";
import { countActiveDescendants } from "../pages/tasks/helpers";
import type { TaskRow } from "../stores/tasks";

const props = defineProps<{
  task: TaskRow | null;
  cache: TaskRow[];
}>();

const emit = defineEmits<{
  (e: "action-done", action: string, taskId: string): void;
}>();

// ── Derived state ──────────────────────────────────────────────────────────────

const id = computed(() => props.task?.id ?? "");
const agent = computed(() => props.task?.agent ?? props.task?.to ?? "");
const statusLower = computed(() => (props.task?.status ?? "").toLowerCase());
const isTerminal = computed(() =>
  statusLower.value.startsWith("done") ||
  statusLower.value.startsWith("failed") ||
  statusLower.value === "escalated"
);
const isClaimed = computed(() => props.task?.status === "claimed");
const isPaused = computed(() => props.task?.status === "paused");
const isClosed = computed(() => !!(props.task?.closed && props.task.closed.status));
const isWaitingUser = computed(() => props.task?.status === "waiting:on:user");

const closeDefaultStatus = computed(() =>
  statusLower.value === "done" ? "closed" : "cancelled"
);
const activeDescendantCount = computed(() =>
  id.value && props.cache.length ? countActiveDescendants(id.value, props.cache) : 0
);

// ── Form visibility toggles ────────────────────────────────────────────────────

const showContinueForm = ref(false);
const showCloseForm = ref(false);
const showAbortForm = ref(false);
const showChatForm = ref(false);

// ── Continue / Next (↳) form — POST /api/tasks/{id}/next ──────────────────────

const continueHeadline = ref("");
const continueInstruction = ref("");
const continueLoading = ref(false);
const continueError = ref<string | null>(null);

function openContinueForm(): void {
  const base = (props.task?.headline ?? id.value).slice(0, 56);
  continueHeadline.value = base + " — rework";
  continueInstruction.value = "";
  continueError.value = null;
  showContinueForm.value = true;
}

function closeContinueForm(): void {
  showContinueForm.value = false;
  continueError.value = null;
}

async function submitContinue(): Promise<void> {
  if (!id.value) return;
  continueLoading.value = true;
  continueError.value = null;
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(id.value)}/next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: agent.value,
        source: "continue",
        headline: continueHeadline.value.trim() || undefined,
        instruction: continueInstruction.value,
      }),
    });
    const data = await r.json() as { ok?: boolean; error?: string };
    if (!data.ok) { continueError.value = data.error ?? "spawn failed"; return; }
    showContinueForm.value = false;
    emit("action-done", "next", id.value);
  } catch (err) {
    continueError.value = String((err as Error).message ?? err);
  } finally {
    continueLoading.value = false;
  }
}

// ── Done reading — POST /api/tasks/{id}/close {status:"closed"} ───────────────

const doneReadingLoading = ref(false);
const doneReadingError = ref<string | null>(null);

async function submitDoneReading(): Promise<void> {
  if (!id.value) return;
  doneReadingLoading.value = true;
  doneReadingError.value = null;
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(id.value)}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: agent.value, reason: "", status: "closed", cascade: false }),
    });
    const data = await r.json() as { ok?: boolean; error?: string };
    if (!data.ok) { doneReadingError.value = data.error ?? "close failed"; return; }
    emit("action-done", "close", id.value);
  } catch (err) {
    doneReadingError.value = String((err as Error).message ?? err);
  } finally {
    doneReadingLoading.value = false;
  }
}

// ── Cancel (close form) — POST /api/tasks/{id}/close ──────────────────────────

const closeReason = ref("");
const closeCascade = ref(false);
const closeLoading = ref(false);
const closeError = ref<string | null>(null);

function openCloseForm(): void {
  closeReason.value = "";
  closeCascade.value = false;
  closeError.value = null;
  showCloseForm.value = true;
}

function cancelClose(): void {
  showCloseForm.value = false;
  closeError.value = null;
}

async function submitClose(): Promise<void> {
  if (!id.value) return;
  closeLoading.value = true;
  closeError.value = null;
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(id.value)}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: agent.value,
        status: closeDefaultStatus.value,
        reason: closeReason.value,
        cascade: closeCascade.value,
      }),
    });
    const data = await r.json() as { ok?: boolean; error?: string };
    if (!data.ok) { closeError.value = data.error ?? "close failed"; return; }
    showCloseForm.value = false;
    emit("action-done", "close", id.value);
  } catch (err) {
    closeError.value = String((err as Error).message ?? err);
  } finally {
    closeLoading.value = false;
  }
}

// ── Abort — POST /api/tasks/{id}/abort ────────────────────────────────────────

const abortReason = ref("");
const abortLoading = ref(false);
const abortError = ref<string | null>(null);

function openAbortForm(): void {
  abortReason.value = "";
  abortError.value = null;
  showAbortForm.value = true;
}

function cancelAbort(): void {
  showAbortForm.value = false;
  abortError.value = null;
}

async function submitAbort(): Promise<void> {
  if (!id.value) return;
  abortLoading.value = true;
  abortError.value = null;
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(id.value)}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: agent.value, reason: abortReason.value }),
    });
    const data = await r.json() as { ok?: boolean; error?: string };
    if (!data.ok) { abortError.value = data.error ?? "abort failed"; return; }
    showAbortForm.value = false;
    emit("action-done", "abort", id.value);
  } catch (err) {
    abortError.value = String((err as Error).message ?? err);
  } finally {
    abortLoading.value = false;
  }
}

// ── Reopen — POST /api/tasks/{id}/reopen ──────────────────────────────────────

const reopenLoading = ref(false);
const reopenError = ref<string | null>(null);

async function submitReopen(): Promise<void> {
  if (!id.value) return;
  reopenLoading.value = true;
  reopenError.value = null;
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(id.value)}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: agent.value }),
    });
    const data = await r.json() as { ok?: boolean; error?: string };
    if (!data.ok) { reopenError.value = data.error ?? "reopen failed"; return; }
    emit("action-done", "reopen", id.value);
  } catch (err) {
    reopenError.value = String((err as Error).message ?? err);
  } finally {
    reopenLoading.value = false;
  }
}

// ── Resume — POST /api/tasks/{id}/resume ──────────────────────────────────────

const resumeLoading = ref(false);
const resumeError = ref<string | null>(null);

async function submitResume(): Promise<void> {
  if (!id.value) return;
  resumeLoading.value = true;
  resumeError.value = null;
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(id.value)}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: agent.value }),
    });
    const data = await r.json() as { ok?: boolean; error?: string };
    if (!data.ok) { resumeError.value = data.error ?? "resume failed"; return; }
    emit("action-done", "resume", id.value);
  } catch (err) {
    resumeError.value = String((err as Error).message ?? err);
  } finally {
    resumeLoading.value = false;
  }
}

// ── Chat form toggle — dispatches via /api/tasks/{id}/next as a chat task ─────

const chatTitle = ref("");
const chatMessage = ref("");
const chatLoading = ref(false);
const chatError = ref<string | null>(null);

function openChatForm(): void {
  chatTitle.value = (props.task?.headline ?? "").slice(0, 56);
  chatMessage.value = "";
  chatError.value = null;
  showChatForm.value = !showChatForm.value;
}

async function submitChat(): Promise<void> {
  if (!id.value) return;
  chatLoading.value = true;
  chatError.value = null;
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(id.value)}/next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: agent.value,
        source: "continue",
        headline: chatTitle.value.trim() || `Chat: ${(props.task?.headline ?? id.value).slice(0, 48)}`,
        instruction: chatMessage.value,
      }),
    });
    const data = await r.json() as { ok?: boolean; error?: string };
    if (!data.ok) { chatError.value = data.error ?? "chat spawn failed"; return; }
    showChatForm.value = false;
    emit("action-done", "chat", id.value);
  } catch (err) {
    chatError.value = String((err as Error).message ?? err);
  } finally {
    chatLoading.value = false;
  }
}
</script>

<template>
  <div class="ev-actions" v-if="task">

    <!-- ── Action buttons row ─────────────────────────────────────────────── -->
    <div class="ev-actions-row">

      <!-- ↳ Next (follow-on): isCurrent && !isClosed -->
      <button
        v-if="!isClosed"
        class="ev-action-btn"
        type="button"
        @click="openContinueForm"
        data-ev-action="next"
      >↳ Next</button>

      <!-- 💬 Chat: always -->
      <button
        class="ev-action-btn"
        :class="{ 'is-active': showChatForm }"
        type="button"
        @click="openChatForm"
        data-ev-action="chat"
      >💬 Chat</button>

      <!-- ✓ Done reading: isTerminal && !isClaimed && !isClosed -->
      <button
        v-if="isTerminal && !isClaimed && !isClosed"
        class="ev-action-btn is-primary"
        :disabled="doneReadingLoading"
        type="button"
        @click="submitDoneReading"
        data-ev-action="done-reading"
      >✓ Done reading</button>

      <!-- ✕ Cancel (close): !isTerminal && !isClaimed && !isClosed -->
      <button
        v-if="!isTerminal && !isClaimed && !isClosed"
        class="ev-action-btn"
        type="button"
        @click="openCloseForm"
        data-ev-action="cancel"
      >✕ Cancel</button>

      <!-- ✕ Abort: isClaimed && !isClosed -->
      <button
        v-if="isClaimed && !isClosed"
        class="ev-action-btn is-danger"
        type="button"
        @click="openAbortForm"
        data-ev-action="abort"
      >✕ Abort</button>

      <!-- ↻ Reopen: isClosed -->
      <button
        v-if="isClosed"
        class="ev-action-btn is-primary"
        :disabled="reopenLoading"
        type="button"
        @click="submitReopen"
        data-ev-action="reopen"
      >↻ Reopen</button>

      <!-- ▷ Resume: isPaused && !isClosed -->
      <button
        v-if="isPaused && !isClosed"
        class="ev-action-btn is-primary"
        :disabled="resumeLoading"
        type="button"
        @click="submitResume"
        data-ev-action="resume"
      >▷ Resume</button>
    </div>

    <!-- Done-reading error -->
    <p v-if="doneReadingError" class="ev-action-error" role="alert">
      {{ doneReadingError }}
      <button type="button" @click="submitDoneReading">Retry</button>
    </p>

    <!-- Reopen error -->
    <p v-if="reopenError" class="ev-action-error" role="alert">
      {{ reopenError }}
      <button type="button" @click="submitReopen">Retry</button>
    </p>

    <!-- Resume error -->
    <p v-if="resumeError" class="ev-action-error" role="alert">
      {{ resumeError }}
      <button type="button" @click="submitResume">Retry</button>
    </p>

    <!-- ── Continue form: isTerminal && !isClosed ─────────────────────────── -->
    <div v-if="isTerminal && !isClosed && showContinueForm" class="ev-form" data-ev-form="continue">
      <p class="ev-form-hint">Type new instructions; a child task picks up on the same session thread. The parent closes as superseded at dispatch.</p>
      <input
        class="ev-form-input"
        v-model="continueHeadline"
        placeholder="Child task title"
        type="text"
        :disabled="continueLoading"
      />
      <textarea
        class="ev-form-textarea"
        v-model="continueInstruction"
        rows="4"
        placeholder="New instructions for the worker…"
        :disabled="continueLoading"
      ></textarea>
      <div class="ev-form-actions">
        <button
          type="button"
          class="ev-action-btn is-primary"
          :disabled="continueLoading"
          @click="submitContinue"
          data-ev-submit="next"
        >↳ Continue</button>
        <button type="button" class="ev-action-btn" @click="closeContinueForm">Dismiss</button>
        <span v-if="continueError" class="ev-action-error" role="alert">
          {{ continueError }}
          <button type="button" @click="submitContinue">Retry</button>
        </span>
      </div>
    </div>

    <!-- ── Close form: !isTerminal && !isClaimed && !isClosed ────────────────── -->
    <div v-if="!isTerminal && !isClaimed && !isClosed && showCloseForm" class="ev-form" data-ev-form="close">
      <details class="ev-form-warn">
        <summary>
          <template v-if="isWaitingUser">Record the outcome and mark <strong>cancelled</strong>.</template>
          <template v-else>Marks <strong>{{ closeDefaultStatus }}</strong> — reversible, runner state kept.</template>
        </summary>
      </details>
      <textarea
        class="ev-form-textarea"
        v-model="closeReason"
        rows="2"
        :placeholder="isWaitingUser ? 'What was the outcome? e.g. decided to use approach B — optional' : 'Optional reason (e.g. rolled into TSK-X, no longer needed)…'"
        :disabled="closeLoading"
      ></textarea>
      <label v-if="activeDescendantCount > 0" class="ev-form-cascade">
        <input type="checkbox" v-model="closeCascade" :disabled="closeLoading" />
        <span>Close family — cancel {{ activeDescendantCount }} active descendant{{ activeDescendantCount === 1 ? '' : 's' }} too</span>
      </label>
      <div class="ev-form-actions">
        <button
          type="button"
          class="ev-action-btn is-primary"
          :disabled="closeLoading"
          @click="submitClose"
          data-ev-submit="close"
        >Confirm close</button>
        <button type="button" class="ev-action-btn" @click="cancelClose">Dismiss</button>
        <span v-if="closeError" class="ev-action-error" role="alert">
          {{ closeError }}
          <button type="button" @click="submitClose">Retry</button>
        </span>
      </div>
    </div>

    <!-- ── Abort form: isClaimed && !isClosed ─────────────────────────────── -->
    <div v-if="isClaimed && !isClosed && showAbortForm" class="ev-form ev-form-danger" data-ev-form="abort">
      <details class="ev-form-warn">
        <summary><strong>⚠ Kills the live process. Not reversible.</strong></summary>
      </details>
      <textarea
        class="ev-form-textarea"
        v-model="abortReason"
        rows="2"
        placeholder="Optional reason…"
        :disabled="abortLoading"
      ></textarea>
      <div class="ev-form-actions">
        <button
          type="button"
          class="ev-action-btn is-danger"
          :disabled="abortLoading"
          @click="submitAbort"
          data-ev-submit="abort"
        >Kill worker &amp; cancel</button>
        <button type="button" class="ev-action-btn" @click="cancelAbort">Dismiss</button>
        <span v-if="abortError" class="ev-action-error" role="alert">
          {{ abortError }}
          <button type="button" @click="submitAbort">Retry</button>
        </span>
      </div>
    </div>

    <!-- ── Chat form: isCurrent (shown when showChatForm) ─────────────────── -->
    <div v-if="showChatForm" class="ev-form" data-ev-form="chat">
      <details class="ev-form-warn">
        <summary>Continues on the worker's session thread.</summary>
        <p>Chat opens on the same thread as the task worker, so the agent's prior context is in cache.</p>
      </details>
      <input
        class="ev-form-input"
        v-model="chatTitle"
        placeholder="Chat title (auto if blank)"
        type="text"
        :disabled="chatLoading"
      />
      <textarea
        class="ev-form-textarea"
        v-model="chatMessage"
        rows="3"
        placeholder="Initial message (optional)…"
        :disabled="chatLoading"
      ></textarea>
      <div class="ev-form-actions">
        <button
          type="button"
          class="ev-action-btn is-primary"
          :disabled="chatLoading"
          @click="submitChat"
          data-ev-submit="chat"
        >↳ Start chat</button>
        <button type="button" class="ev-action-btn" @click="showChatForm = false">Dismiss</button>
        <span v-if="chatError" class="ev-action-error" role="alert">
          {{ chatError }}
          <button type="button" @click="submitChat">Retry</button>
        </span>
      </div>
    </div>

  </div>
</template>

<style scoped>
.ev-actions {
  padding: 8px 12px 4px;
  border-bottom: 1px solid var(--ts-border, #3a3a3a);
}

.ev-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}

.ev-action-btn {
  background: transparent;
  border: 1px solid var(--ts-border, #3a3a3a);
  color: var(--ts-text-secondary, #aaa);
  cursor: pointer;
  font-size: 0.82em;
  padding: 5px 12px;
  border-radius: 3px;
  min-height: 30px;
}

.ev-action-btn:hover:not(:disabled) {
  color: var(--ts-text, #eee);
  border-color: var(--ts-text-secondary, #aaa);
}

.ev-action-btn.is-primary {
  background: var(--ts-accent, #3a3a9a);
  color: #fff;
  border-color: var(--ts-accent, #3a3a9a);
}

.ev-action-btn.is-primary:hover:not(:disabled) {
  background: var(--ts-accent-hover, #4a4aaa);
}

.ev-action-btn.is-danger {
  background: transparent;
  border-color: var(--ts-danger, #8a3a3a);
  color: var(--ts-danger, #e05a5a);
}

.ev-action-btn.is-active {
  background: var(--ts-surface-2, #2a2a2a);
  color: var(--ts-text, #eee);
}

.ev-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 390px) {
  .ev-action-btn { min-height: 44px; padding: 8px 14px; }
}

.ev-form {
  margin-top: 8px;
  padding: 10px;
  background: var(--ts-surface-2, #2a2a2a);
  border: 1px solid var(--ts-border, #3a3a3a);
  border-radius: 4px;
}

.ev-form-danger { border-color: var(--ts-danger, #8a3a3a); }

.ev-form-warn {
  font-size: 0.82em;
  color: var(--ts-text-secondary, #aaa);
  margin-bottom: 8px;
}

.ev-form-warn summary { cursor: pointer; }

.ev-form-hint {
  font-size: 0.82em;
  color: var(--ts-text-secondary, #aaa);
  margin: 0 0 8px;
}

.ev-form-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--ts-surface-3, #1e1e1e);
  border: 1px solid var(--ts-border, #3a3a3a);
  color: var(--ts-text, #eee);
  padding: 5px 8px;
  font-size: 0.88em;
  border-radius: 3px;
  margin-bottom: 6px;
}

.ev-form-textarea {
  width: 100%;
  box-sizing: border-box;
  background: var(--ts-surface-3, #1e1e1e);
  border: 1px solid var(--ts-border, #3a3a3a);
  color: var(--ts-text, #eee);
  padding: 5px 8px;
  font-size: 0.88em;
  border-radius: 3px;
  resize: vertical;
  margin-bottom: 6px;
}

.ev-form-cascade {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82em;
  color: var(--ts-text-secondary, #aaa);
  margin-bottom: 8px;
  cursor: pointer;
}

.ev-form-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.ev-action-error {
  color: var(--ts-danger, #e05a5a);
  font-size: 0.82em;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ev-action-error button {
  background: none;
  border: 1px solid var(--ts-danger, #8a3a3a);
  color: var(--ts-danger, #e05a5a);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
}
</style>
