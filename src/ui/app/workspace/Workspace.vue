<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useWorkspaceStore } from "../stores/workspace";
import { refKey, type ResourceRef } from "./refs";
import TabStrip from "./TabStrip.vue";
import ViewHost from "./ViewHost.vue";

const ws = useWorkspaceStore();

// Viewport width tracking for ≥1200px split layout
const viewportWidth = ref(typeof window !== "undefined" ? window.innerWidth : 1440);
function onResize() { viewportWidth.value = window.innerWidth; }
onMounted(() => window.addEventListener("resize", onResize, { passive: true }));
onBeforeUnmount(() => window.removeEventListener("resize", onResize));

const isWide = computed(() => viewportWidth.value >= 1200);
const showSplit = computed(() => isWide.value && ws.splitOn);

function activeRefForGroup(g: 0 | 1): ResourceRef | null {
  const key = ws.active[g];
  if (!key) return null;
  return ws.tabs.find((t) => refKey(t) === key) ?? null;
}

// Splitter drag
const draggingSplitter = ref(false);
let splitterContainerWidth = 0;

function startSplitterDrag(e: MouseEvent) {
  e.preventDefault();
  draggingSplitter.value = true;
  const container = (e.currentTarget as HTMLElement).parentElement!;
  splitterContainerWidth = container.getBoundingClientRect().width;

  function onMove(ev: MouseEvent) {
    if (!draggingSplitter.value) return;
    const containerRect = container.getBoundingClientRect();
    const ratio = (ev.clientX - containerRect.left) / containerRect.width;
    ws.splitRatio = Math.min(0.75, Math.max(0.25, ratio));
  }

  function onUp() {
    draggingSplitter.value = false;
    try {
      localStorage.setItem("workspace.splitRatio", JSON.stringify(ws.splitRatio));
    } catch {}
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}
</script>

<template>
  <div class="workspace">
    <TabStrip />

    <div class="workspace-body">
      <!-- Narrow or split off: single host -->
      <template v-if="!showSplit">
        <ViewHost :active-ref="activeRefForGroup(ws.focused)" />
      </template>

      <!-- Wide + split on: two panes with resizable splitter -->
      <template v-else>
        <div
          class="ws-pane"
          :style="{ width: (ws.splitRatio * 100).toFixed(2) + '%' }"
          @click="ws.focus(0)"
        >
          <ViewHost :active-ref="activeRefForGroup(0)" />
        </div>

        <div
          class="ws-splitter"
          :class="{ 'ws-splitter--dragging': draggingSplitter }"
          @mousedown="startSplitterDrag"
        />

        <div
          class="ws-pane"
          :style="{ width: ((1 - ws.splitRatio) * 100).toFixed(2) + '%' }"
          @click="ws.focus(1)"
        >
          <ViewHost :active-ref="activeRefForGroup(1)" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.workspace-body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ws-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.ws-splitter {
  width: 4px;
  flex-shrink: 0;
  background: var(--border-subtle, #333);
  cursor: col-resize;
  transition: background 0.15s;
  user-select: none;
}

.ws-splitter:hover,
.ws-splitter--dragging {
  background: var(--accent, #7dc5ff66);
}
</style>
