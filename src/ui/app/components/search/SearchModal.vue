<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useKnowledgeStore, type KnowledgeDoc } from "../../stores/knowledge";
import { useWorkspaceStore } from "../../stores/workspace";
import { useResource } from "../../composables/useResource";
import BaseModal from "../modal/BaseModal.vue";

const ks = useKnowledgeStore();
const ws = useWorkspaceStore();

const inputRef = ref<HTMLInputElement | null>(null);
const mode = ref<"search" | "deep">("search");
const filterDocType = ref("");
const filterProject = ref("");
const filterSince = ref("");
const isLoading = ref(false);
let abortController: AbortController | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ── Staleness via knowledge topic ──────────────────────────────────────────
// Bind the knowledge:stats resource to the `knowledge` topic so we receive
// SSE events when the index changes. The fetch callback checks staleness.
useResource("knowledge:stats", {
  topics: ["knowledge"],
  fetch: async () => {
    const r = await fetch("/api/knowledge/stats");
    if (!r.ok) return null;
    const d = await r.json();
    // If a rebuild just completed, the hint has builtAt — clear stale flag
    ks.markFresh();
    return d;
  },
});

// ── Corpus size label (for placeholder) ──────────────────────────────────
const statsResult = ref<{ docs?: number; reports?: number } | null>(null);
const corpusLabel = computed(() => {
  const d = statsResult.value;
  if (!d) return "Search knowledge…";
  const parts: string[] = [];
  if (d.docs) parts.push(`${d.docs} docs`);
  if (d.reports) parts.push(`${d.reports} reports`);
  return parts.length ? `Search ${parts.join(" and ")}…` : "Search knowledge…";
});

// Fetch stats once on mount
fetch("/api/knowledge/stats")
  .then((r) => r.json())
  .then((d) => { if (d?.ok) statsResult.value = d; })
  .catch(() => {});

// ── Query ─────────────────────────────────────────────────────────────────
const draftQuery = ref("");

watch(() => ks.isOpen, (open) => {
  if (open) {
    draftQuery.value = ks.seedQuery;
    // Focus the input on next tick
    setTimeout(() => inputRef.value?.focus(), 50);
    if (ks.seedQuery) triggerSearch(ks.seedQuery);
  }
});

watch(draftQuery, (q) => {
  if (!ks.isOpen) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => triggerSearch(q), 250);
});

async function triggerSearch(q: string): Promise<void> {
  const trimmed = q.trim();
  if (!trimmed) return;

  if (abortController) abortController.abort();
  abortController = new AbortController();
  const signal = abortController.signal;

  isLoading.value = true;
  try {
    const endpoint = mode.value === "deep" ? "/api/knowledge/query" : "/api/knowledge/search";
    const params = new URLSearchParams({ q: trimmed });
    if (filterDocType.value) params.set("doc_type", filterDocType.value);
    if (filterProject.value) params.set("project", filterProject.value);
    if (filterSince.value) params.set("since", filterSince.value);
    params.set("limit", "20");

    const r = await fetch(`${endpoint}?${params}`, { signal });
    if (signal.aborted) return;
    const d = await r.json();
    if (signal.aborted) return;
    ks.setResult(trimmed, d);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
  } finally {
    if (!signal.aborted) isLoading.value = false;
  }
}

// ── Results ────────────────────────────────────────────────────────────────
const docs = computed(() => ks.currentResult?.docs ?? []);
const reports = computed(() => ks.currentResult?.reports ?? []);

// ── Open result as workspace tab ───────────────────────────────────────────
function openDoc(doc: KnowledgeDoc, side = false): void {
  const path = doc.path as string | undefined;
  const taskId = doc.id as string | undefined;

  if (taskId && taskId.startsWith("TSK-")) {
    ws.open({ kind: "report", taskId, path }, { side });
  } else if (path) {
    ws.open({ kind: "file", path }, { side });
  }
  if (!side) ks.close();
}

function onRowClick(doc: KnowledgeDoc, ev: MouseEvent): void {
  openDoc(doc, false);
  ev.stopPropagation();
}

function onRowMiddleClick(doc: KnowledgeDoc, ev: MouseEvent): void {
  if (ev.button === 1) { ev.preventDefault(); openDoc(doc, true); }
}

function onRowKeyDown(doc: KnowledgeDoc, ev: KeyboardEvent): void {
  if (ev.key === "Enter") {
    if (ev.metaKey || ev.ctrlKey) openDoc(doc, true);
    else openDoc(doc, false);
    ev.preventDefault();
  }
}

// ── Ratings ───────────────────────────────────────────────────────────────
const rated = ref(new Set<string>());

async function rate(doc: KnowledgeDoc, verdict: "up" | "down"): Promise<void> {
  const node = (doc.id || doc.path) as string | undefined;
  if (!node) return;
  try {
    await fetch("/api/knowledge/mark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node, verdict, query: ks.currentQuery }),
    });
    rated.value = new Set([...rated.value, node]);
  } catch {}
}

// ── Snippet highlight ──────────────────────────────────────────────────────
function highlight(snippet: string | undefined, q: string): string {
  if (!snippet) return "";
  if (!q.trim()) return snippet;
  const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return snippet.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
}

// ── Stale banner ──────────────────────────────────────────────────────────
function rerun(): void {
  ks.markFresh();
  triggerSearch(draftQuery.value || ks.currentQuery);
}
</script>

<template>
  <BaseModal
    :open="ks.isOpen"
    size="lg"
    title="Search Knowledge"
    :dismissible="true"
    @close="ks.close()"
  >
    <div class="srch-modal-body" id="search-modal-body">
      <div class="srch-modal-top">
        <div class="srch-input-row">
          <input
            ref="inputRef"
            v-model="draftQuery"
            type="text"
            :placeholder="corpusLabel"
            autocomplete="off"
            spellcheck="false"
            aria-label="Search query"
            @keydown.escape="ks.close()"
          />
          <div class="srch-mode-toggle" role="group" aria-label="Search mode">
            <button
              class="srch-mode-btn"
              :class="{ active: mode === 'search' }"
              type="button"
              @click="mode = 'search'; triggerSearch(draftQuery)"
              aria-pressed="mode === 'search'"
            >Search</button>
            <button
              class="srch-mode-btn"
              :class="{ active: mode === 'deep' }"
              type="button"
              @click="mode = 'deep'; triggerSearch(draftQuery)"
              aria-pressed="mode === 'deep'"
            >Deep</button>
          </div>
        </div>

        <div class="srch-filters">
          <label class="srch-filter">
            <select v-model="filterDocType" @change="triggerSearch(draftQuery)" aria-label="Filter by type">
              <option value="">All types</option>
              <option value="feature">Feature</option>
              <option value="reference">Reference</option>
              <option value="report">Report</option>
              <option value="note">Note</option>
            </select>
          </label>
          <label class="srch-filter">
            <select v-model="filterSince" @change="triggerSearch(draftQuery)" aria-label="Filter by date">
              <option value="">Any time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </label>
        </div>

        <div v-if="ks.isStale" class="srch-stale-banner" id="srch-stale-banner">
          <span>Index updated —</span>
          <button class="srch-stale-rerun" type="button" @click="rerun">rerun search</button>
        </div>
      </div>

      <div class="srch-results" id="srch-results" role="listbox" aria-label="Search results">
        <div v-if="isLoading" class="srch-loading" aria-live="polite">Searching…</div>
        <template v-else-if="ks.hasResult">
          <!-- Documents lane -->
          <div v-if="docs.length" class="srch-lane" id="srch-lane-docs">
            <h3>Documents</h3>
            <div
              v-for="(doc, i) in docs"
              :key="doc.path ?? doc.id ?? i"
              class="srch-row"
              role="option"
              tabindex="0"
              :data-doc-path="doc.path"
              :data-doc-id="doc.id"
              @click="onRowClick(doc, $event)"
              @mousedown="onRowMiddleClick(doc, $event)"
              @keydown="onRowKeyDown(doc, $event)"
            >
              <div class="srch-row-title">{{ doc.title ?? doc.path }}</div>
              <div class="srch-row-meta">
                <span v-if="doc.doc_type" class="srch-chip srch-chip--type">{{ doc.doc_type }}</span>
                <span v-if="doc.status" class="srch-chip">{{ doc.status }}</span>
                <span v-if="doc.date" class="srch-chip">{{ doc.date }}</span>
                <span v-if="doc.project" class="srch-chip srch-chip--project">{{ doc.project }}</span>
                <span v-if="doc.why" class="srch-chip srch-chip--why">{{ doc.why }}</span>
              </div>
              <div v-if="doc.snippet" class="srch-snippet" v-html="highlight(doc.snippet as string, draftQuery)" />
              <div class="srch-row-actions">
                <button
                  class="srch-rate-btn"
                  :class="{ rated: rated.has((doc.id || doc.path) as string) }"
                  type="button"
                  title="Helpful"
                  @click.stop="rate(doc, 'up')"
                  aria-label="Mark helpful"
                >👍</button>
                <button
                  class="srch-rate-btn"
                  type="button"
                  title="Not helpful"
                  @click.stop="rate(doc, 'down')"
                  aria-label="Mark not helpful"
                >👎</button>
              </div>
            </div>
          </div>

          <!-- Prior work / reports lane -->
          <div v-if="reports.length" class="srch-lane" id="srch-lane-reports">
            <h3>Prior work</h3>
            <div
              v-for="(doc, i) in reports"
              :key="doc.id ?? doc.path ?? i"
              class="srch-row"
              role="option"
              tabindex="0"
              :data-doc-path="doc.path"
              :data-doc-id="doc.id"
              @click="onRowClick(doc, $event)"
              @mousedown="onRowMiddleClick(doc, $event)"
              @keydown="onRowKeyDown(doc, $event)"
            >
              <div class="srch-row-title">{{ doc.title ?? doc.id }}</div>
              <div class="srch-row-meta">
                <span v-if="doc.doc_type" class="srch-chip srch-chip--type">{{ doc.doc_type }}</span>
                <span v-if="doc.status" class="srch-chip">{{ doc.status }}</span>
                <span v-if="doc.date" class="srch-chip">{{ doc.date }}</span>
                <span v-if="doc.project" class="srch-chip srch-chip--project">{{ doc.project }}</span>
                <span v-if="doc.why" class="srch-chip srch-chip--why">{{ doc.why }}</span>
              </div>
              <div v-if="doc.snippet" class="srch-snippet" v-html="highlight(doc.snippet as string, draftQuery)" />
              <div class="srch-row-actions">
                <button
                  class="srch-rate-btn"
                  :class="{ rated: rated.has((doc.id || doc.path) as string) }"
                  type="button"
                  title="Helpful"
                  @click.stop="rate(doc, 'up')"
                  aria-label="Mark helpful"
                >👍</button>
                <button
                  class="srch-rate-btn"
                  type="button"
                  title="Not helpful"
                  @click.stop="rate(doc, 'down')"
                  aria-label="Mark not helpful"
                >👎</button>
              </div>
            </div>
          </div>

          <div v-if="!docs.length && !reports.length" class="srch-empty">
            No results found for "{{ draftQuery }}"
          </div>
        </template>
        <div v-else-if="draftQuery && !isLoading" class="srch-empty">
          No results yet — keep typing…
        </div>
        <div v-else-if="!draftQuery" class="srch-empty">
          Type to search, or pick a recent query.
        </div>
      </div>
    </div>
  </BaseModal>
</template>
