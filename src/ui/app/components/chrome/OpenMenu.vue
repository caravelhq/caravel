<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useWorkspaceStore } from "../../stores/workspace";
import { useKnowledgeStore } from "../../stores/knowledge";
import { useNewTaskStore } from "../../stores/newTask";
import { useLiveStore } from "../../stores/live";
import { refGlyph, refLabel, TASKS_LIST_KEY, PROJECTS_LIST_KEY } from "../../workspace/labels";
import type { ResourceRef } from "../../workspace/refs";
import type { TaskRow } from "../../stores/tasks";
import type { ProjectCard } from "../../stores/projects";

const ws = useWorkspaceStore();
const kn = useKnowledgeStore();
const nt = useNewTaskStore();
const live = useLiveStore();

// Read shared lists bound by TabStrip so recents resolve labels.
const tasksList = computed<TaskRow[] | null>(() => {
  const e = live.entry(TASKS_LIST_KEY);
  return (e?.data as TaskRow[] | null) ?? null;
});
const projectsList = computed<ProjectCard[] | null>(() => {
  const e = live.entry(PROJECTS_LIST_KEY);
  return (e?.data as ProjectCard[] | null) ?? null;
});

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

// Dashboard is not a picker (DEC-0022) — opens as an ordinary unpinned tab.
function openDashboard(): void { ws.open({ kind: "dashboard" }); close(); }

// Pickers open pinned (DEC-0022).
function openPicker(r: ResourceRef): void { ws.open(r); ws.pin(ws.refKey(r)); close(); }

function openSearch(): void { kn.open(); close(); }
function openNewTask(): void { nt.open(); close(); }

// Recents: remove from ring and open.
function openRecent(key: string): void { ws.reopenFromRecents(key); close(); }

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
      aria-label="Open menu"
      title="Open"
      @click="toggle"
    ><svg class="open-menu-ship" viewBox="0 0 120 96" width="22" height="18" fill="none" aria-hidden="true">
        <path d="M34 70 V30 M58 70 V14 M84 60 V28" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.55" />
        <path d="M66 52 L100 24 Q106 40 98 60 Q82 58 66 52 Z" fill="currentColor" opacity="0.6" />
        <path d="M30 44 L78 8 Q88 36 74 64 Q52 60 30 44 Z" fill="currentColor" opacity="0.92" />
        <path d="M14 58 L50 26 Q58 46 48 66 Q30 64 14 58 Z" fill="currentColor" opacity="0.74" />
        <path d="M16 70 H104 L95 84 Q90 89 82 89 H38 Q30 89 25 84 Z" fill="currentColor" />
      </svg></button>

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
        <!-- Section: Pickers -->
        <div class="om-section-label" data-section="pickers">Pickers</div>
        <button id="tab-dashboard" class="open-menu-item" type="button" role="menuitem" @click="openDashboard">Dashboard</button>
        <button id="tab-tasks"     class="open-menu-item" type="button" role="menuitem" @click="openPicker({ kind: 'legacy', page: 'tasks' })">Open</button>
        <button id="tab-chat"      class="open-menu-item" type="button" role="menuitem" @click="openPicker({ kind: 'legacy', page: 'chat' })">Chat</button>
        <button id="tab-files"     class="open-menu-item" type="button" role="menuitem" @click="openPicker({ kind: 'legacy', page: 'files' })">Files</button>
        <button id="tab-projects"  class="open-menu-item" type="button" role="menuitem" @click="openPicker({ kind: 'legacy', page: 'tasks' })">Projects</button>

        <!-- Section: Recents (only when non-empty) -->
        <template v-if="ws.recents.length > 0">
          <hr class="open-menu-sep" />
          <div class="om-section-label" data-section="recents">Recents</div>
          <button
            v-for="recent in ws.recents"
            :key="ws.refKey(recent)"
            class="open-menu-item om-item-recent"
            type="button"
            role="menuitem"
            :data-recent-key="ws.refKey(recent)"
            @click="openRecent(ws.refKey(recent))"
          >
            <span class="om-glyph">{{ refGlyph(recent) }}</span>
            {{ refLabel(recent) }}
          </button>
        </template>

        <!-- Section: Actions -->
        <hr class="open-menu-sep" />
        <div class="om-section-label" data-section="actions">Actions</div>
        <button class="open-menu-item" type="button" role="menuitem" @click="openSearch">Search <kbd>⌘K</kbd></button>
        <button class="open-menu-item" type="button" role="menuitem" @click="openNewTask">New task <kbd>N</kbd></button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.open-menu-ship {
  display: block;
}
.open-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.om-section-label {
  padding: 6px 14px 3px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6a7a8a;
  pointer-events: none;
  user-select: none;
}

.om-item-disabled {
  opacity: 0.35;
  cursor: default;
}

.om-item-recent {
  display: flex;
  align-items: center;
  gap: 6px;
}

.om-glyph {
  font-size: 11px;
  opacity: 0.7;
  min-width: 14px;
  text-align: center;
}

.om-phase-tag {
  font-size: 10px;
  opacity: 0.7;
  margin-left: auto;
  padding-left: 8px;
}
</style>
