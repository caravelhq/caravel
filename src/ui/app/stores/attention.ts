import { defineStore } from "pinia";
import { ref } from "vue";

export interface AttentionTierRow {
  id: string;
  agent?: string;
  headline?: string;
  label?: string;
}

export interface AttentionTier {
  count: number;
  rows: AttentionTierRow[];
}

export interface AttentionTiers {
  unclassified: AttentionTier;
  failed: AttentionTier;
  blocked: AttentionTier;
  paused: AttentionTier;
  reports: AttentionTier;
}

export const useAttentionStore = defineStore("attention", () => {
  const tiers = ref<AttentionTiers | null>(null);
  const lastFetch = ref<number>(0);

  async function fetch() {
    try {
      const res = await window.fetch("/api/tasks/attention");
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && data.tiers) {
        tiers.value = data.tiers as AttentionTiers;
        lastFetch.value = Date.now();
      }
    } catch (_) {}
  }

  return { tiers, lastFetch, fetch };
});
