<script setup lang="ts">
import { useReadingStore } from "../../stores/reading";
import type { ReadingRef } from "../../stores/reading";

const reading = useReadingStore();

function onDragOver(ev: DragEvent): void {
  if (!ev.dataTransfer) return;
  const types = ev.dataTransfer.types;
  if (types.includes("application/x-caravel-ref") || types.includes("text/plain")) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
  }
}

function onDrop(ev: DragEvent): void {
  ev.preventDefault();
  reading.setDragActive(false);
  if (!ev.dataTransfer) return;

  const raw = ev.dataTransfer.getData("application/x-caravel-ref")
    || ev.dataTransfer.getData("text/plain");
  if (!raw) return;

  try {
    const ref = JSON.parse(raw) as ReadingRef;
    if (ref && ref.path) reading.throwRef(ref);
  } catch {
    // text/plain fallback — treat as a file path
    const path = raw.trim();
    if (path) reading.throwRef({ kind: "file", path });
  }
}

function onDragLeave(ev: DragEvent): void {
  // Only clear when leaving the drop zone element itself
  const zone = ev.currentTarget as HTMLElement;
  if (!zone.contains(ev.relatedTarget as Node)) {
    reading.setDragActive(false);
  }
}
</script>

<template>
  <div
    class="reading-drop-zone"
    aria-label="Drop here to open in reading pane"
    role="region"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragleave="onDragLeave"
  >
    <span class="reading-drop-zone-label">⇥ Open in reading pane</span>
  </div>
</template>
