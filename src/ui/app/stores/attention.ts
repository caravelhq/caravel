import { defineStore } from "pinia";
import { ref } from "vue";

export interface AttentionTiers {
  reports: { count: number; rows: unknown[] };
  paused: { count: number; rows: unknown[] };
  failed: { count: number; rows: unknown[] };
  blocked: { count: number; rows: unknown[] };
  unclassified: { count: number; rows: unknown[] };
}

export const useAttentionStore = defineStore("attention", () => {
  const tiers = ref<AttentionTiers | null>(null);
  return { tiers };
});
