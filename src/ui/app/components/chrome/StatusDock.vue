<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import GlobalMic from "./GlobalMic.vue";
import GlobalSpeaker from "./GlobalSpeaker.vue";

interface Pill { cls: string; icon: string; label: string; value: string }
interface StateResponse {
  telegram?: { configured: boolean; allowedUserCount: number };
  discord?: { configured: boolean; allowedUserCount: number };
  jobs?: unknown[];
  tasksActive?: number;
  daemon?: { uptimeMs: number };
}

const pills = ref<Pill[]>([]);
const jobsCount = ref("-");
const tasksCount = ref("-");
const uptime = ref("-");

// Self-scheduling status poll — not a fixed setInterval so we can poll faster
// while offline and recover instantly when the tab becomes visible again.
// Mobile freezes timers while the screen is off; the visibility/online/pageshow
// kick below fixes the stuck-on-"Offline" problem after unlock.
const STATE_POLL_OK_MS = 1000;
const STATE_POLL_OFFLINE_MS = 400;
let stateOnline = true;
let statePollTimer: ReturnType<typeof setTimeout> | null = null;

function fmtDur(ms: number | null | undefined): string {
  if (ms == null) return "n/a";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  if (d > 0) {
    const h = Math.floor((s % 86400) / 3600);
    return `${d}d ${h}h`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

function buildPills(state: StateResponse): Pill[] {
  const out: Pill[] = [];
  if (state.telegram?.configured) {
    const n = state.telegram.allowedUserCount;
    out.push({ cls: "ok", icon: "✈️", label: "Telegram", value: `${n} user${n !== 1 ? "s" : ""}` });
  }
  if (state.discord?.configured) {
    const n = state.discord.allowedUserCount;
    out.push({ cls: "ok", icon: "🎮", label: "Discord", value: `${n} user${n !== 1 ? "s" : ""}` });
  }
  return out;
}

async function refreshState(): Promise<void> {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const state: StateResponse = await res.json();
    stateOnline = true;
    pills.value = buildPills(state);
    jobsCount.value = String(state.jobs?.length ?? 0);
    tasksCount.value = String(state.tasksActive ?? 0);
    uptime.value = fmtDur(state.daemon?.uptimeMs);
  } catch {
    stateOnline = false;
    pills.value = [{ cls: "bad", icon: "⚠️", label: "Status", value: "Offline" }];
    jobsCount.value = "-";
    tasksCount.value = "-";
  }
}

function scheduleStatePoll(delay: number): void {
  if (statePollTimer) clearTimeout(statePollTimer);
  statePollTimer = setTimeout(runStatePoll, delay);
}

async function runStatePoll(): Promise<void> {
  await refreshState();
  scheduleStatePoll(stateOnline ? STATE_POLL_OK_MS : STATE_POLL_OFFLINE_MS);
}

function kickStatePoll(): void {
  scheduleStatePoll(0);
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") kickStatePoll();
}

onMounted(() => {
  runStatePoll();
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("online", kickStatePoll);
  window.addEventListener("focus", kickStatePoll);
  window.addEventListener("pageshow", kickStatePoll);
});

onBeforeUnmount(() => {
  if (statePollTimer) clearTimeout(statePollTimer);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("online", kickStatePoll);
  window.removeEventListener("focus", kickStatePoll);
  window.removeEventListener("pageshow", kickStatePoll);
});
</script>

<template>
  <div class="dock-shell">
    <aside class="side-bubble" id="jobs-bubble" aria-live="polite">
      <div class="side-icon">🗂️</div>
      <div class="side-value">{{ jobsCount }}</div>
      <div class="side-label">Jobs</div>
    </aside>
    <aside class="side-bubble" id="tasks-bubble" aria-live="polite">
      <div class="side-icon">📋</div>
      <div class="side-value">{{ tasksCount }}</div>
      <div class="side-label">Tasks</div>
    </aside>
    <footer class="dock" id="dock" aria-live="polite">
      <GlobalSpeaker />
      <div class="dock-spacer"></div>
      <GlobalMic />
      <div id="dock-pills">
        <div
          v-for="pill in pills"
          :key="pill.label"
          class="pill"
          :class="pill.cls"
        >
          <div class="pill-label">
            <span class="pill-icon">{{ pill.icon }}</span>{{ pill.label }}
          </div>
          <div class="pill-value">{{ pill.value }}</div>
        </div>
      </div>
    </footer>
    <aside class="side-bubble" id="uptime-bubble" aria-live="polite">
      <div class="side-icon">⏱️</div>
      <div class="side-value">{{ uptime }}</div>
      <div class="side-label">Uptime</div>
    </aside>
  </div>
</template>
