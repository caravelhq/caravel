<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import GlobalMic from "./GlobalMic.vue";
import GlobalSpeaker from "./GlobalSpeaker.vue";
import { useLiveStore } from "../../stores/live";

interface Pill { cls: string; icon: string; label: string; value: string }

const live = useLiveStore();

const STATE_SPEC = {
  topics: ["state"],
  fetch: () => fetch("/api/state", { cache: "no-store" }).then((r) => r.json()),
};

// Bind/unbind alongside mount lifecycle
onMounted(() => live.bind("state", STATE_SPEC));
onBeforeUnmount(() => live.unbind("state"));

const stateEntry = computed(() => live.entry("state"));
const stateData = computed(() => stateEntry.value?.data as Record<string, unknown> | null ?? null);
const isOffline = computed(() => stateEntry.value?.status === "error");

// Uptime computed client-side from startedAt (no polling needed)
let uptimeTick: ReturnType<typeof setInterval> | null = null;
const now = ref(Date.now());

onMounted(() => {
  uptimeTick = setInterval(() => { now.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => {
  if (uptimeTick) clearInterval(uptimeTick);
});

function fmtDur(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "n/a";
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

const jobsCount = computed(() => {
  if (isOffline.value) return "-";
  const d = stateData.value;
  return String((d?.jobs as unknown[])?.length ?? 0);
});

const tasksCount = computed(() => {
  if (isOffline.value) return "-";
  const d = stateData.value;
  return String((d as any)?.tasksActive ?? 0);
});

const uptime = computed(() => {
  if (isOffline.value) return "-";
  const d = stateData.value;
  const startedAt = (d as any)?.daemon?.startedAt as number | undefined;
  if (!startedAt) return "-";
  return fmtDur(now.value - startedAt);
});

const pills = computed((): Pill[] => {
  if (isOffline.value) {
    return [{ cls: "bad", icon: "⚠️", label: "Status", value: "Offline" }];
  }
  const d = stateData.value as any;
  if (!d) return [];
  const out: Pill[] = [];
  if (d.telegram?.configured) {
    const n = d.telegram.allowedUserCount;
    out.push({ cls: "ok", icon: "✈️", label: "Telegram", value: `${n} user${n !== 1 ? "s" : ""}` });
  }
  if (d.discord?.configured) {
    const n = d.discord.allowedUserCount;
    out.push({ cls: "ok", icon: "🎮", label: "Discord", value: `${n} user${n !== 1 ? "s" : ""}` });
  }
  return out;
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
