<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useWorkspaceStore } from "../stores/workspace";
import { useUiStore } from "../stores/ui";
import { useLiveStore } from "../stores/live";
import { refKey, type ResourceRef } from "./refs";
import { refLabel, refGlyph, refTitle, TASKS_LIST_KEY, tasksListSpec } from "./labels";
import type { TaskRow } from "../stores/tasks";
import OpenMenu from "../components/chrome/OpenMenu.vue";
import TabOverflowSheet from "./TabOverflowSheet.vue";

const ws = useWorkspaceStore();
const ui = useUiStore();
const live = useLiveStore();

const group0 = computed(() => ws.groupTabs(0));
const group1 = computed(() => ws.groupTabs(1));

// ── Shared tasks-list binding (ONE bind for the whole strip) ──────────────────

onMounted(() => { live.bind(TASKS_LIST_KEY, tasksListSpec); });
onBeforeUnmount(() => { live.unbind(TASKS_LIST_KEY); });

const tasksList = computed<TaskRow[] | null>(() => {
  const e = live.entry(TASKS_LIST_KEY);
  return (e?.data as TaskRow[] | null) ?? null;
});

// Per-tab label: check per-id entry (created by EnvelopeView) first, then the list.
function tabLabel(r: ResourceRef): string {
  if (r.kind === "envelope" || r.kind === "report") {
    const perIdEntry = live.entry("task:" + r.taskId);
    const headline = (perIdEntry?.data as Record<string, unknown> | null)?.headline as string | undefined;
    if (headline) return headline;
  }
  return refLabel(r, tasksList.value);
}

// ── Overflow detection ────────────────────────────────────────────────────────

const stripEl = ref<HTMLElement | null>(null);
const isOverflowing = ref(false);
const overflowOpen = ref(false);

function checkOverflow(): void {
  const el = stripEl.value;
  if (!el) return;
  isOverflowing.value = el.scrollWidth > el.clientWidth;
}

let ro: ResizeObserver | null = null;
onMounted(() => {
  if (stripEl.value) {
    ro = new ResizeObserver(checkOverflow);
    ro.observe(stripEl.value);
  }
  nextTick(checkOverflow);
});
onBeforeUnmount(() => { ro?.disconnect(); });
watch(() => ws.tabs.length, () => nextTick(checkOverflow));

// ── Context menu ──────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; tab: ResourceRef }
const contextMenu = ref<CtxMenu | null>(null);

function openContextMenu(e: { clientX: number; clientY: number }, tab: ResourceRef): void {
  contextMenu.value = { x: e.clientX, y: e.clientY, tab };
}

function closeCtx(): void { contextMenu.value = null; }

function handleGlobalKeydown(e: KeyboardEvent): void {
  if (contextMenu.value && e.key === "Escape") { e.preventDefault(); closeCtx(); }
}
onMounted(() => document.addEventListener("keydown", handleGlobalKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleGlobalKeydown));

// Long-press for context menu on touch
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressRef: { e: TouchEvent; tab: ResourceRef } | null = null;

function onTouchStart(e: TouchEvent, tab: ResourceRef): void {
  longPressRef = { e, tab };
  longPressTimer = setTimeout(() => {
    if (!longPressRef) return;
    const touch = longPressRef.e.touches[0];
    if (touch) openContextMenu({ clientX: touch.clientX, clientY: touch.clientY }, longPressRef.tab);
    longPressRef = null;
  }, 500);
}

function onTouchEnd(): void {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
  longPressRef = null;
}

// ── Hover prefetch (DEC-0021 second caller) ───────────────────────────────────

function prefetchRef(ref: ResourceRef): void {
  if (ref.kind !== "envelope" && ref.kind !== "report") return;
  const k = refKey(ref);
  live.prefetch(k, {
    topics: ["tasks"],
    fetch: async () => {
      try {
        const r = await fetch("/api/tasks/" + encodeURIComponent(ref.taskId));
        return r.ok ? r.json() : null;
      } catch { return null; }
    },
  });
}

function onTabHover(idx: number, group: ResourceRef[]): void {
  const prev = idx > 0 ? group[idx - 1] : null;
  const next = idx < group.length - 1 ? group[idx + 1] : null;
  if (prev) prefetchRef(prev);
  if (next) prefetchRef(next);
}

// ── Drag and drop ─────────────────────────────────────────────────────────────

const draggedKey = ref<string | null>(null);
const dragOverIdx = ref<number | null>(null);
const dragOverDivider = ref(false);

function isActive(tab: ResourceRef): boolean {
  const key = refKey(tab);
  return ws.active[0] === key || ws.active[1] === key;
}

function onDragStart(e: DragEvent, key: string): void {
  draggedKey.value = key;
  e.dataTransfer!.effectAllowed = "move";
  e.dataTransfer!.setData("application/x-caravel-ref", key);
}

function onDragEnd(): void {
  draggedKey.value = null;
  dragOverIdx.value = null;
  dragOverDivider.value = false;
}

function onTabDragOver(e: DragEvent, flatIdx: number): void {
  e.preventDefault();
  dragOverIdx.value = flatIdx;
  dragOverDivider.value = false;
}

function onDividerDragOver(e: DragEvent): void {
  e.preventDefault();
  dragOverDivider.value = true;
  dragOverIdx.value = null;
}

function onTabDrop(e: DragEvent, flatIdx: number): void {
  e.preventDefault();
  const key = e.dataTransfer?.getData("application/x-caravel-ref") || draggedKey.value;
  if (!key) { onDragEnd(); return; }
  const fromIdx = ws.tabs.findIndex((t) => refKey(t) === key);
  if (fromIdx !== flatIdx) ws.move(key, flatIdx);
  onDragEnd();
}

function onDividerDrop(e: DragEvent): void {
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
  <div class="tab-strip-outer">
    <!-- Scrollable tab area -->
    <div class="tab-strip" ref="stripEl">
      <!-- Open menu — first element in the strip -->
      <OpenMenu />

      <!-- Group 0 tabs -->
      <button
        v-for="(tab, i) in group0"
        :key="refKey(tab)"
        class="ts-tab"
        :class="{
          'ts-tab--active': isActive(tab),
          'ts-tab--focused': ws.active[ws.focused] === refKey(tab),
          'ts-tab--drag-over': dragOverIdx === i,
          'ts-tab--pinned': ws.meta[refKey(tab)]?.pinned,
          'ts-tab--preview': ws.meta[refKey(tab)]?.preview,
        }"
        :data-key="refKey(tab)"
        :title="refTitle(tab, tasksList)"
        role="tab"
        :aria-selected="ws.active[ws.focused] === refKey(tab)"
        draggable="true"
        type="button"
        @click="ws.activate(refKey(tab)); ws.focus(0)"
        @mouseenter="onTabHover(i, group0)"
        @mousedown.middle.prevent="ws.close(refKey(tab))"
        @contextmenu.prevent="openContextMenu($event, tab)"
        @touchstart.passive="onTouchStart($event, tab)"
        @touchend.passive="onTouchEnd"
        @touchmove.passive="onTouchEnd"
        @dragstart="onDragStart($event, refKey(tab))"
        @dragend="onDragEnd"
        @dragover="onTabDragOver($event, i)"
        @dragleave="dragOverIdx = null"
        @drop="onTabDrop($event, i)"
      >
        <span class="ts-tab-glyph">{{ refGlyph(tab) }}</span>
        <span class="ts-tab-label">{{ tabLabel(tab) }}</span>
        <span
          v-if="!ws.meta[refKey(tab)]?.pinned"
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
          'ts-tab--pinned': ws.meta[refKey(tab)]?.pinned,
          'ts-tab--preview': ws.meta[refKey(tab)]?.preview,
        }"
        :data-key="refKey(tab)"
        :title="refTitle(tab, tasksList)"
        role="tab"
        :aria-selected="ws.active[ws.focused] === refKey(tab)"
        draggable="true"
        type="button"
        @click="ws.activate(refKey(tab)); ws.focus(1)"
        @mouseenter="onTabHover(i, group1)"
        @mousedown.middle.prevent="ws.close(refKey(tab))"
        @contextmenu.prevent="openContextMenu($event, tab)"
        @touchstart.passive="onTouchStart($event, tab)"
        @touchend.passive="onTouchEnd"
        @touchmove.passive="onTouchEnd"
        @dragstart="onDragStart($event, refKey(tab))"
        @dragend="onDragEnd"
        @dragover="onTabDragOver($event, group0.length + i)"
        @dragleave="dragOverIdx = null"
        @drop="onTabDrop($event, group0.length + i)"
      >
        <span class="ts-tab-glyph">{{ refGlyph(tab) }}</span>
        <span class="ts-tab-label">{{ tabLabel(tab) }}</span>
        <span
          v-if="!ws.meta[refKey(tab)]?.pinned"
          class="ts-tab-close"
          role="button"
          tabindex="-1"
          aria-label="Close tab"
          @click.stop="ws.close(refKey(tab))"
        >×</span>
      </button>
    </div>

    <!-- Right-edge fade when strip overflows -->
    <div v-if="isOverflowing" class="ts-overflow-fade" aria-hidden="true"></div>

    <!-- Always-visible actions — outside the scrollable strip -->
    <div class="ts-actions">
      <button
        v-if="isOverflowing"
        class="ts-overflow-btn"
        type="button"
        :title="`${ws.tabs.length} tabs — click to see all`"
        @click="overflowOpen = true"
      >⋯ {{ ws.tabs.length }}</button>
      <button
        class="ts-split-btn"
        :class="{ 'ts-split-btn--active': ws.splitOn }"
        type="button"
        :title="ws.splitOn ? 'Close split' : 'Open split'"
        @click="ws.toggleSplit()"
      >⫽</button>
      <button
        id="settings-btn"
        class="ts-settings-btn"
        type="button"
        title="Settings"
        @click="ui.settingsOpen = true"
      >&#x2699;</button>
    </div>
  </div>

  <!-- Context menu -->
  <template v-if="contextMenu">
    <div class="ts-ctx-backdrop" @pointerdown="closeCtx"></div>
    <div
      class="ts-ctx-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @pointerdown.stop
    >
      <button
        class="ts-ctx-item"
        type="button"
        @click="ws.meta[refKey(contextMenu.tab)]?.pinned ? ws.unpin(refKey(contextMenu.tab)) : ws.pin(refKey(contextMenu.tab)); closeCtx()"
      >{{ ws.meta[refKey(contextMenu.tab)]?.pinned ? 'Unpin' : 'Pin' }}</button>
      <button class="ts-ctx-item" type="button" @click="ws.close(refKey(contextMenu.tab)); closeCtx()">Close</button>
      <button class="ts-ctx-item" type="button" @click="ws.closeOthers(refKey(contextMenu.tab)); closeCtx()">Close others</button>
      <button class="ts-ctx-item" type="button" @click="ws.closeToRight(refKey(contextMenu.tab)); closeCtx()">Close to the right</button>
      <button class="ts-ctx-item" type="button" @click="ws.moveToGroup(refKey(contextMenu.tab), ws.tabGroup(ws.tabs.findIndex(t => refKey(t) === refKey(contextMenu!.tab))) === 0 ? 1 : 0); closeCtx()">Move to other group</button>
    </div>
  </template>

  <!-- Overflow sheet -->
  <TabOverflowSheet
    :open="overflowOpen"
    :tasks-list="tasksList"
    @close="overflowOpen = false"
  />
</template>

<style scoped>
.tab-strip-outer {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  flex-shrink: 0;
  position: relative;
  background: var(--surface-1, #1a1a1a);
  border-bottom: 1px solid var(--border-subtle, #333);
  padding: 4px 0 0;
  overflow: hidden;
}

/* Scrollable tab rail — overflows horizontally with no scrollbar */
.tab-strip {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  flex: 1;
  align-items: stretch;
  gap: 2px;
  padding: 0 8px;
  scrollbar-width: none;
}

.tab-strip::-webkit-scrollbar { display: none; }

/* Right-edge fade indicating hidden tabs */
.ts-overflow-fade {
  position: absolute;
  top: 0;
  bottom: 1px;
  right: 110px; /* approximate width of ts-actions */
  width: 40px;
  background: linear-gradient(to right, transparent, var(--surface-1, #1a1a1a));
  pointer-events: none;
  z-index: 1;
}

.ts-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
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
.ts-tab--preview { font-style: italic; }
.ts-tab--pinned { font-weight: 600; }

.ts-tab--drag-over {
  outline: 2px solid var(--accent, #7dc5ff);
  outline-offset: -2px;
}

.ts-tab-glyph {
  font-size: 0.75rem;
  opacity: 0.6;
  flex-shrink: 0;
}

/* Pre-truncated via middleEllipsis — no CSS ellipsis needed */
.ts-tab-label {
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
}

/* Close button — minimum 32×32 visual, 44×44 touch target on mobile */
.ts-tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  cursor: pointer;
  opacity: 0.55;
  border-radius: 3px;
  flex-shrink: 0;
  margin: -4px -4px -4px 0;
}

.ts-tab-close:hover { opacity: 1; background: var(--surface-4, #3a3a3a); }

@media (max-width: 600px) {
  .ts-tab-close {
    min-width: 44px;
    min-height: 44px;
  }
}

/* Divider between groups */
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

/* Actions bar — always visible, never scrolls */
.ts-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 2px;
  gap: 2px;
  background: var(--surface-1, #1a1a1a);
  position: relative;
  z-index: 2;
}

.ts-overflow-btn {
  background: transparent;
  border: 1px solid var(--border-subtle, #444);
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  font-size: 0.82rem;
  padding: 2px 7px;
  border-radius: 3px;
  white-space: nowrap;
  transition: opacity 0.1s;
}
.ts-overflow-btn:hover { opacity: 1; }

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

.ts-settings-btn {
  background: transparent;
  border: none;
  color: inherit;
  opacity: 0.45;
  cursor: pointer;
  font-size: 1.25rem;
  padding: 2px 6px;
  border-radius: 3px;
  transition: opacity 0.1s;
  border-left: 1px solid var(--border-subtle, #333);
  margin-left: 2px;
}
.ts-settings-btn:hover { opacity: 0.8; }

/* Context menu backdrop + popup */
.ts-ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
}

.ts-ctx-menu {
  position: fixed;
  z-index: 901;
  background: var(--surface-2, #262626);
  border: 1px solid var(--border-subtle, #444);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

.ts-ctx-item {
  display: block;
  width: 100%;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 0.88rem;
  white-space: nowrap;
  transition: background 0.1s;
}
.ts-ctx-item:hover { background: var(--surface-3, #303030); }
</style>
