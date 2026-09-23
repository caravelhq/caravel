<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useAttentionStore } from "../stores/attention";
import { useLiveStore } from "../stores/live";
import { useResource } from "../composables/useResource";
import DashboardHero from "../components/dashboard/DashboardHero.vue";
import AttentionTiers from "../components/dashboard/AttentionTiers.vue";
import TotalsLine from "../components/dashboard/TotalsLine.vue";
import ScheduleList from "../components/dashboard/ScheduleList.vue";
import type { ScheduleTemplate } from "../components/dashboard/ScheduleRow.vue";

const attentionStore = useAttentionStore();
const live = useLiveStore();

// ── Attention tiers ────────────────────────────────────────────────────────
// Shared live key with TasksPage — first bind sets the spec; subsequent
// binds increment refs. Both views read from attentionStore.tiers.
useResource("attention", {
  topics: ["attention", "tasks"],
  fetch: () => attentionStore.fetch().then(() => attentionStore.tiers),
});

// ── Schedules ─────────────────────────────────────────────────────────────
// Using a local ref updated inside fetch to work around reactive-Map mutation
// tracking — doFetch mutates entry.data through the raw ref, not the proxy.
const templates = ref<ScheduleTemplate[]>([]);
const schedulesLoading = ref(true);

async function fetchSchedules(): Promise<void> {
  try {
    const r = await fetch("/api/tasks/scheduled");
    const d = await r.json();
    templates.value = d.ok ? (d.templates ?? []) : [];
  } catch {
    templates.value = [];
  } finally {
    schedulesLoading.value = false;
  }
}

useResource("schedules", {
  topics: ["tasks"],
  fetch: async () => {
    await fetchSchedules();
    return templates.value;
  },
});

// ── Summary / totals ──────────────────────────────────────────────────────
interface Totals { open?: number; waiting?: number; done?: number; failed?: number }
const totals = ref<Totals | null>(null);

useResource("summary", {
  topics: ["tasks"],
  fetch: async () => {
    try {
      const r = await fetch("/api/multi-agent/summary");
      const d = await r.json();
      totals.value = d.ok ? (d.summary?.totals ?? null) : null;
      return totals.value;
    } catch {
      return null;
    }
  },
});

// ── Prefetch top report rows (DEC-0021) ────────────────────────────────────
watch(() => attentionStore.tiers, (tiers) => {
  if (!tiers?.reports?.rows) return;
  for (const row of tiers.reports.rows.slice(0, 3)) {
    if (!row.id) continue;
    live.prefetch("report:" + row.id, {
      topics: ["tasks"],
      fetch: async () => {
        try {
          const r = await fetch("/api/tasks/" + encodeURIComponent(row.id));
          return r.ok ? r.json() : null;
        } catch { return null; }
      },
    });
  }
}, { once: true });

// Refresh schedules after a mutating action (pause/resume/delete)
function onSchedulesRefresh(): void {
  schedulesLoading.value = true;
  fetchSchedules();
}
</script>

<template>
  <div id="dashboard-panel">
    <DashboardHero />
    <TotalsLine :totals="totals" />
    <AttentionTiers />
    <ScheduleList
      :templates="templates"
      :loading="schedulesLoading"
      @refresh="onSchedulesRefresh"
    />
  </div>
</template>
