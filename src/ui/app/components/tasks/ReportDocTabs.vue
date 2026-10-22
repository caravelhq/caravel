<script setup lang="ts">
// ReportDocTabs — renders the deliverables pill row for the report pane.
// Clicking a pill fires data-open-file (caught by EnvelopeView.onOpenFile) to open a
// file: tab rather than swapping the doc in place (DEC-0024 / F2).
// activePath marks which document is currently shown in the pane (D3).

defineProps<{
  paths: string[];
  activePath: string;
}>();

function filename(path: string): string {
  return path.split("/").pop() || path;
}
</script>

<template>
  <div class="ev-report-doc-tabs">
    <button
      v-for="path in paths"
      :key="path"
      type="button"
      class="ev-report-doc-tab"
      :class="{ 'is-active': path === activePath }"
      :data-open-file="path"
    >{{ filename(path) }}</button>
  </div>
</template>

<style scoped>
.ev-report-doc-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px 8px 2px;
  flex-shrink: 0;
}

/* F6: tag-sized pills. Original .task-panel-doc-pill rendered up to 309px at 360px
   viewport because the filename was unbounded. Hard cap + ellipsis keeps them tag-scale. */
.ev-report-doc-tab {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  letter-spacing: 0.03em;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.17);
  background: rgba(12, 22, 36, 0.65);
  color: #b8cae3;
  cursor: pointer;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 120ms, color 120ms, border-color 120ms;
}

.ev-report-doc-tab:hover {
  background: rgba(20, 34, 54, 0.5);
  color: #cfe3ff;
}

.ev-report-doc-tab.is-active {
  background: #2a4972;
  border-color: rgba(255, 208, 122, 0.6);
  color: #ffe7b8;
}
</style>
