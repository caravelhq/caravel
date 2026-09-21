<script setup lang="ts">
import { useUiStore } from "../../stores/ui";
import { useVoiceStore } from "../voice/store/voice";
import { useRoute } from "vue-router";
import { computed } from "vue";

const ui = useUiStore();
const voice = useVoiceStore();
const route = useRoute();

const onChat = computed(() => route.path === "/chat");

function openVoiceMode() {
  document.dispatchEvent(new CustomEvent("voice:open-chat-mode"));
}

function openTaskCreator() {
  document.dispatchEvent(new CustomEvent("voice:open-task-creator"));
}

function toggleReadAloud() {
  document.dispatchEvent(new CustomEvent("voice:read-aloud-toggle"));
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
    hidden
    @click="openTaskCreator"
  >
    <i class="fa-solid fa-list-check"></i>
  </button>
  <button
    id="global-read-aloud"
    class="global-read-aloud"
    type="button"
    title="Read to me"
    aria-label="Read to me"
    hidden
    disabled
    @click="toggleReadAloud"
  >
    <i class="fa-solid fa-headphones"></i>
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
