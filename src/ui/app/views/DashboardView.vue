<script setup lang="ts">
import { computed } from "vue";
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

// ── Attention tiers — shared key with TasksPage ───────────────────────────
// Both this view and TasksPage bind "attention" with the same spec.
// The live store deduplicates: first bind sets the spec; later binds just
// increment refs. Both read from attentionStore.tiers.
useResource("attention", {
  topics: ["attention", "tasks"],
  fetch: () => attentionStore.fetch().then(() => attentionStore.tiers),
});

// ── Schedules ─────────────────────────────────────────────────────────────
const { entry: schedEntry } = useResource("schedules", {
  topics: ["tasks"],
  fetch: async () => {
    const r = await fetch("/api/tasks/scheduled");
    const d = await r.json();
    return d.ok ? (d.templates ?? []) : [];
  },
});

const templates = computed<ScheduleTemplate[]>(() => {
  const data = schedEntry.value?.data;
  return Array.isArray(data) ? (data as ScheduleTemplate[]) : [];
});

const schedulesLoading = computed(() =>
  !schedEntry.value || schedEntry.value.status === "idle" || schedEntry.value.status === "loading"
);

// ── Summary / totals ──────────────────────────────────────────────────────
const { entry: summaryEntry } = useResource("summary", {
  topics: ["tasks"],
  fetch: async () => {
    const r = await fetch("/api/multi-agent/summary");
    const d = await r.json();
    return d.ok ? d.summary : null;
  },
});

const totals = computed(() => {
  const s = summaryEntry.value?.data as { totals?: Record<string, number> } | null;
  return s?.totals ?? null;
});

// Prefetch top reports for instant first-render of Reports tier rows (DEC-0021)
function prefetchTopReports(): void {
  const tiers = attentionStore.tiers;
  if (!tiers?.reports?.rows) return;
  for (const row of tiers.reports.rows.slice(0, 3)) {
    if (row.id) {
      live.prefetch("report:" + row.id, {
        topics: ["tasks"],
        fetch: async () => {
          const r = await fetch("/api/tasks/" + encodeURIComponent(row.id));
          return r.ok ? r.json() : null;
        },
      });
    }
  }
}

// Prefetch on attention data ready
import { watch } from "vue";
watch(() => attentionStore.tiers, (tiers) => {
  if (tiers) prefetchTopReports();
}, { once: true });

// Refresh schedules (called after pause/resume/delete)
function onSchedulesRefresh(): void {
  live.bind("schedules", {
    topics: ["tasks"],
    fetch: async () => {
      const r = await fetch("/api/tasks/scheduled");
      const d = await r.json();
      return d.ok ? (d.templates ?? []) : [];
    },
  });
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
