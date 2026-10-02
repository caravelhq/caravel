<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import { useUiStore } from "./stores/ui";
import { useWorkspaceStore } from "./stores/workspace";
import { useNewTaskStore } from "./stores/newTask";
import { useKnowledgeStore } from "./stores/knowledge";
import SettingsModal from "./components/chrome/SettingsModal.vue";
import HeartbeatBar from "./components/chrome/HeartbeatBar.vue";
import AudioModal from "./components/chrome/AudioModal.vue";
import StatusDock from "./components/chrome/StatusDock.vue";
import VoiceIsland from "./components/voice/VoiceIsland.vue";
import Workspace from "./workspace/Workspace.vue";
import NewTaskModal from "./components/tasks/NewTaskModal.vue";
import SearchModal from "./components/search/SearchModal.vue";

const ui = useUiStore();
const ws = useWorkspaceStore();
const nt = useNewTaskStore();
const kn = useKnowledgeStore();

function onGlobalKeyDown(ev: KeyboardEvent): void {
  const t = ev.target as HTMLElement;
  const inInput = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;

  // ⌘K / Ctrl-K — open search from anywhere
  if ((ev.metaKey || ev.ctrlKey) && ev.key === "k") {
    ev.preventDefault();
    kn.open();
    return;
  }

  // `/` — open search when no input has focus
  if (ev.key === "/" && !inInput && !ev.metaKey && !ev.ctrlKey) {
    ev.preventDefault();
    kn.open();
    return;
  }

  // `n` — new task shortcut
  if (ev.key === "n" && !inInput) {
    ev.preventDefault();
    nt.open();
  }
}

onMounted(() => { document.addEventListener("keydown", onGlobalKeyDown); });
onBeforeUnmount(() => { document.removeEventListener("keydown", onGlobalKeyDown); });
</script>

<template>
  <SettingsModal />
  <NewTaskModal />
  <SearchModal />
  <HeartbeatBar />

  <main class="stage">
    <nav class="tab-nav" role="tablist" aria-label="Main navigation">
      <button
        id="tab-dashboard"
        class="tab-btn"
        type="button"
        @click="ws.open({ kind: 'dashboard' })"
      >
        <span class="tab-btn-label-full">Dashboard</span
        ><span class="tab-btn-label-short">Dash</span>
      </button>
      <button
        id="tab-chat"
        class="tab-btn"
        type="button"
        @click="ws.open({ kind: 'legacy', page: 'chat' })"
      >Chat</button>
      <button
        id="tab-tasks"
        class="tab-btn"
        type="button"
        @click="ws.open({ kind: 'legacy', page: 'tasks' })"
      >Tasks</button>
      <button
        id="tab-files"
        class="tab-btn"
        type="button"
        @click="ws.open({ kind: 'legacy', page: 'files' })"
      >Files</button>
      <button
        class="tab-btn tab-btn-settings"
        id="settings-btn"
        type="button"
        title="Settings"
        @click="ui.settingsOpen = true"
      >&#x2699;</button>
    </nav>

    <Workspace />
  </main>

  <AudioModal />
  <StatusDock />
  <VoiceIsland />
</template>
