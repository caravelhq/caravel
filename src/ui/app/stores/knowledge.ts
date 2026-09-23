import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface KnowledgeDoc {
  id?: string;
  path?: string;
  title?: string;
  doc_type?: string;
  status?: string;
  project?: string;
  snippet?: string;
  why?: string;
  date?: string;
  score?: number;
  [key: string]: unknown;
}

export interface KnowledgeResult {
  ok: boolean;
  docs?: KnowledgeDoc[];
  reports?: KnowledgeDoc[];
  tookMs?: number;
  builtAt?: string;
  reason?: string;
}

const RECENT_QUERIES_KEY = "knowledge.recentQueries";
const MAX_RECENT = 10;

function loadRecentQueries(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_QUERIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
  } catch { return []; }
}

function saveRecentQueries(queries: string[]): void {
  try { localStorage.setItem(RECENT_QUERIES_KEY, JSON.stringify(queries)); } catch {}
}

export const useKnowledgeStore = defineStore("knowledge", () => {
  const recentQueries = ref<string[]>(loadRecentQueries());
  const currentResult = ref<KnowledgeResult | null>(null);
  const currentQuery = ref("");
  const isOpen = ref(false);
  const seedQuery = ref("");
  // isStale: set true by SearchModal when `knowledge` topic fires without builtAt,
  // cleared when the modal detects a rebuild completion (builtAt present in hint).
  const isStale = ref(false);

  const hasResult = computed(() => !!currentResult.value?.ok);

  function pushQuery(q: string): void {
    const trimmed = q.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...recentQueries.value.filter((r) => r !== trimmed)].slice(0, MAX_RECENT);
    recentQueries.value = updated;
    saveRecentQueries(updated);
  }

  function setResult(q: string, result: KnowledgeResult): void {
    currentQuery.value = q;
    currentResult.value = result;
    isStale.value = false;
    if (result.ok) pushQuery(q);
  }

  function markStale(): void {
    if (currentResult.value) isStale.value = true;
  }

  function markFresh(): void {
    isStale.value = false;
  }

  function open(seed = ""): void {
    seedQuery.value = seed;
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
    seedQuery.value = "";
  }

  function clear(): void {
    currentResult.value = null;
    currentQuery.value = "";
    isStale.value = false;
  }

  return { recentQueries, currentResult, currentQuery, isOpen, seedQuery, isStale, hasResult, setResult, markStale, markFresh, clear, pushQuery, open, close };
});
