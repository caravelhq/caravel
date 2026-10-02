<script setup lang="ts">
import { computed } from "vue";
import DocViewer from "../components/doc/DocViewer.vue";
import type { ResourceRef } from "../workspace/refs";

const props = defineProps<{ resource: ResourceRef }>();

// Use the explicit path if provided; otherwise derive a plausible path from taskId.
// The live store (useResource) will replace this with a server-resolved path in the next node.
const reportPath = computed((): string => {
  if (props.resource.kind !== "report") return "";
  if (props.resource.path) return props.resource.path;
  // Fallback: task reports live at agents/*/tasks/done/<taskId>.md
  // We can't resolve the agent here without an API call; use the generic path.
  return props.resource.taskId;
});
</script>

<template>
  <DocViewer
    v-if="resource.kind === 'report' && reportPath"
    :path="reportPath"
    kind="report"
  />
</template>
