<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import { useNewTaskStore } from "./stores/newTask";
import { useKnowledgeStore } from "./stores/knowledge";
import { useUiStore } from "./stores/ui";
import SettingsModal from "./components/chrome/SettingsModal.vue";
import HeartbeatBar from "./components/chrome/HeartbeatBar.vue";
import AudioModal from "./components/chrome/AudioModal.vue";
import StatusDock from "./components/chrome/StatusDock.vue";
import VoiceIsland from "./components/voice/VoiceIsland.vue";
import Workspace from "./workspace/Workspace.vue";
import NewTaskModal from "./components/tasks/NewTaskModal.vue";
import SearchModal from "./components/search/SearchModal.vue";

const nt = useNewTaskStore();
const kn = useKnowledgeStore();
const ui = useUiStore();

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

onMounted(() => {
  document.addEventListener("keydown", onGlobalKeyDown);
  ui.initVoice();
});
onBeforeUnmount(() => { document.removeEventListener("keydown", onGlobalKeyDown); });
</script>

<template>
  <SettingsModal />
  <NewTaskModal />
  <SearchModal />
  <HeartbeatBar />

  <main class="stage">
    <Workspace />
  </main>

  <AudioModal />
  <StatusDock />
  <VoiceIsland />
</template>
