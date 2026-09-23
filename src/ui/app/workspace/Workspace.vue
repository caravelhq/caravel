<script setup lang="ts">
// Workspace — single-group form for Phase 3 node 5.
// Tab strip chrome (split, drag-to-reorder) comes in the next node.
import { computed } from "vue";
import { useWorkspaceStore } from "../stores/workspace";
import { refKey, type ResourceRef } from "./refs";
import ViewHost from "./ViewHost.vue";

const ws = useWorkspaceStore();

const group0Tabs = computed(() => ws.groupTabs(0));

const activeRef = computed((): ResourceRef | null => {
  const key = ws.active[0];
  if (!key) return null;
  return ws.tabs.find((t) => refKey(t) === key) ?? null;
});

function tabLabel(ref: ResourceRef): string {
  switch (ref.kind) {
    case "dashboard": return "Dashboard";
    case "file": return ref.path.split("/").pop() || ref.path;
    case "report": return ref.taskId;
    case "legacy": return ref.page.charAt(0).toUpperCase() + ref.page.slice(1);
    case "envelope": return ref.taskId;
    case "project": return ref.slug;
    case "chat": return ref.chatId;
  }
}
</script>

<template>
  <div class="workspace">
    <!-- Minimal tab bar: one button per tab, close button on each -->
    <div class="workspace-tabs" role="tablist">
      <button
        v-for="tab in group0Tabs"
        :key="refKey(tab)"
        class="workspace-tab"
        :class="{ 'workspace-tab--active': ws.active[0] === refKey(tab) }"
        role="tab"
        :aria-selected="ws.active[0] === refKey(tab)"
        type="button"
        @click="ws.activate(refKey(tab))"
      >
        <span class="workspace-tab-label">{{ tabLabel(tab) }}</span>
        <span
          v-if="tab.kind !== 'dashboard'"
          class="workspace-tab-close"
          role="button"
          tabindex="-1"
          aria-label="Close tab"
          @click.stop="ws.close(refKey(tab))"
        >×</span>
      </button>
    </div>

    <ViewHost :active-ref="activeRef" />
  </div>
</template>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.workspace-tabs {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  flex-shrink: 0;
  gap: 2px;
  padding: 4px 8px 0;
  background: var(--surface-1, #1a1a1a);
  border-bottom: 1px solid var(--border-subtle, #333);
}

.workspace-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--radius-sm, 4px) var(--radius-sm, 4px) 0 0;
  background: var(--surface-2, #262626);
  color: inherit;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
  opacity: 0.7;
  transition: opacity 0.1s;
}

.workspace-tab:hover {
  opacity: 0.9;
}

.workspace-tab--active {
  opacity: 1;
  background: var(--surface-3, #303030);
}

.workspace-tab-label {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-tab-close {
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.6;
  padding: 0 2px;
}

.workspace-tab-close:hover {
  opacity: 1;
}
</style>
