<script setup lang="ts">
import type { AttentionTierRow } from "../../stores/attention";

const props = defineProps<{
  row: AttentionTierRow;
}>();

const emit = defineEmits<{ "open-task": [id: string] }>();
</script>

<template>
  <div
    class="db-tier-row"
    role="button"
    tabindex="0"
    :data-task-id="row.id"
    @click="emit('open-task', row.id)"
    @keydown.enter="emit('open-task', row.id)"
    @keydown.space.prevent="emit('open-task', row.id)"
  >
    <span class="db-tier-row-headline">{{ row.headline || row.label || row.id }}</span>
    <span v-if="row.agent" class="db-tier-row-agent">{{ row.agent }}</span>
  </div>
</template>
