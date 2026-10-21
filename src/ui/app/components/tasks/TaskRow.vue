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
}>();

const emit = defineEmits<{
  (e: "open", id: string): void;
  (e: "select", id: string, agent: string, defaultStatus: string, checked: boolean): void;
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
  <div
    class="task-tree-node"
    :class="{ 'is-current': isCurrent }"
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
    <span class="task-tree-marker">{{ marker ?? '●' }}</span>
    <span class="task-tree-id">{{ displayId }}</span>
    <span class="task-tree-agent">{{ task.agent ?? task.to ?? '?' }}</span>
    <span v-if="task.status" class="task-tree-status" :class="statusClass(task.status)">{{ task.status }}</span>
    <span class="task-tree-headline">{{ (task.headline ?? task.brief ?? task.label ?? '').slice(0, 120) }}</span>
  </div>
</template>
