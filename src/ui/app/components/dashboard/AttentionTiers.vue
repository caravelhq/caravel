<script setup lang="ts">
import { computed } from "vue";
import { useAttentionStore, type AttentionTier } from "../../stores/attention";
import TierSection from "./TierSection.vue";

const attention = useAttentionStore();

// Merge unclassified + failed into a single "Triage" tier (DEC-0007 / DEC-0039)
const triageTier = computed<AttentionTier>(() => {
  const t = attention.tiers;
  if (!t) return { count: 0, rows: [] };
  return {
    count: t.unclassified.count + t.failed.count,
    rows: [...t.unclassified.rows, ...t.failed.rows].slice(0, 8),
  };
});

const blockedTier = computed<AttentionTier>(() => attention.tiers?.blocked ?? { count: 0, rows: [] });
const pausedTier = computed<AttentionTier>(() => attention.tiers?.paused ?? { count: 0, rows: [] });
const reportsTier = computed<AttentionTier>(() => attention.tiers?.reports ?? { count: 0, rows: [] });

</script>

<template>
  <div id="dashboard-attention-tiers" class="db-tiers" aria-label="Attention tiers">
    <TierSection section-key="triage" title="Triage" :tier="triageTier" />
    <TierSection section-key="blocked" title="Blocked" :tier="blockedTier" />
    <TierSection section-key="paused" title="Paused" :tier="pausedTier" />
    <!-- Multi-select is deliberately NOT wired here (WAL-137 / Kelly 2026-10-22):
         selecting rows on the Dashboard has no action surface to act on, so the
         checkboxes were affordance without a verb. TierSection still carries the
         selectable/selected/toggle-row/toggle-all contract, and BulkBar.vue is
         retained unused, so the task picker can adopt both once it has real
         action buttons. -->
    <TierSection
      section-key="reports"
      title="Reports"
      :tier="reportsTier"
      :row-limit="3"
      :open-all-link="true"
      :report-intent="true"
    />
  </div>
</template>
