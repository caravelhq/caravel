<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { timeAgo } from "../pages/tasks/helpers";
import type { TaskRow } from "../stores/tasks";
import { useProjectsStore } from "../stores/projects";

const props = defineProps<{ task: TaskRow | null }>();
const emit = defineEmits<{
  (e: "rename", headline: string): void;
  (e: "project-change", project: string | null): void;
}>();

const projects = useProjectsStore();
onMounted(() => { projects.loadList(); });

const renaming = ref(false);
const renameInput = ref("");
const renameError = ref<string | null>(null);
const renameLoading = ref(false);

const projectEditing = ref(false);
const projectInput = ref("");
const projectError = ref<string | null>(null);
const projectLoading = ref(false);

const headline = computed(() => props.task?.headline ?? props.task?.id ?? "—");
const metaFrom = computed(() => props.task?.from ?? "?");
const metaTo = computed(() => props.task?.to ?? "?");
const metaKind = computed(() => props.task?.kind ?? null);
const metaPriority = computed(() => props.task?.priority ?? null);
const metaProject = computed(() => props.task?.project ?? null);
const metaUpdated = computed(() => props.task?.updated ? timeAgo(props.task.updated) : null);

function startRename(): void {
  renameInput.value = headline.value;
  renameError.value = null;
  renaming.value = true;
}

function cancelRename(): void {
  renaming.value = false;
  renameError.value = null;
}

async function submitRename(): Promise<void> {
  const h = renameInput.value.trim();
  if (!h || !props.task) return;
  renameLoading.value = true;
  renameError.value = null;
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(props.task.id)}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: props.task.agent ?? props.task.to ?? "", headline: h }),
    });
    const data = await r.json() as { ok?: boolean; error?: string };
    if (!data.ok) { renameError.value = data.error ?? "rename failed"; return; }
    renaming.value = false;
    emit("rename", h);
  } catch (err) {
    renameError.value = String((err as Error).message ?? err);
  } finally {
    renameLoading.value = false;
  }
}

function startProjectEdit(): void {
  projectInput.value = metaProject.value ?? "";
  projectError.value = null;
  projectEditing.value = true;
}

function cancelProjectEdit(): void {
  projectEditing.value = false;
  projectError.value = null;
}

async function submitProjectEdit(): Promise<void> {
  if (!props.task) return;
  const project = projectInput.value.trim() || null;
  projectLoading.value = true;
  projectError.value = null;
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(props.task.id)}/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: props.task.agent ?? props.task.to ?? "", project }),
    });
    const data = await r.json() as { ok?: boolean; error?: string };
    if (!data.ok) { projectError.value = data.error ?? "project change failed"; return; }
    projectEditing.value = false;
    emit("project-change", project);
  } catch (err) {
    projectError.value = String((err as Error).message ?? err);
  } finally {
    projectLoading.value = false;
  }
}
</script>

<template>
  <div class="ev-header" v-if="task">
    <div class="ev-header-headline">
      <template v-if="!renaming">
        <span class="ev-headline-text">{{ headline }}</span>
        <button class="ev-rename-btn" type="button" title="Rename" aria-label="Rename headline" @click="startRename">✎</button>
      </template>
      <template v-else>
        <input
          class="ev-rename-input"
          v-model="renameInput"
          :disabled="renameLoading"
          @keydown.enter="submitRename"
          @keydown.escape="cancelRename"
          autofocus
        />
        <button class="ev-rename-save" type="button" :disabled="renameLoading" @click="submitRename">Save</button>
        <button class="ev-rename-cancel" type="button" @click="cancelRename">×</button>
        <span v-if="renameError" class="ev-action-error" role="alert">{{ renameError }}</span>
      </template>
    </div>

    <div class="ev-header-meta">
      <span class="ev-meta-from-to">{{ metaFrom }} <span class="ev-meta-arrow">→</span> {{ metaTo }}</span>
      <span v-if="metaKind" class="ev-meta-chip">{{ metaKind }}</span>
      <span v-if="metaPriority" class="ev-meta-chip">{{ metaPriority }}</span>

      <template v-if="!projectEditing">
        <button
          class="ev-project-chip"
          :class="{ 'is-unassigned': !metaProject }"
          type="button"
          title="Click to change project"
          @click="startProjectEdit"
        >📁 {{ metaProject ?? 'Unassigned' }}</button>
      </template>
      <template v-else>
        <!-- F7: datalist-backed input — constrained to known projects by default,
             but free entry still works for genuinely new project names. -->
        <input
          class="ev-project-input"
          v-model="projectInput"
          placeholder="Project name (blank to clear)"
          list="ev-project-list"
          :disabled="projectLoading"
          @keydown.enter="submitProjectEdit"
          @keydown.escape="cancelProjectEdit"
          autofocus
        />
        <datalist id="ev-project-list">
          <option v-for="p in projects.list" :key="p.slug" :value="p.slug" />
        </datalist>
        <button class="ev-project-save" type="button" :disabled="projectLoading" @click="submitProjectEdit">Set</button>
        <button class="ev-project-cancel" type="button" @click="cancelProjectEdit">×</button>
        <span v-if="projectError" class="ev-action-error" role="alert">{{ projectError }}</span>
      </template>

      <span v-if="metaUpdated" class="ev-meta-updated">{{ metaUpdated }}</span>
    </div>
  </div>
</template>

<style scoped>
.ev-header {
  flex-shrink: 0;
  padding: 8px 12px 6px;
  border-bottom: 1px solid var(--ts-border, #3a3a3a);
}

.ev-header-headline {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.ev-headline-text {
  font-weight: 600;
  font-size: 0.95em;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ev-rename-btn {
  background: none;
  border: none;
  color: var(--ts-text-secondary, #aaa);
  cursor: pointer;
  padding: 2px 4px;
  font-size: 0.85em;
  flex-shrink: 0;
}

.ev-rename-btn:hover { color: var(--ts-text, #eee); }

.ev-rename-input {
  flex: 1;
  background: var(--ts-surface-2, #2a2a2a);
  border: 1px solid var(--ts-accent, #5a5a9a);
  color: var(--ts-text, #eee);
  padding: 3px 6px;
  font-size: 0.9em;
  border-radius: 3px;
}

.ev-rename-save, .ev-rename-cancel,
.ev-project-save, .ev-project-cancel {
  background: none;
  border: 1px solid var(--ts-border, #3a3a3a);
  color: var(--ts-text-secondary, #aaa);
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.8em;
}

.ev-rename-save:hover, .ev-project-save:hover { color: var(--ts-text, #eee); }

.ev-header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 0.78em;
  color: var(--ts-text-secondary, #aaa);
}

.ev-meta-arrow { opacity: 0.5; }

.ev-meta-chip {
  background: var(--ts-surface-2, #2a2a2a);
  border: 1px solid var(--ts-border, #3a3a3a);
  border-radius: 3px;
  padding: 1px 5px;
}

.ev-project-chip {
  background: none;
  border: 1px dashed var(--ts-border, #3a3a3a);
  border-radius: 3px;
  color: var(--ts-text-secondary, #aaa);
  cursor: pointer;
  padding: 1px 5px;
  font-size: inherit;
}

.ev-project-chip.is-unassigned { opacity: 0.6; }
.ev-project-chip:hover { border-color: var(--ts-accent, #5a5a9a); color: var(--ts-text, #eee); }

.ev-project-input {
  background: var(--ts-surface-2, #2a2a2a);
  border: 1px solid var(--ts-accent, #5a5a9a);
  color: var(--ts-text, #eee);
  padding: 2px 6px;
  font-size: inherit;
  border-radius: 3px;
  width: 140px;
}

.ev-meta-updated { opacity: 0.6; margin-left: auto; }

.ev-action-error {
  color: var(--ts-danger, #e05a5a);
  font-size: 0.85em;
}
</style>
