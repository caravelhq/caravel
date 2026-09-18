<script setup lang="ts">
import { useUiStore } from "../../stores/ui";

const ui = useUiStore();
</script>

<template>
  <aside class="settings-modal" id="settings-modal" aria-live="polite" :class="{ open: ui.settingsOpen }">
    <div class="settings-head">
      <span>Settings</span>
      <button class="settings-close" id="settings-close" type="button" aria-label="Close settings" @click="ui.settingsOpen = false">×</button>
    </div>
    <div class="settings-stack">
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">💓 Heartbeat</div>
          <div class="settings-meta" id="hb-info">syncing...</div>
        </div>
        <div class="setting-actions">
          <button class="hb-config" id="hb-config" type="button">Configure</button>
          <button class="hb-toggle" id="hb-toggle" type="button">Loading...</button>
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🕒 Clock</div>
          <div class="settings-meta" id="clock-info">24-hour format</div>
        </div>
        <button class="hb-toggle" id="clock-toggle" type="button">24h</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🔗 GitHub Banner</div>
          <div class="settings-meta">Star on GitHub header bar</div>
        </div>
        <button class="hb-toggle" id="header-toggle" type="button">On</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🐞 Debug</div>
          <div class="settings-meta">Show chat thread/session ids</div>
        </div>
        <button class="hb-toggle off" id="debug-toggle" type="button">Off</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🎙️ Voice — STT</div>
          <div class="settings-meta" id="voice-stt-meta">Whisper (local)</div>
        </div>
        <button class="hb-toggle off" id="voice-stt-toggle" type="button">Whisper</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🎙️ Mic (STT)</div>
          <div class="settings-meta">Dictate and voice chat</div>
        </div>
        <button
          class="hb-toggle"
          :class="ui.micEnabled ? 'on' : 'off'"
          id="voice-mic-toggle"
          type="button"
          @click="ui.micEnabled = !ui.micEnabled"
        >{{ ui.micEnabled ? 'On' : 'Off' }}</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🔊 Speaker (TTS)</div>
          <div class="settings-meta">Read aloud and voice replies</div>
          <div class="settings-error-note" id="tts-error-note" hidden>DeepGram not configured</div>
        </div>
        <button
          class="hb-toggle"
          :class="ui.ttsEnabled ? 'on' : 'off'"
          id="voice-tts-toggle"
          type="button"
          @click="ui.ttsEnabled = !ui.ttsEnabled"
        >{{ ui.ttsEnabled ? 'On' : 'Off' }}</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🧾 Advanced</div>
          <div class="settings-meta">Technical runtime and JSON files</div>
        </div>
        <button class="hb-toggle on" id="info-open" type="button">Info</button>
      </div>
    </div>
  </aside>
</template>
