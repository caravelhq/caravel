<script setup lang="ts">
// ReportView is a deep-link alias: /report/<taskId> resolves the task and
// opens envelope:<taskId> on the Report sub-view. It is no longer a tab kind.
import { onMounted } from "vue";
import { useWorkspaceStore } from "../stores/workspace";
import type { ResourceRef } from "../workspace/refs";

const props = defineProps<{ resource: ResourceRef }>();

const ws = useWorkspaceStore();

onMounted(() => {
  if (props.resource.kind !== "report") return;
  const taskId = props.resource.taskId;
  // Replace this report: tab with an envelope: tab on the Report sub-view.
  // The router's afterEach will have opened this tab; we close it and open the envelope.
  ws.open({ kind: "envelope", taskId });
});
</script>

<template>
  <div class="rv-redirect">
    <div class="task-panel-loading">Opening report…</div>
  </div>
</template>
