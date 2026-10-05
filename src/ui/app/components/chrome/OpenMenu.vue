<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useWorkspaceStore } from "../../stores/workspace";
import { useKnowledgeStore } from "../../stores/knowledge";
import { useNewTaskStore } from "../../stores/newTask";

const ws = useWorkspaceStore();
const kn = useKnowledgeStore();
const nt = useNewTaskStore();

const isOpen = ref(false);
const anchorRef = ref<HTMLDivElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);

// Fixed position for the teleported panel — updated when opening.
const panelTop = ref("0px");
const panelLeft = ref("0px");

function updatePosition(): void {
  const r = anchorRef.value?.getBoundingClientRect();
  if (r) {
    panelTop.value = `${r.bottom + 4}px`;
    panelLeft.value = `${r.left}px`;
  }
}

function toggle(): void {
  if (isOpen.value) {
    isOpen.value = false;
  } else {
    updatePosition();
    isOpen.value = true;
  }
}

function close(): void {
  isOpen.value = false;
}

function openDashboard(): void { ws.open({ kind: "dashboard" }); close(); }
function openTasks(): void { ws.open({ kind: "legacy", page: "tasks" }); close(); }
function openChat(): void { ws.open({ kind: "legacy", page: "chat" }); close(); }
function openFiles(): void { ws.open({ kind: "legacy", page: "files" }); close(); }
function openSearch(): void { kn.open(); close(); }
function openNewTask(): void { nt.open(); close(); }

function onDocPointerDown(ev: PointerEvent): void {
  if (!isOpen.value) return;
  const anchor = anchorRef.value;
  const panel = panelRef.value;
  if (!anchor?.contains(ev.target as Node) && !panel?.contains(ev.target as Node)) {
    close();
  }
}

function onDocKeyDown(ev: KeyboardEvent): void {
  if (ev.key === "Escape" && isOpen.value) {
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
  <div ref="anchorRef" class="open-menu">
    <button
      class="open-menu-btn"
      type="button"
      aria-haspopup="true"
      :aria-expanded="isOpen"
      @click="toggle"
    >Open ▾</button>

    <!-- Teleported to body so it escapes the tab-strip overflow-x:auto container -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="panelRef"
        class="open-menu-list"
        :style="{ top: panelTop, left: panelLeft }"
        role="menu"
        @click.stop
      >
        <button id="tab-dashboard" class="open-menu-item" type="button" role="menuitem" @click="openDashboard">Dashboard</button>
        <button id="tab-tasks"     class="open-menu-item" type="button" role="menuitem" @click="openTasks">Tasks</button>
        <button id="tab-chat"      class="open-menu-item" type="button" role="menuitem" @click="openChat">Chat</button>
        <button id="tab-files"     class="open-menu-item" type="button" role="menuitem" @click="openFiles">Files</button>
        <hr class="open-menu-sep" />
        <button class="open-menu-item" type="button" role="menuitem" @click="openSearch">Search <kbd>⌘K</kbd></button>
        <button class="open-menu-item" type="button" role="menuitem" @click="openNewTask">New task <kbd>N</kbd></button>
      </div>
    </Teleport>
  </div>
</template>
