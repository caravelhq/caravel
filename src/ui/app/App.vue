<script setup lang="ts">
import { useUiStore } from "./stores/ui";
import SettingsModal from "./components/chrome/SettingsModal.vue";
import HeartbeatBar from "./components/chrome/HeartbeatBar.vue";
import AudioModal from "./components/chrome/AudioModal.vue";
import StatusDock from "./components/chrome/StatusDock.vue";
import VoiceIsland from "./components/voice/VoiceIsland.vue";
import Workspace from "./workspace/Workspace.vue";

const ui = useUiStore();
</script>

<template>
  <SettingsModal />
  <HeartbeatBar />

  <main class="stage">
    <nav class="tab-nav" role="tablist" aria-label="Main navigation">
      <RouterLink id="tab-dashboard" class="tab-btn" to="/dashboard" role="tab" aria-controls="dashboard-panel">
        <span class="tab-btn-label-full">Dashboard</span><span class="tab-btn-label-short">Dash</span>
      </RouterLink>
      <RouterLink id="tab-chat" class="tab-btn" to="/chat" role="tab" aria-controls="chat-panel">Chat</RouterLink>
      <RouterLink id="tab-tasks" class="tab-btn" to="/tasks" role="tab" aria-controls="tasks-panel">Tasks</RouterLink>
      <RouterLink id="tab-files" class="tab-btn" to="/files" role="tab" aria-controls="files-panel">Files</RouterLink>
      <button
        class="tab-btn tab-btn-settings"
        id="settings-btn"
        type="button"
        title="Settings"
        @click="ui.settingsOpen = true"
      >&#x2699;</button>
    </nav>

    <div class="stage-body">
      <Workspace />
    </div>
  </main>

  <AudioModal />
  <StatusDock />
  <VoiceIsland />
</template>
