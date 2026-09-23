<script setup lang="ts">
import { useWorkspaceStore } from "../../stores/workspace";

interface Totals {
  open?: number;
  waiting?: number;
  done?: number;
  failed?: number;
}

const props = defineProps<{
  totals: Totals | null | undefined;
}>();

const workspace = useWorkspaceStore();
</script>

<template>
  <div class="db-totals" v-if="totals">
    <button class="db-totals-btn" type="button" @click="workspace.open({kind:'legacy', page:'tasks'})">
      <span>{{ totals.open ?? 0 }} open</span>
      <span class="db-totals-sep">·</span>
      <span>{{ totals.waiting ?? 0 }} waiting</span>
      <span class="db-totals-sep">·</span>
      <span class="db-totals-done">{{ totals.done ?? 0 }} done</span>
      <span class="db-totals-sep">·</span>
      <span class="db-totals-failed">{{ totals.failed ?? 0 }} failed</span>
    </button>
  </div>
</template>
