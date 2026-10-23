<script setup lang="ts">
import { ref, computed } from "vue";
import { useTasksStore } from "../../stores/tasks";
import type { TaskRow } from "../../stores/tasks";

const props = defineProps<{ task: TaskRow | null }>();

const emit = defineEmits<{
  (e: "submitted", taskId: string): void;
}>();

const tasks = useTasksStore();

const id = computed(() => props.task?.id ?? "");
const agent = computed(() => props.task?.agent ?? props.task?.to ?? "");
const isClosed = computed(() => !!(props.task?.closed && props.task.closed.status));

const draft = computed({
  get: () => tasks.nextDraft.get(id.value) ?? "",
  set: (v: string) => {
    if (id.value) tasks.nextDraft.set(id.value, v);
  },
});

const hasDraft = computed(() => draft.value.length > 0);

const headlineInput = ref("");
const _submitLoading = ref(false);
const submitError = ref<string | null>(null);

async function submit(): Promise<void> {
  if (!id.value || !draft.value.trim()) return;
  _submitLoading.value = true;
  submitError.value = null;
  try {
    const hl = headlineInput.value.trim();
    const r = await fetch(`/api/tasks/${encodeURIComponent(id.value)}/next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: agent.value,
        source: "continue",
        instruction: draft.value.trim(),
        ...(hl ? { headline: hl } : {}),
      }),
    });
    const data = await r.json() as { ok?: boolean; error?: string };
    if (!data.ok) { submitError.value = data.error ?? "spawn failed"; return; }
    // Clear draft only on success — never on blur or navigation.
    tasks.nextDraft.delete(id.value);
    emit("submitted", id.value);
  } catch (err) {
    submitError.value = String((err as Error).message ?? err);
  } finally {
    _submitLoading.value = false;
  }
}

function discard(): void {
  if (id.value) tasks.nextDraft.delete(id.value);
  headlineInput.value = "";
  submitError.value = null;
}
</script>

<template>
  <div class="nx-root" v-if="task">
    <div v-if="isClosed" class="nx-closed-notice">
      Task is closed — spawning a follow-on will reopen the thread.
    </div>
    <label class="nx-label" :for="`nx-headline-${id}`">Child task title (optional)</label>
    <input
      :id="`nx-headline-${id}`"
      class="nx-headline-input"
      type="text"
      v-model="headlineInput"
      :placeholder="task?.headline ? `${task.headline.slice(0, 50)} — continue` : 'Leave blank to use server default'"
      :disabled="_submitLoading"
      data-nx-headline
    />
    <label class="nx-label" :for="`nx-draft-${id}`">Instructions for the follow-on task</label>
    <textarea
      :id="`nx-draft-${id}`"
      class="nx-textarea"
      v-model="draft"
      rows="6"
      placeholder="What should the worker do next? The current session context is inherited."
      :disabled="_submitLoading"
      data-nx-textarea
    ></textarea>
    <div class="nx-actions">
      <button
        type="button"
        class="nx-btn is-primary"
        :disabled="_submitLoading || !hasDraft"
        @click="submit"
        data-nx-submit
      >↳ Spawn follow-on</button>
      <button
        v-if="hasDraft"
        type="button"
        class="nx-btn"
        :disabled="_submitLoading"
        @click="discard"
        data-nx-discard
      >Discard draft</button>
      <span v-if="submitError" class="nx-error" role="alert">
        {{ submitError }}
        <button type="button" @click="submit">Retry</button>
      </span>
    </div>
    <p class="nx-hint">Draft is saved automatically. Navigating away will not discard it.</p>
  </div>
  <div v-else class="nx-loading">Loading task…</div>
</template>

<style scoped>
.nx-root {
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  gap: 8px;
  flex: 1;
}

.nx-closed-notice {
  font-size: 0.82em;
  color: var(--ts-text-secondary, #aaa);
  background: var(--ts-surface-2, #2a2a2a);
  border: 1px solid var(--ts-border, #3a3a3a);
  border-radius: 4px;
  padding: 6px 10px;
}

.nx-label {
  font-size: 0.82rem;
  color: var(--ts-text-secondary, #aaa);
}

.nx-headline-input {
  background: var(--ts-surface-2, #2a2a2a);
  border: 1px solid var(--ts-border, #3a3a3a);
  color: var(--ts-text, #eee);
  padding: 6px 10px;
  font-size: 0.9rem;
  border-radius: 4px;
  box-sizing: border-box;
  width: 100%;
}

.nx-headline-input:focus {
  outline: none;
  border-color: var(--ts-accent, #5a5a9a);
}

.nx-textarea {
  flex: 1;
  min-height: 120px;
  background: var(--ts-surface-2, #2a2a2a);
  border: 1px solid var(--ts-border, #3a3a3a);
  color: var(--ts-text, #eee);
  padding: 8px 10px;
  font-size: 0.9rem;
  border-radius: 4px;
  resize: vertical;
  box-sizing: border-box;
  width: 100%;
}

.nx-textarea:focus {
  outline: none;
  border-color: var(--ts-accent, #5a5a9a);
}

.nx-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.nx-btn {
  background: transparent;
  border: 1px solid var(--ts-border, #3a3a3a);
  color: var(--ts-text-secondary, #aaa);
  cursor: pointer;
  font-size: 0.82em;
  padding: 4px 12px;
  border-radius: 3px;
  min-height: 28px;
  white-space: nowrap;
}

.nx-btn:hover:not(:disabled) {
  color: var(--ts-text, #eee);
  border-color: var(--ts-text-secondary, #aaa);
}

.nx-btn.is-primary {
  background: var(--ts-accent, #3a3a9a);
  color: #fff;
  border-color: var(--ts-accent, #3a3a9a);
}

.nx-btn.is-primary:hover:not(:disabled) {
  background: var(--ts-accent-hover, #4a4aaa);
}

.nx-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.nx-error {
  color: var(--ts-danger, #e05a5a);
  font-size: 0.82em;
  display: flex;
  align-items: center;
  gap: 4px;
}

.nx-error button {
  background: none;
  border: 1px solid var(--ts-danger, #8a3a3a);
  color: var(--ts-danger, #e05a5a);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
}

.nx-hint {
  font-size: 0.78em;
  color: var(--ts-text-secondary, #777);
  margin: 0;
}

.nx-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  color: var(--ts-text-secondary, #aaa);
  font-size: 0.88em;
}
</style>
