<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useWorkspaceStore } from "../../stores/workspace";
import { useKnowledgeStore } from "../../stores/knowledge";
import { useNewTaskStore } from "../../stores/newTask";
import { refGlyph, refLabel } from "../../workspace/labels";
import type { ResourceRef } from "../../workspace/refs";

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
        <!-- Section: Pickers -->
        <div class="om-section-label" data-section="pickers">Pickers</div>
        <button id="tab-dashboard" class="open-menu-item" type="button" role="menuitem" @click="openDashboard">Dashboard</button>
        <button id="tab-tasks"     class="open-menu-item" type="button" role="menuitem" @click="openPicker({ kind: 'legacy', page: 'tasks' })">Tasks</button>
        <button id="tab-chat"      class="open-menu-item" type="button" role="menuitem" @click="openPicker({ kind: 'legacy', page: 'chat' })">Chat</button>
        <button id="tab-files"     class="open-menu-item" type="button" role="menuitem" @click="openPicker({ kind: 'legacy', page: 'files' })">Files</button>
        <button                    class="open-menu-item om-item-disabled" type="button" role="menuitem" disabled>
          Projects <span class="om-phase-tag">Phase 4</span>
        </button>

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
