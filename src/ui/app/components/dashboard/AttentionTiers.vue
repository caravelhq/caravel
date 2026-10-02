<script setup lang="ts">
import { computed } from "vue";
import { useAttentionStore, type AttentionTier } from "../../stores/attention";
import TierSection from "./TierSection.vue";

const attention = useAttentionStore();

// Merge unclassified + failed into a single "Triage" tier (DEC-0007 / brief)
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
    <TierSection
      section-key="triage"
      title="Triage"
      :tier="triageTier"
    />
    <TierSection
      section-key="blocked"
      title="Blocked"
      :tier="blockedTier"
    />
    <TierSection
      section-key="paused"
      title="Paused"
      :tier="pausedTier"
    />
    <TierSection
      section-key="reports"
      title="Reports"
      :tier="reportsTier"
      :row-limit="3"
      :open-all-link="true"
    />
  </div>
</template>
