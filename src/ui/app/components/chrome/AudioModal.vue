<script setup lang="ts">
import { computed } from "vue";
import { useUiStore } from "../../stores/ui";
import BaseModal from "../modal/BaseModal.vue";

const ui = useUiStore();

const total = computed(() => ui.raChunks.length);
const current = computed(() => ui.raChunkIndex);
const progressPct = computed(() =>
  total.value > 0 ? ((current.value + 1) / total.value) * 100 : 0
);
const skipBackDisabled = computed(() => current.value <= 0);
const skipFwdDisabled = computed(() => current.value >= total.value - 1);
const hasPlayer = computed(() => !ui.raShowResume && total.value > 0);
</script>

<template>
  <BaseModal
    :open="ui.audioModalOpen"
    @close="ui.raStop()"
    size="sm"
    :dismissible="false"
  >
    <template #header>
      <div class="base-modal-head">
        <span class="base-modal-title">Reading aloud</span>
      </div>
    </template>

    <div class="audio-action-card">
      <!-- Resume prompt — shown when returning to mid-read content -->
      <div v-if="ui.raShowResume" class="audio-player-resume">
        <div class="audio-player-resume-msg">
          Resume from chunk {{ ui.raResumeIndex + 1 }} of {{ total }}?
        </div>
        <div class="audio-player-resume-btns">
          <button
            class="audio-player-resume-btn is-restart"
            type="button"
            @click="ui.raResumeFrom(0)"
          >Start over</button>
          <button
            class="audio-player-resume-btn is-resume"
            type="button"
            @click="ui.raResumeFrom(ui.raResumeIndex)"
          >Resume</button>
        </div>
      </div>

      <!-- Player — shown during active playback -->
      <template v-if="hasPlayer">
        <div class="audio-player-progress">
          <div class="audio-player-bar-wrap">
            <div class="audio-player-bar" :style="{ width: progressPct + '%' }"></div>
          </div>
          <div class="audio-player-counter">{{ current + 1 }} / {{ total }}</div>
        </div>

        <div class="audio-player-transcript">
          <p
            v-for="(chunk, i) in ui.raChunks"
            :key="i"
            class="audio-transcript-line"
            :class="{ 'audio-transcript-active': i === current }"
            :data-idx="i"
            @click="ui.raSkipTo(i)"
          >{{ chunk }}</p>
        </div>
      </template>

      <div class="audio-player-controls">
        <button
          v-if="hasPlayer"
          class="audio-player-skip"
          type="button"
          aria-label="Previous"
          :disabled="skipBackDisabled"
          @click="ui.raSkipTo(current - 1)"
        >
          <i class="fa-solid fa-backward-step"></i>
        </button>
        <button
          class="audio-action-stop"
          type="button"
          aria-label="Stop"
          @click="ui.raStop()"
        >
          <i class="fa-solid fa-stop"></i><span>Stop</span>
        </button>
        <button
          v-if="hasPlayer"
          class="audio-player-skip"
          type="button"
          aria-label="Next"
          :disabled="skipFwdDisabled"
          @click="ui.raSkipTo(current + 1)"
        >
          <i class="fa-solid fa-forward-step"></i>
        </button>
      </div>
    </div>
  </BaseModal>
</template>
