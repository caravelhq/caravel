<script setup lang="ts">
import { ref, computed } from "vue";
import { useWorkspaceStore } from "../stores/workspace";
import { refKey, type ResourceRef } from "./refs";

const ws = useWorkspaceStore();

const group0 = computed(() => ws.groupTabs(0));
const group1 = computed(() => ws.groupTabs(1));

const draggedKey = ref<string | null>(null);
const dragOverIdx = ref<number | null>(null);
const dragOverDivider = ref(false);

function tabLabel(r: ResourceRef): string {
  switch (r.kind) {
    case "dashboard": return "Dashboard";
    case "file": return r.path.split("/").pop() || r.path;
    case "report": return r.taskId;
    case "legacy": return r.page.charAt(0).toUpperCase() + r.page.slice(1);
    case "envelope": return r.taskId;
    case "project": return r.slug;
    case "chat": return r.chatId;
  }
}

function isActive(tab: ResourceRef): boolean {
  const key = refKey(tab);
  return ws.active[0] === key || ws.active[1] === key;
}

function onDragStart(e: DragEvent, key: string) {
  draggedKey.value = key;
  e.dataTransfer!.effectAllowed = "move";
  e.dataTransfer!.setData("application/x-caravel-ref", key);
}

function onDragEnd() {
  draggedKey.value = null;
  dragOverIdx.value = null;
  dragOverDivider.value = false;
}

function onTabDragOver(e: DragEvent, flatIdx: number) {
  e.preventDefault();
  dragOverIdx.value = flatIdx;
  dragOverDivider.value = false;
}

function onDividerDragOver(e: DragEvent) {
  e.preventDefault();
  dragOverDivider.value = true;
  dragOverIdx.value = null;
}

function onTabDrop(e: DragEvent, flatIdx: number) {
  e.preventDefault();
  const key = e.dataTransfer?.getData("application/x-caravel-ref") || draggedKey.value;
  if (!key) { onDragEnd(); return; }
  const fromIdx = ws.tabs.findIndex((t) => refKey(t) === key);
  if (fromIdx !== flatIdx) ws.move(key, flatIdx);
  onDragEnd();
}

function onDividerDrop(e: DragEvent) {
  e.preventDefault();
  const key = e.dataTransfer?.getData("application/x-caravel-ref") || draggedKey.value;
  if (!key || ws.splitIndex === null) { onDragEnd(); return; }
  const fromIdx = ws.tabs.findIndex((t) => refKey(t) === key);
  const fromGroup = ws.tabGroup(fromIdx);
  ws.moveToGroup(key, fromGroup === 0 ? 1 : 0);
  onDragEnd();
}
</script>

<template>
  <div class="tab-strip">
    <!-- Group 0 tabs -->
    <button
      v-for="(tab, i) in group0"
      :key="refKey(tab)"
      class="ts-tab"
      :class="{
        'ts-tab--active': isActive(tab),
        'ts-tab--focused': ws.active[ws.focused] === refKey(tab),
        'ts-tab--drag-over': dragOverIdx === i,
      }"
      :data-key="refKey(tab)"
      role="tab"
      :aria-selected="ws.active[ws.focused] === refKey(tab)"
      draggable="true"
      type="button"
      @click="ws.activate(refKey(tab)); ws.focus(0)"
      @mousedown.middle.prevent="ws.close(refKey(tab))"
      @dragstart="onDragStart($event, refKey(tab))"
      @dragend="onDragEnd"
      @dragover="onTabDragOver($event, i)"
      @dragleave="dragOverIdx = null"
      @drop="onTabDrop($event, i)"
    >
      <span class="ts-tab-label">{{ tabLabel(tab) }}</span>
      <span
        v-if="tab.kind !== 'dashboard'"
        class="ts-tab-close"
        role="button"
        tabindex="-1"
        aria-label="Close tab"
        @click.stop="ws.close(refKey(tab))"
      >×</span>
    </button>

    <!-- Divider (present whenever splitIndex is set) -->
    <div
      v-if="ws.splitIndex !== null"
      class="ts-divider"
      :class="{
        'ts-divider--split': ws.splitOn,
        'ts-divider--drag-over': dragOverDivider,
      }"
      title="Drop here to move tab between groups"
      @dragover="onDividerDragOver"
      @dragleave="dragOverDivider = false"
      @drop="onDividerDrop"
    />

    <!-- Group 1 tabs -->
    <button
      v-for="(tab, i) in group1"
      :key="refKey(tab)"
      class="ts-tab ts-tab--g1"
      :class="{
        'ts-tab--active': isActive(tab),
        'ts-tab--focused': ws.active[ws.focused] === refKey(tab),
        'ts-tab--drag-over': dragOverIdx === group0.length + i,
      }"
      :data-key="refKey(tab)"
      role="tab"
      :aria-selected="ws.active[ws.focused] === refKey(tab)"
      draggable="true"
      type="button"
      @click="ws.activate(refKey(tab)); ws.focus(1)"
      @mousedown.middle.prevent="ws.close(refKey(tab))"
      @dragstart="onDragStart($event, refKey(tab))"
      @dragend="onDragEnd"
      @dragover="onTabDragOver($event, group0.length + i)"
      @dragleave="dragOverIdx = null"
      @drop="onTabDrop($event, group0.length + i)"
    >
      <span class="ts-tab-label">{{ tabLabel(tab) }}</span>
      <span
        v-if="tab.kind !== 'dashboard'"
        class="ts-tab-close"
        role="button"
        tabindex="-1"
        aria-label="Close tab"
        @click.stop="ws.close(refKey(tab))"
      >×</span>
    </button>

    <div class="ts-actions">
      <button
        class="ts-split-btn"
        :class="{ 'ts-split-btn--active': ws.splitOn }"
        type="button"
        :title="ws.splitOn ? 'Close split' : 'Open split'"
        @click="ws.toggleSplit()"
      >⫽</button>
    </div>
  </div>
</template>

<style scoped>
.tab-strip {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  flex-shrink: 0;
  align-items: stretch;
  gap: 2px;
  padding: 4px 8px 0;
  background: var(--surface-1, #1a1a1a);
  border-bottom: 1px solid var(--border-subtle, #333);
  scrollbar-width: none;
}

.tab-strip::-webkit-scrollbar { display: none; }

.ts-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: none;
  border-radius: 4px 4px 0 0;
  background: var(--surface-2, #262626);
  color: inherit;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
  opacity: 0.65;
  transition: opacity 0.1s;
  flex-shrink: 0;
}

.ts-tab:hover { opacity: 0.88; }
.ts-tab--active { opacity: 0.88; }
.ts-tab--focused {
  opacity: 1;
  background: var(--surface-3, #303030);
}

.ts-tab--drag-over {
  outline: 2px solid var(--accent, #7dc5ff);
  outline-offset: -2px;
}

.ts-tab-label {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ts-tab-close {
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.55;
  padding: 0 2px;
}

.ts-tab-close:hover { opacity: 1; }

/* Divider between groups — thin line when split off, wider active zone when split on */
.ts-divider {
  width: 2px;
  flex-shrink: 0;
  background: var(--border-subtle, #333);
  border-radius: 1px;
  margin: 4px 3px 0;
  cursor: col-resize;
  transition: background 0.1s, width 0.1s;
}

.ts-divider--split {
  width: 4px;
  background: var(--accent, #7dc5ff44);
}

.ts-divider--drag-over {
  width: 4px;
  background: var(--accent, #7dc5ff);
}

.ts-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding-bottom: 0;
}

.ts-split-btn {
  background: transparent;
  border: none;
  color: inherit;
  opacity: 0.45;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 2px 6px;
  border-radius: 3px;
  transition: opacity 0.1s;
}

.ts-split-btn:hover { opacity: 0.8; }
.ts-split-btn--active { opacity: 0.9; color: var(--accent, #7dc5ff); }
</style>
