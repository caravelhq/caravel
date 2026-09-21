<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useUiStore } from "../../stores/ui";

const ui = useUiStore();

// — Clock —
const use12Hour = ref(localStorage.getItem("clock.format") === "12");
const clockText = computed(() => use12Hour.value ? "12h" : "24h");
const clockInfo = computed(() => use12Hour.value ? "12-hour format" : "24-hour format");

// — Header —
const headerHidden = ref(localStorage.getItem("header.hidden") === "1");

// — Debug —
const debugEnabled = ref(localStorage.getItem("debug.enabled") === "1");

// — Heartbeat —
const hbEnabled = ref(false);
const hbInterval = ref(15);
const hbInfo = ref("syncing...");
const hbBusy = ref(false);
const hbToggleText = computed(() => hbEnabled.value ? "Enabled" : "Disabled");
const hbToggleClass = computed(() => "hb-toggle " + (hbEnabled.value ? "on" : "off"));

// — Voice STT —
const sttEnabled = ref(false);
const sttText = computed(() => sttEnabled.value ? "DeepGram" : "Whisper");
const sttMeta = computed(() => sttEnabled.value ? "DeepGram STT" : "Whisper (local)");

// — Technical Info —

const infoHtml = ref("");

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTechInfo(data: Record<string, unknown>): string {
  const files = (data?.files ?? {}) as Record<string, unknown>;
  const sections = [
    { title: "daemon", value: data?.daemon ?? null },
    { title: "settings.json", value: files.settingsJson ?? null },
    { title: "session.json", value: files.sessionJson ?? null },
    { title: "state.json", value: files.stateJson ?? null },
  ];
  return sections.map(s =>
    `<div class="info-section"><div class="info-title">${escHtml(s.title)}</div><pre class="info-json">${escHtml(JSON.stringify(s.value, null, 2))}</pre></div>`
  ).join("");
}

async function loadSettings(): Promise<void> {
  hbInfo.value = "syncing...";
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    hbEnabled.value = Boolean(data?.heartbeat?.enabled);
    hbInterval.value = Number(data?.heartbeat?.interval) || 15;
    hbInfo.value = hbEnabled.value
      ? `every ${hbInterval.value} minutes`
      : `paused (interval ${hbInterval.value}m)`;
  } catch {
    hbInfo.value = "unavailable";
  }
}

async function loadVoiceSettings(): Promise<void> {
  try {
    const res = await fetch("/api/settings/voice");
    const data = await res.json();
    if (!data.ok) return;
    const v = data.voice ?? {};
    const hasApiKey = Boolean(v.hasApiKey);
    sttEnabled.value = Boolean(v.sttEnabled && hasApiKey);
  } catch (_) {}
}

watch(() => ui.settingsOpen, (open) => {
  if (open) {
    loadSettings();
    loadVoiceSettings();
  }
});

function toggleClock(): void {
  use12Hour.value = !use12Hour.value;
  localStorage.setItem("clock.format", use12Hour.value ? "12" : "24");
}

function toggleHeader(): void {
  headerHidden.value = !headerHidden.value;
  localStorage.setItem("header.hidden", headerHidden.value ? "1" : "0");
  document.body.classList.toggle("hide-header", headerHidden.value);
}

function toggleDebug(): void {
  debugEnabled.value = !debugEnabled.value;
  localStorage.setItem("debug.enabled", debugEnabled.value ? "1" : "0");
}

async function toggleHb(): Promise<void> {
  if (hbBusy.value) return;
  hbBusy.value = true;
  const next = !hbEnabled.value;
  hbEnabled.value = next;
  hbInfo.value = next
    ? `every ${hbInterval.value} minutes`
    : `paused (interval ${hbInterval.value}m)`;
  try {
    const res = await fetch("/api/settings/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "save failed");
    if (out.heartbeat) {
      hbEnabled.value = Boolean(out.heartbeat.enabled);
      hbInterval.value = Number(out.heartbeat.interval) || hbInterval.value;
      hbInfo.value = hbEnabled.value
        ? `every ${hbInterval.value} minutes`
        : `paused (interval ${hbInterval.value}m)`;
    }
  } catch {
    hbEnabled.value = !next;
    hbInfo.value = hbEnabled.value
      ? `every ${hbInterval.value} minutes`
      : `paused (interval ${hbInterval.value}m)`;
  } finally {
    hbBusy.value = false;
  }
}

function openHbConfig(): void {
  ui.hbModalOpen = true;
}

async function toggleStt(): Promise<void> {
  sttEnabled.value = !sttEnabled.value;
  try {
    await fetch("/api/settings/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sttEnabled: sttEnabled.value }),
    });
  } catch (_) {}
}

async function openInfo(): Promise<void> {
  ui.infoOpen = true;
  infoHtml.value = '<div class="info-section"><div class="info-title">Loading</div><pre class="info-json">Loading technical data...</pre></div>';
  try {
    const res = await fetch("/api/technical-info");
    const data = await res.json();
    infoHtml.value = renderTechInfo(data);
  } catch (err) {
    infoHtml.value = `<div class="info-section"><div class="info-title">Error</div><pre class="info-json">${escHtml(String(err))}</pre></div>`;
  }
}
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
          <div class="settings-meta" id="hb-info">{{ hbInfo }}</div>
        </div>
        <div class="setting-actions">
          <button class="hb-config" id="hb-config" type="button" @click="openHbConfig">Configure</button>
          <button :class="hbToggleClass" id="hb-toggle" type="button" :disabled="hbBusy" @click="toggleHb">{{ hbToggleText }}</button>
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🕒 Clock</div>
          <div class="settings-meta" id="clock-info">{{ clockInfo }}</div>
        </div>
        <button :class="'hb-toggle ' + (use12Hour ? 'on' : 'off')" id="clock-toggle" type="button" @click="toggleClock">{{ clockText }}</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🔗 GitHub Banner</div>
          <div class="settings-meta">Star on GitHub header bar</div>
        </div>
        <button :class="'hb-toggle ' + (headerHidden ? 'off' : 'on')" id="header-toggle" type="button" @click="toggleHeader">{{ headerHidden ? 'Off' : 'On' }}</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🐞 Debug</div>
          <div class="settings-meta">Show chat thread/session ids</div>
        </div>
        <button :class="'hb-toggle ' + (debugEnabled ? 'on' : 'off')" id="debug-toggle" type="button" @click="toggleDebug">{{ debugEnabled ? 'On' : 'Off' }}</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🎙️ Voice — STT</div>
          <div class="settings-meta" id="voice-stt-meta">{{ sttMeta }}</div>
        </div>
        <button :class="'hb-toggle ' + (sttEnabled ? 'on' : 'off')" id="voice-stt-toggle" type="button" @click="toggleStt">{{ sttText }}</button>
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
        <button class="hb-toggle on" id="info-open" type="button" @click="openInfo">Info</button>
      </div>
    </div>
  </aside>

  <!-- Technical info overlay — sibling to the aside at app-root level (z-index 7 > settings z-index 6) -->
  <section class="info-modal" id="info-modal" :class="{ open: ui.infoOpen }" :aria-hidden="!ui.infoOpen" @click.self="ui.infoOpen = false">
    <article class="info-card">
      <div class="info-head">
        <span>Technical Info</span>
        <button class="settings-close" id="info-close" type="button" aria-label="Close technical info" @click="ui.infoOpen = false">×</button>
      </div>
      <div id="info-body" class="info-body" v-html="infoHtml"></div>
    </article>
  </section>
</template>
