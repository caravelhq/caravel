<script setup lang="ts">
import { useUiStore } from "../../stores/ui";
import BaseModal from "../modal/BaseModal.vue";

const ui = useUiStore();
</script>

<template>
  <BaseModal
    id="audio-action-modal"
    :open="ui.audioModalOpen"
    @close="ui.audioModalOpen = false"
    size="sm"
    :dismissible="false"
  >
    <div class="audio-action-card" id="audio-action-card">
      <div class="audio-action-icon" id="audio-action-icon"></div>
      <div class="audio-action-label" id="audio-action-label">Recording...</div>
      <div class="audio-player-resume" id="audio-player-resume" hidden>
        <div class="audio-player-resume-msg" id="audio-player-resume-msg"></div>
        <div class="audio-player-resume-btns">
          <button class="audio-player-resume-btn is-restart" id="audio-resume-restart" type="button">Start over</button>
          <button class="audio-player-resume-btn is-resume" id="audio-resume-continue" type="button">Resume</button>
        </div>
      </div>
      <div class="audio-player-progress" id="audio-player-progress" hidden>
        <div class="audio-player-bar-wrap"><div class="audio-player-bar" id="audio-player-bar"></div></div>
        <div class="audio-player-counter" id="audio-player-counter">0 / 0</div>
      </div>
      <div class="audio-player-transcript" id="audio-player-transcript" hidden></div>
      <div class="audio-player-controls">
        <button class="audio-player-skip" id="audio-skip-back" type="button" aria-label="Previous" hidden>
          <i class="fa-solid fa-backward-step"></i>
        </button>
        <button class="audio-action-stop" id="audio-action-stop" type="button" aria-label="Stop">
          <i class="fa-solid fa-stop"></i><span>Stop</span>
        </button>
        <button class="audio-player-skip" id="audio-skip-forward" type="button" aria-label="Next" hidden>
          <i class="fa-solid fa-forward-step"></i>
        </button>
      </div>
    </div>
  </BaseModal>
</template>
