<script setup lang="ts">
import { computed } from "vue";
import { statusClass } from "../../pages/tasks/helpers";

interface RowLike {
  id: string;
  agent?: string;
  to?: string;
  status?: string;
  headline?: string;
  brief?: string;
  label?: string;
  closed?: { status: string } | null;
}

const props = defineProps<{
  task: RowLike;
  depth?: number;
  marker?: string;
  isCurrent?: boolean;
  selectable?: boolean;
  checked?: boolean;
  defaultStatus?: string;
  shortId?: boolean;
  /** Parent rows render the expand caret in the marker slot instead of the dot. */
  hasChildren?: boolean;
  isExpanded?: boolean;
}>();

const emit = defineEmits<{
  (e: "open", id: string): void;
  (e: "select", id: string, agent: string, defaultStatus: string, checked: boolean): void;
  (e: "toggle", id: string): void;
}>();

const indent = computed(() => (props.depth ?? 0) * 14);
const displayId = computed(() =>
  props.shortId
    ? String(props.task.id || "").replace(/^TSK-\d{4}-/, "")
    : props.task.id
);

function handleClick(): void {
  if (!props.isCurrent) emit("open", props.task.id);
}

function handleCheckbox(ev: Event): void {
  const cb = ev.target as HTMLInputElement;
  emit("select", props.task.id, props.task.agent ?? props.task.to ?? "", props.defaultStatus ?? "cancelled", cb.checked);
}
</script>

<template>
  <!-- WAL-137: this row is a flex column-pair, not a grid. The grid version had a
       fixed column count but a variable item count (checkbox optional, status
       optional, agent hidden under 640px), so items spilled into implicit rows in
       ways that changed with the data — the title landing in column 1 of row 2, the
       status dropping below the id once multi-select added a checkbox. A leading
       slot plus a body column is deterministic whatever is present. -->
  <div
    class="task-tree-node"
    :class="{ 'is-current': isCurrent, 'is-done': task.status === 'done' || !!task.closed }"
    :role="isCurrent ? undefined : 'button'"
    :tabindex="isCurrent ? undefined : 0"
    :title="task.id"
    :data-task-id="task.id"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <input
      v-if="selectable"
      type="checkbox"
      class="task-row-select"
      :checked="checked"
      :data-task-id="task.id"
      :aria-label="'Select ' + task.id"
      @change.stop="handleCheckbox"
      @click.stop
    />
    <span class="task-tree-indent" :style="{ width: indent + 'px' }"></span>
    <!-- Marker slot: the expand caret for parents, the dot for leaves. -->
    <button
      v-if="hasChildren"
      type="button"
      class="tasks-tree-chevron"
      :class="{ 'is-expanded': isExpanded }"
      :aria-label="isExpanded ? 'Collapse' : 'Expand'"
      :aria-expanded="isExpanded ? 'true' : 'false'"
      @click.stop="emit('toggle', task.id)"
    >{{ isExpanded ? '▾' : '▸' }}</button>
    <span v-else class="task-tree-marker">{{ marker ?? '●' }}</span>

    <div class="task-tree-body">
      <div class="task-tree-meta">
        <span class="task-tree-id">{{ displayId }}</span>
        <span class="task-tree-agent">{{ task.agent ?? task.to ?? '?' }}</span>
        <span v-if="task.status" class="task-tree-status" :class="statusClass(task.status)">{{ task.status }}</span>
      </div>
      <div class="task-tree-headline">{{ (task.headline ?? task.brief ?? task.label ?? '').slice(0, 120) }}</div>
    </div>
  </div>
</template>
