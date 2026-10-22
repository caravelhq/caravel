<script setup lang="ts">
// ReportPane — renders a task's report as a component, no innerHTML.
// Markdown goes through DocViewer (DEC-0033 / F1).
// Secondary deliverables open as file: tabs via ReportDocTabs rather than swapping
// in place (F2). The pane always shows task.reportPath; the tab row marks it active.

import { computed } from "vue";
import type { TaskRow } from "../stores/tasks";
import DocViewer from "../components/doc/DocViewer.vue";
import ReportDocTabs from "../components/tasks/ReportDocTabs.vue";

const props = defineProps<{
  task: TaskRow | null;
}>();

// The path currently shown in the pane — always the primary report.
const activePath = computed((): string => props.task?.reportPath ?? "");

const allPaths = computed((): string[] => {
  const t = props.task;
  if (!t?.reportPath) return [];
  const paths: string[] = [t.reportPath];
  for (const d of (t.deliverables ?? [])) {
    if (d && !paths.includes(d)) paths.push(d);
  }
  return paths;
});
</script>

<template>
  <div class="ev-report-pane">
    <div v-if="!task?.reportPath" class="task-panel-loading">No report yet for this task.</div>
    <template v-else>
      <ReportDocTabs
        v-if="allPaths.length > 1"
        :paths="allPaths"
        :active-path="activePath"
      />
      <DocViewer :path="activePath" kind="report" />
    </template>
  </div>
</template>

<style scoped>
.ev-report-pane {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
