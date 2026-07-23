<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import { useVoiceStore } from "./store/voice";
import VoiceModeOverlay from "./components/VoiceModeOverlay.vue";
import VoiceTaskCreator from "./components/VoiceTaskCreator.vue";

const voice = useVoiceStore();

function onOpenChatMode() { voice.openChatMode(); }
function onOpenTaskCreator() { voice.openTaskCreatorMode(); }
function onClose() { voice.close(); }

onMounted(() => {
  document.addEventListener("voice:open-chat-mode", onOpenChatMode);
  document.addEventListener("voice:open-task-creator", onOpenTaskCreator);
  document.addEventListener("voice:close", onClose);
  // Signal to vanilla client.js that the island is ready
  (window as any).__voiceIslandReady = true;
  document.dispatchEvent(new CustomEvent("voice:island-ready"));
});

onBeforeUnmount(() => {
  document.removeEventListener("voice:open-chat-mode", onOpenChatMode);
  document.removeEventListener("voice:open-task-creator", onOpenTaskCreator);
  document.removeEventListener("voice:close", onClose);
});
</script>

<template>
  <!-- Voice island root — overlays are teleported to <body> to escape
       .chat-panel's backdrop-filter stacking context. -->
  <Teleport to="body">
    <VoiceModeOverlay v-if="voice.mode === 'chat'" />
    <VoiceTaskCreator v-if="voice.mode === 'task-creator'" />
  </Teleport>
</template>
