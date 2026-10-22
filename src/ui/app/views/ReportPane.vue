<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { renderReportPane, loadReportNode } from "../pages/tasks/viewer";
import type { TaskRow } from "../stores/tasks";

const props = defineProps<{
  task: TaskRow | null;
}>();

const emit = defineEmits<{ (e: "raw-text", text: string | null): void }>();

const paneEl = ref<HTMLElement | null>(null);

function render(): void {
  const el = paneEl.value;
  if (!el) return;
  const t = props.task;
  if (!t?.reportPath) {
    el.innerHTML = '<div class="task-panel-loading">No report yet for this task.</div>';
    emit("raw-text", null);
    return;
  }
  el.innerHTML = renderReportPane(t);
  el.querySelectorAll<HTMLElement>(".task-panel-report").forEach((rn) => {
    loadReportNode(rn, (rawText) => emit("raw-text", rawText));
  });
}

watch(() => props.task?.reportPath, () => render(), { flush: "post" });
onMounted(render);
</script>

<template>
  <div ref="paneEl" class="ev-report-pane"></div>
</template>

<style scoped>
.ev-report-pane {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}
</style>
