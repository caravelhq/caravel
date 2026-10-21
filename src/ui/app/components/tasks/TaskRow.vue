<script setup lang="ts">
import { computed } from "vue";
import { statusClass } from "../../pages/tasks/helpers";
import type { TaskRow } from "../../stores/tasks";

const props = defineProps<{
  task: TaskRow;
  depth?: number;
  marker?: string;
  isCurrent?: boolean;
}>();

const emit = defineEmits<{ (e: "open", id: string): void }>();

const indent = computed(() => (props.depth ?? 0) * 14);

function handleClick(): void {
  if (!props.isCurrent) emit("open", props.task.id);
}
</script>

<template>
  <div
    class="task-tree-node"
    :class="{ 'is-current': isCurrent }"
    :role="isCurrent ? undefined : 'button'"
    :tabindex="isCurrent ? undefined : 0"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <span class="task-tree-indent" :style="{ width: indent + 'px' }"></span>
    <span class="task-tree-marker">{{ marker ?? '●' }}</span>
    <span class="task-tree-id">{{ task.id }}</span>
    <span class="task-tree-agent">{{ task.agent ?? task.to ?? '?' }}</span>
    <span class="task-tree-status" :class="statusClass(task.status)">{{ task.status ?? '?' }}</span>
    <span class="task-tree-headline">{{ (task.headline ?? task.brief ?? '').slice(0, 120) }}</span>
  </div>
</template>
