<script setup lang="ts">
import { useUiStore } from "../../stores/ui";
import { useVoiceStore } from "../voice/store/voice";
import { useWorkspaceStore } from "../../stores/workspace";
import { useGlobalReadAloud } from "../voice/useGlobalReadAloud";
import { computed } from "vue";

const ui = useUiStore();
const voice = useVoiceStore();
const ws = useWorkspaceStore();
const { doReadAloud } = useGlobalReadAloud();

// Gate voice-mode on the focused tab being chat, not on the route path.
const onChat = computed(() => {
  const ref = ws.focusedActiveRef;
  return ref?.kind === "legacy" && ref.page === "chat";
});

// Read-aloud button is shown for all tabs when TTS is enabled, but disabled when
// the focused view has no readable content (raText set by each page on its content).
const raDisabled = computed(() => ui.raText === null || ui.raState === "loading");
const raTitle = computed(() => ui.raState === "playing" ? "Stop reading" : "Read to me");
const raAriaLabel = computed(() => ui.raState === "playing" ? "Stop reading" : "Read to me");

function openVoiceMode() {
  document.dispatchEvent(new CustomEvent("voice:open-chat-mode"));
}

function openTaskCreator() {
  document.dispatchEvent(new CustomEvent("voice:open-task-creator"));
}

function toggleSpeaker() {
  ui.ttsEnabled = !ui.ttsEnabled;
}
</script>

<template>
  <button
    id="global-voice-mode"
    class="global-voice-mode"
    type="button"
    title="Voice chat mode"
    aria-label="Voice chat mode"
    :hidden="!onChat || !ui.micEnabled"
    @click="openVoiceMode"
  >
    <i class="fa-solid fa-walkie-talkie"></i>
  </button>
  <button
    id="global-voice-task"
    class="global-voice-task"
    type="button"
    title="Voice task creator"
    aria-label="Voice task creator"
    :hidden="!ui.micEnabled"
    @click="openTaskCreator"
  >
    <i class="fa-solid fa-list-check"></i>
  </button>
  <button
    id="global-read-aloud"
    class="global-read-aloud"
    type="button"
    :title="raTitle"
    :aria-label="raAriaLabel"
    :hidden="!ui.ttsEnabled"
    :disabled="raDisabled"
    :class="{ 'is-playing': ui.raState === 'playing' }"
    @click="doReadAloud"
  >
    <i v-if="ui.raState === 'loading'" class="fa-solid fa-spinner fa-spin"></i>
    <i v-else-if="ui.raState === 'playing'" class="fa-solid fa-stop"></i>
    <i v-else class="fa-solid fa-headphones"></i>
  </button>
  <button
    id="global-speaker"
    class="global-speaker"
    type="button"
    title="Enable auto-read"
    aria-label="Enable auto-read"
    :hidden="!ui.ttsEnabled"
    @click="toggleSpeaker"
  >
    <i class="fa-solid fa-volume-xmark"></i>
  </button>
</template>
