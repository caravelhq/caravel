<script setup lang="ts">
/**
 * TaskActions.vue — full action-parity matrix for EnvelopeView.
 *
 * Action-parity matrix (from renderPanelCard + /api/tasks/* endpoints):
 *
 * | # | Control              | Shown when                                         | Endpoint                      |
 * |---|----------------------|----------------------------------------------------|-------------------------------|
 * | 1 | Next (sub-view)      | EnvelopeView "Next" tab / NextPrompt.vue (DEC-0041)| POST /api/tasks/{id}/next     |
 * | 2 | ✓ Done reading       | isTerminal && !isClaimed && !isClosed              | POST /api/tasks/{id}/close    |
 * | 3 | ✕ Cancel (form)      | !isTerminal && !isClaimed && !isClosed             | POST /api/tasks/{id}/close    |
 * | 4 | ✕ Abort (form)       | isClaimed && !isClosed                             | POST /api/tasks/{id}/abort    |
 * | 5 | ↻ Reopen             | isClosed                                           | POST /api/tasks/{id}/reopen   |
 * | 6 | ▷ Resume             | isPaused && !isClosed                              | POST /api/tasks/{id}/resume   |
 * | 7 | 💬 Chat (redirect)    | always                                            | opens chat on task-<root>-<agent> |
 * | 8 | 📁 Project chip      | always (EnvelopeHeader)                            | POST /api/tasks/{id}/project  |
 * | 9 | ✎ Rename headline    | always (EnvelopeHeader)                            | POST /api/tasks/{id}/rename   |
 *
 * Control 1 (Next) is rendered in NextPrompt.vue — DEC-0041.
 * Controls 8+9 are wired in EnvelopeHeader; this component renders 2–7.
 *
 * WAL-116: every action has error state + retry (no wedge on transient failure).
 */
import { ref, computed } from "vue";
import { countActiveDescendants, taskThreadId } from "../pages/tasks/helpers";
import { useWorkspaceStore } from "../stores/workspace";
import { useChatStore } from "../stores/chat";
import type { TaskRow } from "../stores/tasks";

const ws = useWorkspaceStore();
const chatStore = useChatStore();

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

const showCloseForm = ref(false);
const showAbortForm = ref(false);

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

// ── Chat: open the task's own thread in the chat interface ────────────────────
//
// WAL-149: this used to spawn a follow-on task through a form embedded in the
// envelope. That model was deliberately retired — a chat about a task belongs
// in the chat interface, on the thread the worker is already using, not in a
// second composer with its own lifecycle. Phase 4 reintroduced the form when
// `launchChatForTask` was deleted along with the old TasksPage (bdc0b06); this
// restores the redirect against the workspace tab model.

const chatError = ref<string | null>(null);

function openChatThread(): void {
  chatError.value = null;
  const threadId = taskThreadId(id.value, agent.value);
  if (!threadId) {
    chatError.value = "No agent on this task — cannot resolve its chat thread.";
    return;
  }

  // Seed the composer via the store draft — never clobber something already
  // half-typed. ws.open picks up the draft when ChatView mounts.
  const seed = `Continue after ${id.value}\n`;
  if (!chatStore.getDraft(threadId)) chatStore.saveDraft(threadId, seed);

  ws.open({ kind: "chat", chatId: threadId });

  emit("action-done", "chat", id.value);
}
</script>

<template>
  <div class="ev-actions" v-if="task">

    <!-- ── Action buttons row (F3: visible in every sub-view) ──────────────── -->
    <!-- F6: compact buttons sized between the 19-21px header controls and 44px sub-tabs.
         Below 600px: icon only (text label hidden via CSS), aria-labels preserved. -->
    <div class="ev-actions-row">

      <!-- 💬 Chat: always -->
      <button
        class="ev-action-btn"
        type="button"
        aria-label="Chat: open this task's thread in the chat interface"
        @click="openChatThread"
        data-ev-action="chat"
      ><span aria-hidden="true">💬</span><span class="ev-btn-lbl"> Chat</span></button>

      <!-- ✓ Done reading: isTerminal && !isClaimed && !isClosed -->
      <button
        v-if="isTerminal && !isClaimed && !isClosed"
        class="ev-action-btn is-primary"
        :disabled="doneReadingLoading"
        type="button"
        aria-label="Done reading: close this task"
        @click="submitDoneReading"
        data-ev-action="done-reading"
      ><span aria-hidden="true">✓</span><span class="ev-btn-lbl"> Done</span></button>

      <!-- ✕ Cancel (close): !isTerminal && !isClaimed && !isClosed -->
      <button
        v-if="!isTerminal && !isClaimed && !isClosed"
        class="ev-action-btn"
        type="button"
        aria-label="Cancel this task"
        @click="openCloseForm"
        data-ev-action="cancel"
      ><span aria-hidden="true">✕</span><span class="ev-btn-lbl"> Cancel</span></button>

      <!-- ✕ Abort: isClaimed && !isClosed -->
      <button
        v-if="isClaimed && !isClosed"
        class="ev-action-btn is-danger"
        type="button"
        aria-label="Abort: kill the live worker process"
        @click="openAbortForm"
        data-ev-action="abort"
      ><span aria-hidden="true">✕</span><span class="ev-btn-lbl"> Abort</span></button>

      <!-- ↻ Reopen: isClosed -->
      <button
        v-if="isClosed"
        class="ev-action-btn is-primary"
        :disabled="reopenLoading"
        type="button"
        aria-label="Reopen this task"
        @click="submitReopen"
        data-ev-action="reopen"
      ><span aria-hidden="true">↻</span><span class="ev-btn-lbl"> Reopen</span></button>

      <!-- ▷ Resume: isPaused && !isClosed -->
      <button
        v-if="isPaused && !isClosed"
        class="ev-action-btn is-primary"
        :disabled="resumeLoading"
        type="button"
        aria-label="Resume this paused task"
        @click="submitResume"
        data-ev-action="resume"
      ><span aria-hidden="true">▷</span><span class="ev-btn-lbl"> Resume</span></button>
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

    <!-- WAL-149: no chat form here. The Chat action redirects to the task's
         own thread in the chat interface. -->

  </div>
</template>

<style scoped>
/* F3: TaskActions now sits in the action slot beside the tab bar.
   No border-bottom here; ev-top-row owns the boundary. */
.ev-actions {
  padding: 4px 8px 2px;
}

.ev-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 2px;
}

/* F6: buttons sized between header controls (19-21px) and sub-tabs (44px).
   Before: font-size 0.82em, padding 5px 12px, min-height 30px.
   After:  font-size 0.78em, padding 3px 10px, min-height 28px. */
.ev-action-btn {
  background: transparent;
  border: 1px solid var(--ts-border, #3a3a3a);
  color: var(--ts-text-secondary, #aaa);
  cursor: pointer;
  font-size: 0.78em;
  padding: 3px 10px;
  border-radius: 3px;
  min-height: 28px;
  white-space: nowrap;
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

/* F6/F3: below 600px the action slot shares the row with 2 sub-tabs.
   Collapse to icons only; aria-labels carry the accessible name. */
@media (max-width: 600px) {
  .ev-btn-lbl { display: none; }
  .ev-action-btn { padding: 3px 7px; min-width: 28px; }
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
