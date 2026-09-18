<script setup lang="ts">
import { computed } from "vue";
import { useReadingStore } from "../../stores/reading";
import type { ReadingRef } from "../../stores/reading";
import DocViewer from "../doc/DocViewer.vue";

const reading = useReadingStore();

const activeRef = computed((): ReadingRef | null => {
  return reading.stack[reading.activeIndex] ?? null;
});

// Splitter pointer drag — resizes reading.width.
function onSplitterDown(ev: PointerEvent): void {
  ev.preventDefault();
  const startX = ev.clientX;
  const startW = reading.width;
  const side = reading.side;

  function onMove(me: PointerEvent): void {
    const dx = me.clientX - startX;
    const newW = side === "right" ? startW - dx : startW + dx;
    reading.setWidth(Math.max(200, Math.min(900, newW)));
  }
  function onUp(): void {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

// Drop zone — accepts application/x-caravel-ref drags.
function onDragOver(ev: DragEvent): void {
  if (!ev.dataTransfer?.types.includes("application/x-caravel-ref")) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = "copy";
}

function onDrop(ev: DragEvent): void {
  ev.preventDefault();
  reading.setDragActive(false);
  const data = ev.dataTransfer?.getData("application/x-caravel-ref");
  if (!data) return;
  try {
    const ref = JSON.parse(data) as ReadingRef;
    reading.throwRef(ref);
  } catch {}
}

function pillLabel(ref: ReadingRef): string {
  return ref.path.split("/").pop() || ref.path;
}
</script>

<template>
  <div
    class="reading-pane"
    :class="{ 'reading-drag-over': reading.dragActive }"
    :style="{ width: reading.width + 'px' }"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <!-- Splitter handle (left edge for right pane, right edge for left pane) -->
    <div class="reading-splitter" @pointerdown.stop="onSplitterDown" />

    <!-- Header: stack pills + controls -->
    <div class="reading-header">
      <div class="reading-stack">
        <button
          v-for="(item, i) in reading.stack"
          :key="item.path"
          class="reading-pill"
          :class="{ 'is-active': i === reading.activeIndex }"
          type="button"
          :title="item.path"
          @click="reading.activate(i)"
        >
          <span class="reading-pill-name">{{ pillLabel(item) }}</span>
          <span
            class="reading-pill-close"
            role="button"
            tabindex="-1"
            aria-label="Remove"
            @click.stop="reading.closeItem(i)"
          >×</span>
        </button>
        <span v-if="reading.stack.length === 0" class="reading-empty-hint">
          Drop a file or press ⇥
        </span>
      </div>
      <div class="reading-controls">
        <button
          class="reading-side-btn"
          type="button"
          :title="reading.side === 'right' ? 'Dock left' : 'Dock right'"
          @click="reading.setSide(reading.side === 'right' ? 'left' : 'right')"
        >{{ reading.side === "right" ? "⇦" : "⇨" }}</button>
        <button
          class="reading-close-btn"
          type="button"
          title="Close reading pane"
          @click="reading.setOpen(false)"
        >×</button>
      </div>
    </div>

    <!-- Document viewer -->
    <div class="reading-doc" v-if="activeRef">
      <DocViewer :path="activeRef.path" :kind="activeRef.kind" />
    </div>
    <div class="reading-doc reading-doc-empty" v-else>
      <p class="reading-drop-msg">Drop a file or press ⇥ on a file row to open it here.</p>
    </div>
  </div>
</template>
