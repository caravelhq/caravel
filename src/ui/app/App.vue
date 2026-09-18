<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { useUiStore } from "./stores/ui";
import { useReadingStore } from "./stores/reading";
import SettingsModal from "./components/chrome/SettingsModal.vue";
import HeartbeatBar from "./components/chrome/HeartbeatBar.vue";
import AudioModal from "./components/chrome/AudioModal.vue";
import StatusDock from "./components/chrome/StatusDock.vue";
import VoiceIsland from "./components/voice/VoiceIsland.vue";
import ReadingPane from "./components/reading/ReadingPane.vue";
import type { ReadingRef } from "./stores/reading";

const ui = useUiStore();
const reading = useReadingStore();

onMounted(() => {
  // Expose reading pane throw globally so vanilla DOM code (task doc-pills, etc.) can use it.
  (window as any).__throwToReadingPane = (ref: ReadingRef) => reading.throwRef(ref);
});

// Stage drag tracking — show drop zone on reading pane while dragging a valid ref.
function onStageDragEnter(ev: DragEvent): void {
  if (ev.dataTransfer?.types.includes("application/x-caravel-ref")) {
    reading.setDragActive(true);
  }
}
function onStageDragLeave(ev: DragEvent): void {
  // Only clear when leaving the stage entirely (relatedTarget is outside stage).
  const stage = (ev.currentTarget as HTMLElement);
  if (!stage.contains(ev.relatedTarget as Node)) {
    reading.setDragActive(false);
  }
}
function onStageDragEnd(): void {
  reading.setDragActive(false);
}
</script>

<template>
  <a
    class="repo-cta"
    href="https://github.com/caravelhq/caravel"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Star Caravel on GitHub"
  >
    <span class="repo-text">Like Caravel? Star it on GitHub</span>
    <span class="repo-star">★</span>
  </a>

  <SettingsModal />
  <HeartbeatBar />

  <section class="info-modal" id="info-modal" aria-live="polite" aria-hidden="true">
    <article class="info-card">
      <div class="info-head">
        <span>Advanced Technical Info</span>
        <button class="settings-close" id="info-close" type="button" aria-label="Close technical info">×</button>
      </div>
      <div class="info-body" id="info-body">
        <div class="info-section">
          <div class="info-title">Loading</div>
          <pre class="info-json">Loading technical data...</pre>
        </div>
      </div>
    </article>
  </section>

  <main
    class="stage"
    @dragenter.capture="onStageDragEnter"
    @dragleave.capture="onStageDragLeave"
    @dragend.capture="onStageDragEnd"
    @drop.capture="onStageDragEnd"
  >
    <nav class="tab-nav" role="tablist" aria-label="Main navigation">
      <RouterLink class="tab-btn" to="/dashboard" role="tab" aria-controls="dashboard-panel">
        <span class="tab-btn-label-full">Dashboard</span><span class="tab-btn-label-short">Dash</span>
      </RouterLink>
      <RouterLink class="tab-btn" to="/chat" role="tab" aria-controls="chat-panel">Chat</RouterLink>
      <RouterLink class="tab-btn" to="/tasks" role="tab" aria-controls="tasks-panel">Tasks</RouterLink>
      <RouterLink class="tab-btn" to="/files" role="tab" aria-controls="files-panel">Files</RouterLink>
      <button
        class="tab-btn tab-btn-split"
        id="reading-nav-toggle"
        type="button"
        title="Toggle reading pane"
        aria-label="Toggle reading pane"
        :aria-pressed="reading.open ? 'true' : 'false'"
        @click="reading.toggle()"
      >&#x2AFD;</button>
      <button
        class="tab-btn tab-btn-settings"
        id="settings-btn"
        type="button"
        title="Settings"
        @click="ui.settingsOpen = true"
      >&#x2699;</button>
    </nav>

    <!-- Stage body: main content + optional reading pane side by side -->
    <div
      class="stage-body"
      :class="{
        'reading-open': reading.open,
        'reading-left': reading.open && reading.side === 'left',
        'reading-right': reading.open && reading.side === 'right',
      }"
    >
      <div class="stage-main">
        <RouterView />
      </div>
      <ReadingPane v-if="reading.open" />
    </div>
  </main>

  <AudioModal />
  <StatusDock />
  <VoiceIsland />
</template>
