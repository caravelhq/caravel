<script setup lang="ts">
import { computed } from "vue";
import { useWorkspaceStore } from "../stores/workspace";
import { refKey, type ResourceRef } from "./refs";
import { refLabel, refGlyph, refTitle } from "./labels";
import type { TaskRow } from "../stores/tasks";
import BaseModal from "../components/modal/BaseModal.vue";

const props = defineProps<{
  open: boolean;
  tasksList?: TaskRow[] | null;
}>();

const emit = defineEmits<{ close: [] }>();

const ws = useWorkspaceStore();

const group0 = computed(() => ws.groupTabs(0));
const group1 = computed(() => ws.groupTabs(1));
const hasSplit = computed(() => ws.splitOn && ws.splitIndex !== null);

function close(): void { emit("close"); }

function activateAndClose(tab: ResourceRef, group: 0 | 1): void {
  ws.activate(refKey(tab));
  close();
}

function togglePin(key: string): void {
  if (ws.meta[key]?.pinned) ws.unpin(key);
  else ws.pin(key);
}

function closeTab(key: string): void {
  ws.close(key);
}
</script>

<template>
  <BaseModal size="sheet" :open="open" title="All tabs" :dismissible="true" @close="close">
    <!-- Group 0 -->
    <div v-if="hasSplit" class="tos-group-label">Group 1</div>
    <div
      v-for="tab in group0"
      :key="refKey(tab)"
      class="tos-row"
      :class="{ 'tos-row--active': ws.active[0] === refKey(tab) || ws.active[1] === refKey(tab) }"
    >
      <span class="tos-glyph">{{ refGlyph(tab) }}</span>
      <span class="tos-label" :title="refTitle(tab, props.tasksList)">
        {{ refLabel(tab, props.tasksList) }}
      </span>
      <div class="tos-row-actions">
        <button
          class="tos-btn"
          type="button"
          :title="ws.meta[refKey(tab)]?.pinned ? 'Unpin' : 'Pin'"
          @click.stop="togglePin(refKey(tab))"
        >{{ ws.meta[refKey(tab)]?.pinned ? '📌' : '⊕' }}</button>
        <button
          class="tos-btn tos-btn--close"
          type="button"
          title="Close tab"
          @click.stop="closeTab(refKey(tab))"
        >×</button>
      </div>
      <!-- Invisible wider tap area for activating the row -->
      <button class="tos-row-activate" type="button" @click="activateAndClose(tab, 0)"></button>
    </div>

    <!-- Group 1 (split) -->
    <template v-if="hasSplit && group1.length">
      <div class="tos-group-label">Group 2</div>
      <div
        v-for="tab in group1"
        :key="refKey(tab)"
        class="tos-row"
        :class="{ 'tos-row--active': ws.active[0] === refKey(tab) || ws.active[1] === refKey(tab) }"
      >
        <span class="tos-glyph">{{ refGlyph(tab) }}</span>
        <span class="tos-label" :title="refTitle(tab, props.tasksList)">
          {{ refLabel(tab, props.tasksList) }}
        </span>
        <div class="tos-row-actions">
          <button
            class="tos-btn"
            type="button"
            :title="ws.meta[refKey(tab)]?.pinned ? 'Unpin' : 'Pin'"
            @click.stop="togglePin(refKey(tab))"
          >{{ ws.meta[refKey(tab)]?.pinned ? '📌' : '⊕' }}</button>
          <button
            class="tos-btn tos-btn--close"
            type="button"
            title="Close tab"
            @click.stop="closeTab(refKey(tab))"
          >×</button>
        </div>
        <button class="tos-row-activate" type="button" @click="activateAndClose(tab, 1)"></button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.tos-group-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.5;
  padding: 10px 16px 4px;
}

.tos-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
}

.tos-row:hover { background: var(--surface-2, #262626); }
.tos-row--active { background: var(--surface-2, #262626); font-weight: 600; }

.tos-glyph {
  font-size: 0.8rem;
  opacity: 0.55;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.tos-label {
  flex: 1;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tos-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
  z-index: 1;
}

.tos-btn {
  background: transparent;
  border: none;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 6px;
  border-radius: 3px;
  line-height: 1;
  transition: opacity 0.1s;
}
.tos-btn:hover { opacity: 1; background: var(--surface-3, #303030); }
.tos-btn--close { font-size: 1.2rem; }

/* Invisible row-level tap target beneath the action buttons */
.tos-row-activate {
  position: absolute;
  inset: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  z-index: 0;
}
</style>
