<script setup lang="ts">
import { computed } from "vue";
import { timeAgo } from "../pages/tasks/helpers";
import TaskRow from "../components/tasks/TaskRow.vue";
import type { TaskRow as TaskRowData } from "../stores/tasks";

interface Chain {
  task: TaskRowData | null;
  ancestors?: TaskRowData[];
  children?: TaskRowData[];
}

const props = defineProps<{
  chain: Chain | null;
}>();

const emit = defineEmits<{ (e: "open-task", id: string): void }>();

const task = computed(() => props.chain?.task ?? null);
const ancestors = computed(() => props.chain?.ancestors ?? []);
const children = computed(() => props.chain?.children ?? []);

const brief = computed(() => (task.value?.brief ?? "").trim());
const summaryResponse = computed(() => task.value?.summary?.response ? String(task.value.summary.response).trim() : "");
const ctxItems = computed(() => task.value?.context ?? []);
const isClosed = computed(() => !!(task.value?.closed && task.value.closed.status));
const closedAt = computed(() => task.value?.closed?.at ? timeAgo(task.value.closed.at) : null);
const envelopePath = computed(() => {
  const t = task.value;
  if (!t) return null;
  return t.envelopePath ?? `agents/${t.agent}/tasks/${t.bucket ?? "open"}/${t.id}.yaml`;
});
</script>

<template>
  <div class="ev-sections" v-if="task">

    <!-- Closed banner -->
    <div v-if="isClosed && task.closed" class="ev-closed-banner">
      <span class="ev-closed-pill">{{ task.closed.status }}</span>
      <span class="ev-closed-meta">
        by {{ task.closed.by ?? '?' }}
        <template v-if="closedAt"> · {{ closedAt }}</template>
      </span>
      <div v-if="task.closed.reason" class="ev-closed-reason">{{ task.closed.reason }}</div>
    </div>

    <!-- Mini task tree -->
    <div v-if="ancestors.length || children.length" class="ev-task-tree">
      <TaskRow
        v-for="(a, i) in ancestors"
        :key="a.id"
        :task="a"
        :depth="i"
        :marker="i === 0 ? '◆' : '└'"
        @open="(id) => emit('open-task', id)"
      />
      <TaskRow
        :task="task"
        :depth="ancestors.length"
        :marker="ancestors.length === 0 ? '●' : '└'"
        :is-current="true"
      />
      <TaskRow
        v-for="(c, j) in children"
        :key="c.id"
        :task="c"
        :depth="ancestors.length + 1"
        :marker="j === children.length - 1 ? '└' : '├'"
        @open="(id) => emit('open-task', id)"
      />
    </div>

    <!-- Brief section -->
    <details v-if="brief" class="ev-section" open>
      <summary class="ev-section-summary">Brief</summary>
      <div class="ev-section-body ev-card-summary">{{ brief }}</div>
    </details>

    <!-- Result section -->
    <details v-if="summaryResponse" class="ev-section" open>
      <summary class="ev-section-summary">Result</summary>
      <div class="ev-section-body ev-card-summary">{{ summaryResponse }}</div>
    </details>

    <!-- Files section -->
    <details v-if="envelopePath" class="ev-section">
      <summary class="ev-section-summary">Files</summary>
      <div class="ev-section-body">
        <button
          class="ev-ctx-item"
          type="button"
          :data-open-file="envelopePath"
          :data-from-task="task.id"
        >📄 {{ envelopePath }}</button>
        <button
          v-if="task.reportPath"
          class="ev-ctx-item"
          type="button"
          :data-open-file="task.reportPath"
          :data-from-task="task.id"
        >📄 {{ task.reportPath }}</button>
      </div>
    </details>

    <!-- Context section -->
    <details v-if="ctxItems.length" class="ev-section">
      <summary class="ev-section-summary">Context ({{ ctxItems.length }})</summary>
      <div class="ev-section-body">
        <template v-for="c in ctxItems" :key="c">
          <div v-if="/^https?:/i.test(c)" class="ev-ctx-item">
            ↗ <a :href="c" target="_blank" rel="noopener">{{ c }}</a>
          </div>
          <div v-else-if="/^jira:/i.test(c)" class="ev-ctx-item">{{ c }}</div>
          <button
            v-else
            class="ev-ctx-item"
            type="button"
            :data-open-file="c"
            :data-from-task="task.id"
          >📄 {{ c }}</button>
        </template>
      </div>
    </details>

  </div>
</template>

<style scoped>
.ev-sections {
  padding: 8px 12px;
  overflow-y: auto;
  flex: 1;
}

.ev-closed-banner {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px;
  background: var(--ts-surface-2, #2a2a2a);
  border-radius: 4px;
  margin-bottom: 10px;
  font-size: 0.82em;
}

.ev-closed-pill {
  background: var(--ts-border, #3a3a3a);
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
}

.ev-closed-meta { color: var(--ts-text-secondary, #aaa); }
.ev-closed-reason { width: 100%; color: var(--ts-text-secondary, #aaa); margin-top: 4px; }

.ev-task-tree {
  margin-bottom: 8px;
  border: 1px solid var(--ts-border, #3a3a3a);
  border-radius: 4px;
  overflow: hidden;
}

.ev-section {
  margin-bottom: 6px;
}

.ev-section-summary {
  cursor: pointer;
  font-size: 0.82em;
  color: var(--ts-text-secondary, #aaa);
  padding: 4px 0;
  user-select: none;
}

.ev-section-body { padding: 6px 0 4px; }

.ev-card-summary {
  font-size: 0.85em;
  white-space: pre-wrap;
  word-break: break-word;
}

.ev-ctx-item {
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: var(--ts-text-secondary, #aaa);
  text-align: left;
  cursor: pointer;
  padding: 2px 0;
  font-size: 0.82em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ev-ctx-item:hover { color: var(--ts-text, #eee); }
.ev-ctx-item a { color: inherit; }
</style>
