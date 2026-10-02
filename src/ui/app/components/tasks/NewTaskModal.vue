<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import BaseModal from "../modal/BaseModal.vue";
import { useNewTaskStore } from "../../stores/newTask";

const nt = useNewTaskStore();

// ── Form state ────────────────────────────────────────────────────────────
const to = ref("alice");
const headline = ref("");
const brief = ref("");
const project = ref("");
const needs = ref("");
const kind = ref("other");
const from = ref("user");
const outputFormat = ref("");
const context = ref("");

// Repeat
const repeat = ref(false);
const repeatMode = ref<"interval" | "cron">("interval");
const intervalStart = ref("08:00");
const intervalHours = ref(24);
const cronExpr = ref("");

// Status
const status = ref("");
const statusClass = ref("");
const submitting = ref(false);

// Agents / projects catalogs
const agents = ref<Array<{ name: string; emoji?: string; displayName?: string }>>([]);
const projects = ref<Array<{ slug: string; name?: string }>>([]);

// Derived
const headlineWords = computed(() => headline.value.trim().split(/\s+/).filter(Boolean).length);

const modalTitle = computed(() => nt.mode === "schedule" ? "New schedule" : "New task");

// ── Cron next-fire preview (minimal inline implementation) ────────────────
function matchCronField(field: string, value: number): boolean {
  for (const part of field.split(",")) {
    const [range, stepStr] = part.split("/");
    const step = stepStr ? parseInt(stepStr) : 1;
    if (range === "*") { if (value % step === 0) return true; continue; }
    if (range.includes("-")) {
      const [lo, hi] = range.split("-").map(Number);
      if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
      continue;
    }
    if (parseInt(range) === value) return true;
  }
  return false;
}

function cronMatches(expr: string, d: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return (
    matchCronField(minute, d.getMinutes()) &&
    matchCronField(hour, d.getHours()) &&
    matchCronField(dayOfMonth, d.getDate()) &&
    matchCronField(month, d.getMonth() + 1) &&
    matchCronField(dayOfWeek, d.getDay())
  );
}

function nextCronFires(expr: string, count: number): Date[] {
  const results: Date[] = [];
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 2880 && results.length < count; i++) {
    if (cronMatches(expr, d)) results.push(new Date(d));
    d.setMinutes(d.getMinutes() + 1);
  }
  return results;
}

function nextIntervalFires(startHHMM: string, everyHours: number, count: number): Date[] {
  const results: Date[] = [];
  const [hStr, mStr] = (startHHMM || "08:00").split(":");
  const h = parseInt(hStr) || 8;
  const m = parseInt(mStr) || 0;
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  const ms = (everyHours || 24) * 3600_000;
  // Find the first fire at or after now
  let t = base.getTime();
  while (t <= now.getTime()) t += ms;
  for (let i = 0; i < count; i++) {
    results.push(new Date(t));
    t += ms;
  }
  return results;
}

const nextFireTimes = computed<Date[]>(() => {
  if (!repeat.value) return [];
  if (repeatMode.value === "cron") {
    if (!cronExpr.value.trim()) return [];
    try { return nextCronFires(cronExpr.value.trim(), 3); } catch { return []; }
  }
  return nextIntervalFires(intervalStart.value, intervalHours.value, 3);
});

function fmtDate(d: Date): string {
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Catalog loading ───────────────────────────────────────────────────────
async function loadAgents(): Promise<void> {
  try {
    const res = await fetch("/api/agents");
    const data = await res.json();
    if (data?.ok && Array.isArray(data.agents)) {
      agents.value = data.agents;
      const coord = agents.value.find(a => a.name === "alice");
      const rest = agents.value.filter(a => a.name !== "alice");
      agents.value = coord ? [coord, ...rest] : rest;
    }
  } catch { /* best-effort */ }
}

async function loadProjects(): Promise<void> {
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    if (data?.ok && Array.isArray(data.projects)) {
      projects.value = data.projects;
    }
  } catch { /* best-effort */ }
}

// ── Reset and prefill ─────────────────────────────────────────────────────
function reset(): void {
  headline.value = nt.prefillHeadline;
  brief.value = nt.prefillBrief;
  context.value = (nt.prefillContext || []).join("\n");
  project.value = nt.project || "";
  needs.value = "";
  kind.value = "other";
  from.value = "user";
  outputFormat.value = "";
  repeat.value = nt.mode === "schedule";
  repeatMode.value = "interval";
  intervalStart.value = "08:00";
  intervalHours.value = 24;
  cronExpr.value = "";
  status.value = "";
  statusClass.value = "";
  submitting.value = false;
}

// Load catalogs once on mount; reset on open.
onMounted(() => { loadAgents(); loadProjects(); });

watch(() => nt.isOpen, (open) => {
  if (open) reset();
});

// ── Submit ────────────────────────────────────────────────────────────────
async function submit(): Promise<void> {
  const hl = headline.value.trim();
  const br = brief.value.trim();
  if (!hl) { status.value = "Headline is required (≤10 words)."; statusClass.value = "is-error"; return; }
  if (headlineWords.value > 10) { status.value = `Headline too long (${headlineWords.value} words; max 10).`; statusClass.value = "is-error"; return; }
  if (!br) { status.value = "Brief is required."; statusClass.value = "is-error"; return; }
  if (!to.value) { status.value = "Pick a target agent."; statusClass.value = "is-error"; return; }

  submitting.value = true;
  status.value = repeat.value ? "Saving schedule…" : "Dispatching…";
  statusClass.value = "";

  try {
    if (repeat.value) {
      const isCron = repeatMode.value === "cron";
      if (isCron && !cronExpr.value.trim()) {
        status.value = "Enter a cron expression.";
        statusClass.value = "is-error";
        submitting.value = false;
        return;
      }
      const recurrence = isCron
        ? { cron: cronExpr.value.trim(), enabled: true, skip_if_active: true }
        : { interval: { start: intervalStart.value || "08:00", every_hours: intervalHours.value }, enabled: true, skip_if_active: true };
      const payload: Record<string, unknown> = {
        to: to.value,
        headline: hl,
        kind: kind.value,
        brief: br,
        recurrence,
      };
      if (from.value && from.value !== "user") payload.from = from.value;
      if (outputFormat.value.trim()) payload.output_format = outputFormat.value.trim();
      const ctxLines = context.value.trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (ctxLines.length > 0) payload.context = ctxLines;
      const needsLines = needs.value.trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (needsLines.length > 0) payload.needs = needsLines;
      if (project.value && project.value !== "__none__") payload.project = project.value;
      if (nt.parent) payload.parent = nt.parent;

      const res = await fetch("/api/tasks/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "failed");
      status.value = "Schedule created: " + (out.id || "ok");
      statusClass.value = "is-ok";
      setTimeout(() => nt.close(), 1200);
    } else {
      const payload: Record<string, unknown> = {
        headline: hl,
        to: to.value,
        from: from.value || "user",
        kind: kind.value,
        brief: br,
      };
      if (outputFormat.value.trim()) payload.output_format = outputFormat.value.trim();
      const ctxLines = context.value.trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (ctxLines.length > 0) payload.context = ctxLines;
      const needsLines = needs.value.trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (needsLines.length > 0) payload.needs = needsLines;
      if (project.value === "__none__") payload.project = null;
      else if (project.value) payload.project = project.value;
      if (nt.parent) payload.parent = nt.parent;

      const res = await fetch("/api/tasks/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "failed");
      status.value = "Dispatched " + (out.id || "task");
      statusClass.value = "is-ok";
      setTimeout(() => nt.close(), 800);
    }
  } catch (err) {
    status.value = "Error: " + ((err as Error).message || String(err));
    statusClass.value = "is-error";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <BaseModal
    id="new-task-modal"
    :open="nt.isOpen"
    :title="modalTitle"
    size="lg"
    @close="nt.close()"
  >
    <form class="ntm-form" @submit.prevent="submit">
      <!-- Parent chip -->
      <div v-if="nt.parent" class="multi-agent-new-parent">
        <span>↳ child of <strong>{{ nt.parent }}</strong></span>
      </div>

      <!-- Agent + Headline row -->
      <div class="multi-agent-new-grid">
        <label class="multi-agent-new-field">
          <span>Target</span>
          <select v-model="to">
            <option v-if="!agents.length" value="alice">alice</option>
            <option v-for="a in agents" :key="a.name" :value="a.name">
              {{ (a.emoji ? a.emoji + ' ' : '') + (a.displayName || a.name) }}
            </option>
          </select>
        </label>
        <label class="multi-agent-new-field">
          <span>Project</span>
          <select v-model="project">
            <option value="">(auto from context)</option>
            <option value="__none__">(none / unassigned)</option>
            <option v-for="p in projects" :key="p.slug" :value="p.slug">
              {{ p.name || p.slug }}
            </option>
          </select>
        </label>
      </div>

      <label class="multi-agent-new-block">
        <span>Headline <em class="multi-agent-new-hint">(required, ≤10 words)</em></span>
        <input
          id="ntm-headline"
          v-model="headline"
          type="text"
          maxlength="120"
          placeholder="BLE plugin survey"
          required
          autocomplete="off"
        />
        <span class="multi-agent-new-counter" :class="{ 'is-over': headlineWords > 10 }">
          {{ headlineWords }} / 10 words
        </span>
      </label>

      <label class="multi-agent-new-block">
        <span>Brief <em class="multi-agent-new-hint">(required)</em></span>
        <textarea
          id="ntm-brief"
          v-model="brief"
          rows="4"
          placeholder="Why and what — specific enough that two workers wouldn't duplicate effort."
          required
        ></textarea>
      </label>

      <!-- Advanced section -->
      <details class="multi-agent-new-advanced">
        <summary class="multi-agent-new-advanced-toggle">▸ Advanced</summary>
        <div class="multi-agent-new-advanced-body">
          <label class="multi-agent-new-block">
            <span>Depends on <em class="multi-agent-new-hint">(task IDs, one per line)</em></span>
            <textarea v-model="needs" rows="2" placeholder="TSK-2026-08-01-0001&#10;TSK-2026-08-01-0002"></textarea>
          </label>
          <div class="multi-agent-new-grid">
            <label class="multi-agent-new-field">
              <span>Kind</span>
              <select v-model="kind">
                <option value="research">research</option>
                <option value="code">code</option>
                <option value="review">review</option>
                <option value="summarise">summarise</option>
                <option value="decide">decide</option>
                <option value="other">other</option>
              </select>
            </label>
            <label class="multi-agent-new-field">
              <span>From</span>
              <input v-model="from" type="text" value="user" />
            </label>
          </div>
          <label class="multi-agent-new-block">
            <span>Output format</span>
            <textarea v-model="outputFormat" rows="2" placeholder="What 'done' looks like."></textarea>
          </label>
          <label class="multi-agent-new-block">
            <span>Context <em class="multi-agent-new-hint">(one per line — file path, jira:KEY, or URL)</em></span>
            <textarea v-model="context" rows="2" placeholder="Notes/Projects/...&#10;jira:WAL-XX"></textarea>
          </label>
        </div>
      </details>

      <!-- Repeat section -->
      <div class="ntm-repeat-toggle">
        <label class="ntm-check-label">
          <input v-model="repeat" type="checkbox" />
          Repeat
        </label>
      </div>
      <section v-if="repeat" class="ntm-repeat-section">
        <div class="ntm-repeat-modes">
          <label class="ntm-radio-label">
            <input v-model="repeatMode" type="radio" value="interval" />
            Interval
          </label>
          <label class="ntm-radio-label">
            <input v-model="repeatMode" type="radio" value="cron" />
            Cron
          </label>
        </div>
        <div v-if="repeatMode === 'interval'" class="multi-agent-new-grid">
          <label class="multi-agent-new-field">
            <span>Start time (HH:MM)</span>
            <input v-model="intervalStart" type="text" placeholder="08:00" />
          </label>
          <label class="multi-agent-new-field">
            <span>Every (hours)</span>
            <input v-model.number="intervalHours" type="number" min="1" max="168" />
          </label>
        </div>
        <div v-else>
          <label class="multi-agent-new-block">
            <span>Cron expression</span>
            <input v-model="cronExpr" type="text" placeholder="0 8 * * *" autocomplete="off" />
          </label>
        </div>
        <div v-if="nextFireTimes.length" class="ntm-next-fires">
          <span class="ntm-next-fires-label">Next 3 fires:</span>
          <ul class="ntm-next-fires-list">
            <li v-for="(d, i) in nextFireTimes" :key="i">{{ fmtDate(d) }}</li>
          </ul>
        </div>
        <div v-else-if="repeat && repeatMode === 'cron' && cronExpr.trim()" class="ntm-next-fires ntm-next-fires--invalid">
          Invalid cron expression
        </div>
      </section>

      <!-- Actions -->
      <div class="multi-agent-new-actions">
        <span class="multi-agent-new-status" :class="statusClass">{{ status }}</span>
        <button class="multi-agent-new-cancel" type="button" @click="nt.close()">Cancel</button>
        <button class="multi-agent-new-submit" type="submit" :disabled="submitting">
          {{ repeat ? 'Save schedule' : 'Dispatch' }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
