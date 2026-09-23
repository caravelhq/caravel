<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useDashboardStore } from "../../stores/dashboard";

const dash = useDashboardStore();

const clockTime = ref("--:--:--");
const clockDate = ref("Loading date...");
const greeting = ref("Welcome back.");
const clockEl = ref<HTMLElement | null>(null);

let tzOffsetMinutes = 0;
let clockInterval: ReturnType<typeof setInterval> | null = null;

function clampTzOffset(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-720, Math.min(840, Math.round(n))) : 0;
}

function toOffsetDate(base: Date): Date {
  return new Date(base.getTime() + tzOffsetMinutes * 60_000);
}

function formatOffsetDate(base: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: "UTC" }).format(toOffsetDate(base));
}

function greetingForHour(h: number): string {
  if (h < 5) return "Night mode.";
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  if (h < 22) return "Good evening.";
  return "Wind down and ship clean.";
}

function renderClock(): void {
  const now = new Date();
  const shifted = toOffsetDate(now);
  const rawH = shifted.getUTCHours();
  const use12 = dash.clockFormat === "12";
  const hh = use12 ? String((rawH % 12) || 12).padStart(2, "0") : String(rawH).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");
  const suffix = use12 ? (rawH >= 12 ? " PM" : " AM") : "";
  clockTime.value = hh + ":" + mm + ":" + ss + suffix;
  clockDate.value = formatOffsetDate(now, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  greeting.value = greetingForHour(rawH);

  const night = rawH < 5 || rawH >= 22;
  document.body.classList.toggle("night-mode", night);
  document.body.classList.toggle("day-mode", !night);
  document.body.dataset.mode = night ? "night" : "day";

  // Pulse animation
  nextTick(() => {
    if (clockEl.value) {
      clockEl.value.classList.remove("ms-pulse");
      requestAnimationFrame(() => clockEl.value?.classList.add("ms-pulse"));
    }
  });
}

async function loadTzSettings(): Promise<void> {
  try {
    const r = await fetch("/api/settings");
    const d = await r.json();
    tzOffsetMinutes = clampTzOffset(d?.timezoneOffsetMinutes);
    renderClock();
  } catch { /* default 0 */ }
}

onMounted(() => {
  renderClock();
  clockInterval = setInterval(renderClock, 1000);
  loadTzSettings();
});

onBeforeUnmount(() => {
  if (clockInterval) clearInterval(clockInterval);
});
</script>

<template>
  <section class="hero">
    <div class="logo-art" role="img" aria-label="Caravel ship logo">
      <svg class="logo-ship" viewBox="0 0 120 96" width="120" height="96" fill="none" aria-hidden="true">
        <path d="M34 70 V30 M58 70 V14 M84 60 V28" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.55" />
        <path d="M12 59 L52 24 M28 45 L80 6 M64 53 L102 22" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.5" />
        <path d="M66 52 L100 24 Q106 40 98 60 Q82 58 66 52 Z" fill="currentColor" opacity="0.6" />
        <path d="M30 44 L78 8 Q88 36 74 64 Q52 60 30 44 Z" fill="currentColor" opacity="0.92" />
        <path d="M14 58 L50 26 Q58 46 48 66 Q30 64 14 58 Z" fill="currentColor" opacity="0.74" />
        <path d="M58 14 h12 l-3.5 3 l3.5 3 h-12 Z" fill="currentColor" opacity="0.9" />
        <path d="M82 70 V60 H102 L100 70 Z" fill="currentColor" opacity="0.85" />
        <path d="M16 70 H104 L95 84 Q90 89 82 89 H38 Q30 89 25 84 Z" fill="currentColor" />
      </svg>
    </div>
    <div class="brand-name" aria-label="Caravel">Caravel</div>
    <div ref="clockEl" class="time">{{ clockTime }}</div>
    <div class="date">{{ clockDate }}</div>
    <div class="message">{{ greeting }}</div>
    <a
      class="repo-cta"
      href="https://github.com/caravelhq/caravel"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Star Caravel on GitHub"
    >
      <span class="repo-text">Like Caravel? Star it on GitHub</span>
      <span class="repo-star">★</span>
    </a>
  </section>
</template>
