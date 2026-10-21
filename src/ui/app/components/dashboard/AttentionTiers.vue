<script setup lang="ts">
import { computed, reactive } from "vue";
import { useAttentionStore, type AttentionTier } from "../../stores/attention";
import TierSection from "./TierSection.vue";
import BulkBar from "./BulkBar.vue";

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

interface BulkEntry { agent: string; defaultStatus: string }
const bulkSelected = reactive<Record<string, BulkEntry>>({});

function onToggleRow(id: string, agent: string, defaultStatus: string, checked: boolean): void {
  if (checked) bulkSelected[id] = { agent, defaultStatus };
  else delete bulkSelected[id];
}

function onToggleAll(checked: boolean): void {
  for (const row of reportsTier.value.rows) {
    if (checked) bulkSelected[row.id] = { agent: row.agent ?? "", defaultStatus: "closed" };
    else delete bulkSelected[row.id];
  }
}

function clearBulk(): void {
  for (const key of Object.keys(bulkSelected)) delete bulkSelected[key];
}

function onClosed(): void {
  clearBulk();
  attention.fetch();
}
</script>

<template>
  <div id="dashboard-attention-tiers" class="db-tiers" aria-label="Attention tiers">
    <BulkBar :selected="bulkSelected" @clear="clearBulk" @closed="onClosed" />
    <TierSection section-key="triage" title="Triage" :tier="triageTier" />
    <TierSection section-key="blocked" title="Blocked" :tier="blockedTier" />
    <TierSection section-key="paused" title="Paused" :tier="pausedTier" />
    <TierSection
      section-key="reports"
      title="Reports"
      :tier="reportsTier"
      :row-limit="3"
      :open-all-link="true"
      :selectable="true"
      :selected="bulkSelected"
      row-default-status="closed"
      :report-intent="true"
      @toggle-row="onToggleRow"
      @toggle-all="onToggleAll"
    />
  </div>
</template>
