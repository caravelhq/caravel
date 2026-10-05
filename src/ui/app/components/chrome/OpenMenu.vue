<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useWorkspaceStore } from "../../stores/workspace";
import { useKnowledgeStore } from "../../stores/knowledge";
import { useNewTaskStore } from "../../stores/newTask";

const ws = useWorkspaceStore();
const kn = useKnowledgeStore();
const nt = useNewTaskStore();

const detailsRef = ref<HTMLDetailsElement | null>(null);

function close(): void {
  if (detailsRef.value) detailsRef.value.open = false;
}

function openDashboard(): void {
  ws.open({ kind: "dashboard" });
  close();
}

function openTasks(): void {
  ws.open({ kind: "legacy", page: "tasks" });
  close();
}

function openChat(): void {
  ws.open({ kind: "legacy", page: "chat" });
  close();
}

function openFiles(): void {
  ws.open({ kind: "legacy", page: "files" });
  close();
}

function openSearch(): void {
  kn.open();
  close();
}

function openNewTask(): void {
  nt.open();
  close();
}

// Close on outside pointer-down (Escape comes free from <details>).
function onDocPointerDown(ev: PointerEvent): void {
  if (!detailsRef.value?.open) return;
  if (!detailsRef.value.contains(ev.target as Node)) close();
}

// Close on Escape (in addition to the native <details> toggle via keyboard).
function onDocKeyDown(ev: KeyboardEvent): void {
  if (ev.key === "Escape" && detailsRef.value?.open) {
    close();
    ev.stopPropagation();
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown, true);
  document.addEventListener("keydown", onDocKeyDown, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  document.removeEventListener("keydown", onDocKeyDown, true);
});
</script>

<template>
  <details ref="detailsRef" class="open-menu">
    <summary class="open-menu-btn" aria-haspopup="true">Open ▾</summary>
    <div class="open-menu-list" role="menu">
      <button id="tab-dashboard" class="open-menu-item" type="button" role="menuitem" @click="openDashboard">Dashboard</button>
      <button id="tab-tasks"     class="open-menu-item" type="button" role="menuitem" @click="openTasks">Tasks</button>
      <button id="tab-chat"      class="open-menu-item" type="button" role="menuitem" @click="openChat">Chat</button>
      <button id="tab-files"     class="open-menu-item" type="button" role="menuitem" @click="openFiles">Files</button>
      <hr class="open-menu-sep" />
      <button class="open-menu-item" type="button" role="menuitem" @click="openSearch">Search <kbd>⌘K</kbd></button>
      <button class="open-menu-item" type="button" role="menuitem" @click="openNewTask">New task <kbd>N</kbd></button>
    </div>
  </details>
</template>
