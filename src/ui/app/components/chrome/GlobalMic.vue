<script setup lang="ts">
import { useUiStore } from "../../stores/ui";
import { useDictation } from "../voice/useDictation";

const ui = useUiStore();
useDictation();

function triggerMic() {
  document.dispatchEvent(new CustomEvent("voice:dictate"));
}
</script>

<template>
  <button
    id="global-mic"
    class="global-mic"
    type="button"
    title="Dictate into focused field"
    aria-label="Dictate"
    :disabled="!ui.micEnabled"
    @click="triggerMic"
  >
    <i class="fa-solid fa-microphone"></i>
  </button>
</template>
