<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { escHtml } from "../lib/highlight";

const router = useRouter();

// ── State ──────────────────────────────────────────────────────────────────
let heartbeatTimezoneOffsetMinutes = 0;
let use12Hour = localStorage.getItem("clock.format") === "12";
let quickView = "jobs";
let quickViewInitialized = false;
let quickViewChosenByUser = false;
let lastRenderedSchedules: Array<Record<string, unknown>> = [];
let scrollAnimFrame = 0;
let clockInterval: ReturnType<typeof setInterval> | null = null;
let summaryInterval: ReturnType<typeof setInterval> | null = null;

// ── DOM refs (obtained in onMounted) ──────────────────────────────────────
let clockEl: HTMLElement | null = null;
let dateEl: HTMLElement | null = null;
let msgEl: HTMLElement | null = null;
let quickJobsView: HTMLElement | null = null;
let quickJobForm: HTMLFormElement | null = null;
let quickOpenCreate: HTMLElement | null = null;
let quickBackJobs: HTMLElement | null = null;
let quickJobSubmit: HTMLButtonElement | null = null;
let quickJobStatus: HTMLElement | null = null;
let quickJobsStatus: HTMLElement | null = null;
let quickJobsNext: HTMLElement | null = null;
let quickJobCount: HTMLElement | null = null;
let quickJobsList: HTMLElement | null = null;
let quickTaskAgent: HTMLSelectElement | null = null;
let quickTaskHeadline: HTMLInputElement | null = null;
let quickTaskBrief: HTMLTextAreaElement | null = null;
let quickTaskRecurring: HTMLInputElement | null = null;
let quickTaskScheduleSection: HTMLElement | null = null;
let quickTaskModeCron: HTMLInputElement | null = null;
let quickTaskModeInterval: HTMLInputElement | null = null;
let quickCronSection: HTMLElement | null = null;
let quickIntervalSection: HTMLElement | null = null;
let quickTaskCron: HTMLInputElement | null = null;
let quickTaskIntervalStart: HTMLInputElement | null = null;
let quickTaskIntervalHours: HTMLInputElement | null = null;
let multiAgentPanel: HTMLElement | null = null;
let multiAgentGrid: HTMLElement | null = null;
let multiAgentSub: HTMLElement | null = null;
let multiAgentExtras: HTMLElement | null = null;
let multiAgentRefresh: HTMLElement | null = null;

// ── Clock ─────────────────────────────────────────────────────────────────
function clampTimezoneOffsetMinutes(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-720, Math.min(840, Math.round(n)));
}

function toOffsetDate(baseDate: Date): Date {
  const base = baseDate instanceof Date ? baseDate : new Date(String(baseDate));
  return new Date(base.getTime() + heartbeatTimezoneOffsetMinutes * 60_000);
}

function formatOffsetDate(baseDate: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(toOffsetDate(baseDate));
}

function greetingForHour(h: number): string {
  if (h < 5) return "Night mode.";
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  if (h < 22) return "Good evening.";
  return "Wind down and ship clean.";
}

function isNightHour(hour: number): boolean {
  return hour < 5 || hour >= 22;
}

function applyVisualMode(hour: number): void {
  const night = isNightHour(hour);
  document.body.classList.toggle("night-mode", night);
  document.body.classList.toggle("day-mode", !night);
  document.body.dataset.mode = night ? "night" : "day";
  if (msgEl) msgEl.textContent = night ? "Night mode." : greetingForHour(hour);
}

function renderClock(): void {
  if (!clockEl || !dateEl) return;
  const now = new Date();
  const shifted = toOffsetDate(now);
  const rawH = shifted.getUTCHours();
  const hh = use12Hour ? String((rawH % 12) || 12).padStart(2, "0") : String(rawH).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");
  const suffix = use12Hour ? (rawH >= 12 ? " PM" : " AM") : "";
  clockEl.textContent = hh + ":" + mm + ":" + ss + suffix;
  dateEl.textContent = formatOffsetDate(now, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  applyVisualMode(rawH);
  clockEl.classList.remove("ms-pulse");
  requestAnimationFrame(() => clockEl?.classList.add("ms-pulse"));
}

// ── Schedule rendering ────────────────────────────────────────────────────
function renderSchedulesList(schedules: Array<Record<string, unknown>>): void {
  if (!quickJobsList) return;
  const items = Array.isArray(schedules) ? schedules : [];
  lastRenderedSchedules = items;

  if (!items.length) {
    quickJobsList.innerHTML = '<div class="quick-jobs-empty">No scheduled tasks yet.</div>';
    if (quickJobsNext) quickJobsNext.textContent = "No schedules";
    return;
  }

  if (quickJobsNext) quickJobsNext.textContent = items.length + " schedule" + (items.length === 1 ? "" : "s");

  quickJobsList.innerHTML = items.map((t) => {
    const rec = (t.recurrence || {}) as Record<string, unknown>;
    const recInterval = rec.interval as Record<string, unknown> | undefined;
    const cadence = rec.cron
      ? "cron: " + rec.cron
      : (recInterval ? "every " + recInterval.every_hours + "h @ " + recInterval.start : "--");
    const enabled = rec.enabled !== false;
    const agent = String(t.agent || "--");
    const headline = String(t.headline || t.title || t.id || "--");
    const count = rec.count != null ? " (" + rec.count + " fired)" : "";
    return (
      '<div class="quick-job-item">' +
        '<div class="quick-job-item-main">' +
          '<div class="quick-job-line">' +
            '<span class="quick-job-item-name">' + escHtml(headline) + "</span>" +
            '<span class="quick-job-item-time">' + escHtml(agent) + "</span>" +
            '<span class="quick-job-item-cooldown">' + escHtml(String(cadence)) + escHtml(count) + "</span>" +
          "</div>" +
          '<div style="font-size:11px;opacity:0.6;padding:2px 0 4px;">' +
            (enabled ? '<span style="color:#a8f1ca">● active</span>' : '<span style="color:#ffd39f">⏸ paused</span>') +
          "</div>" +
        "</div>" +
        '<div style="display:flex;gap:6px;">' +
          (enabled
            ? '<button class="quick-job-delete" type="button" data-pause-schedule="' + escHtml(String(t.agent || "")) + '" data-schedule-id="' + escHtml(String(t.id || "")) + '">Pause</button>'
            : '<button class="quick-job-delete" type="button" data-resume-schedule="' + escHtml(String(t.agent || "")) + '" data-schedule-id="' + escHtml(String(t.id || "")) + '">Resume</button>'
          ) +
          '<button class="quick-job-delete" type="button" data-delete-schedule="' + escHtml(String(t.agent || "")) + '" data-schedule-id="' + escHtml(String(t.id || "")) + '">Delete</button>' +
        "</div>" +
      "</div>"
    );
  }).join("");
}

async function loadAndRenderSchedules(): Promise<void> {
  try {
    const res = await fetch("/api/tasks/scheduled", { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const out = await res.json();
    renderSchedulesList(Array.isArray(out.templates) ? out.templates : []);
  } catch {
    renderSchedulesList([]);
  }
}

// ── Quick view toggle ─────────────────────────────────────────────────────
function smoothScrollTo(top: number): void {
  if (scrollAnimFrame) cancelAnimationFrame(scrollAnimFrame);
  const start = window.scrollY;
  const target = Math.max(0, top);
  const distance = target - start;
  if (Math.abs(distance) < 1) return;
  const duration = 560;
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    window.scrollTo(0, start + distance * eased);
    if (p < 1) { scrollAnimFrame = requestAnimationFrame(step); } else { scrollAnimFrame = 0; }
  };
  scrollAnimFrame = requestAnimationFrame(step);
}

function focusQuickView(view: string): void {
  const target = view === "jobs" ? quickJobsView : quickJobForm;
  if (!target) return;
  const y = Math.max(0, window.scrollY + target.getBoundingClientRect().top - 44);
  smoothScrollTo(y);
}

function setQuickView(view: string, options?: { user?: boolean; scroll?: boolean }): void {
  if (!quickJobsView || !quickJobForm) return;
  const showJobs = view === "jobs";
  quickJobsView.classList.toggle("quick-view-hidden", !showJobs);
  quickJobForm.classList.toggle("quick-view-hidden", showJobs);
  quickView = showJobs ? "jobs" : "create";
  if (options?.user) quickViewChosenByUser = true;
  if (options?.scroll) focusQuickView(quickView);
}

function syncQuickViewForSchedules(): void {
  const count = lastRenderedSchedules.length;
  if (count === 0) {
    if (quickViewInitialized && quickView === "jobs" && quickViewChosenByUser) return;
    setQuickView("create");
    quickViewInitialized = true;
    return;
  }
  if (!quickViewInitialized) {
    setQuickView("jobs");
    quickViewInitialized = true;
  }
}

// ── Quick task form helpers ───────────────────────────────────────────────
async function populateQuickTaskDropdowns(): Promise<void> {
  try {
    const res = await fetch("/api/agents", { cache: "no-store" });
    if (res.ok && quickTaskAgent) {
      const data = await res.json();
      const agents = Array.isArray(data.agents) ? data.agents : [];
      quickTaskAgent.innerHTML = agents.map((a: Record<string, string>) =>
        '<option value="' + escHtml(a.name) + '"' + (a.name === "alice" ? " selected" : "") + ">" +
        escHtml((a.emoji ? a.emoji + " " : "") + (a.displayName || a.name)) + "</option>"
      ).join("");
    }
  } catch { /* agents list is best-effort */ }
}

function updateBriefCount(): void {
  if (quickTaskBrief && quickJobCount) {
    quickJobCount.textContent = String((quickTaskBrief.value || "").trim().length) + " chars";
  }
}

function syncScheduleSection(): void {
  if (!quickTaskRecurring || !quickTaskScheduleSection) return;
  quickTaskScheduleSection.classList.toggle("quick-view-hidden", !quickTaskRecurring.checked);
}

function syncCronIntervalSections(): void {
  const isInterval = quickTaskModeInterval ? quickTaskModeInterval.checked : true;
  if (quickCronSection) quickCronSection.classList.toggle("quick-view-hidden", isInterval);
  if (quickIntervalSection) quickIntervalSection.classList.toggle("quick-view-hidden", !isInterval);
}

// ── Settings (timezone only; heartbeat handled by HeartbeatBar) ───────────
async function loadSettings(): Promise<void> {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    heartbeatTimezoneOffsetMinutes = clampTimezoneOffsetMinutes(data?.timezoneOffsetMinutes);
    renderClock();
    loadAndRenderSchedules();
  } catch { /* use default offset 0 */ }
}

// ── Multi-agent summary ───────────────────────────────────────────────────
function escSummary(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c: string) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

function renderCell(name: string, counts: Record<string, number>): string {
  const open = counts.open || 0;
  const waiting = counts.waiting || 0;
  const done = counts.done || 0;
  const failed = counts.failed || 0;
  const archived = counts.archived || 0;
  function countSpan(value: number, status: string, icon: string, label: string): string {
    const clsBase = value > 0 ? "multi-agent-count-" + status : "multi-agent-count-zero";
    const clsLink = value > 0 ? " multi-agent-count-link" : "";
    const dataAttrs = value > 0
      ? ' data-agent="' + escSummary(name) + '" data-status="' + status + '" role="button" tabindex="0"'
      : "";
    return '<span class="' + clsBase + clsLink + '" title="' + label + '"' + dataAttrs + ">" + icon + " " + value + "</span>";
  }
  return (
    '<div class="multi-agent-cell">' +
    '<div class="multi-agent-cell-name">' + escSummary(name) + "</div>" +
    '<div class="multi-agent-cell-counts">' +
    countSpan(open, "open", "○", "open") +
    countSpan(waiting, "waiting", "⏳", "waiting") +
    countSpan(done, "done", "✓", "done") +
    countSpan(failed, "failed", "✗", "failed") +
    countSpan(archived, "archived", "📦", "archived") +
    "</div></div>"
  );
}

function navigateToTasksDir(agent: string, status: string): void {
  if (!agent || !status) return;
  const dir = "agents/" + agent + "/tasks/" + status;
  router.push("/files").then(() => {
    if (typeof (window as any).__loadDirectory === "function") {
      (window as any).__loadDirectory(dir);
    }
  });
}

async function fetchSummary(): Promise<void> {
  if (!multiAgentPanel || !multiAgentGrid || !multiAgentSub) return;
  try {
    const res = await fetch("/api/multi-agent/summary", { cache: "no-store" });
    const data = await res.json();
    if (!data.ok || !data.summary) {
      multiAgentSub.textContent = "Unavailable";
      multiAgentGrid.innerHTML = "";
      if (multiAgentExtras) multiAgentExtras.innerHTML = "";
      multiAgentPanel.removeAttribute("hidden");
      return;
    }
    const s = data.summary;
    if (!s.enabled) {
      multiAgentPanel.setAttribute("hidden", "");
      return;
    }
    multiAgentPanel.removeAttribute("hidden");
    const totals = s.totals || {};
    multiAgentSub.textContent =
      (totals.open || 0) + " open · " +
      (totals.waiting || 0) + " waiting · " +
      (totals.done || 0) + " done · " +
      (totals.failed || 0) + " failed · " +
      (totals.archived || 0) + " archived";

    const byAgent = s.byAgent || {};
    const names = Object.keys(byAgent).sort();
    multiAgentGrid.innerHTML = names.map((n: string) => renderCell(n, byAgent[n])).join("");

    if (multiAgentExtras) {
      const extraLines: string[] = [];
      for (const item of s.waitingUser || []) {
        extraLines.push('<div class="multi-agent-extras-line">⏳ ' + escSummary(item.agent) + ": " + escSummary(item.summary || item.file) + "</div>");
      }
      for (const pi of s.paused || []) {
        extraLines.push('<div class="multi-agent-extras-line paused">⏸ ' + escSummary(pi.agent) + ": " + escSummary(pi.summary || pi.file) + "</div>");
      }
      for (const e of s.escalated || []) {
        extraLines.push('<div class="multi-agent-extras-line escalated">↑ ' + escSummary(e.agent) + ": " + escSummary(e.file) + "</div>");
      }
      const unreadable = s.unreadable || [];
      if (unreadable.length > 0) {
        const label = unreadable.length + " envelope" + (unreadable.length === 1 ? "" : "s") + " unreadable";
        const listItems = unreadable.map((u: Record<string, string>) => escSummary(u.agent) + "/" + escSummary(u.file)).join(", ");
        extraLines.push('<div class="multi-agent-extras-line unreadable" title="' + escSummary(listItems) + '">⚠ ' + escSummary(label) + "</div>");
      }
      multiAgentExtras.innerHTML = extraLines.join("");
    }
  } catch (err) {
    if (multiAgentSub) multiAgentSub.textContent = "Error: " + (err instanceof Error ? err.message : String(err));
  }
}

// ── Schedule pause/resume/delete (delegated) ──────────────────────────────
async function onScheduleClick(event: MouseEvent): Promise<void> {
  const target = event.target as HTMLElement;
  if (!target) return;

  const pauseBtn = target.closest<HTMLButtonElement>("[data-pause-schedule]");
  if (pauseBtn) {
    const agent = pauseBtn.getAttribute("data-pause-schedule") || "";
    const id = pauseBtn.getAttribute("data-schedule-id") || "";
    if (!agent || !id) return;
    pauseBtn.disabled = true;
    try {
      const res = await fetch("/api/tasks/schedule/" + encodeURIComponent(id) + "/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent }),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "pause failed");
      await loadAndRenderSchedules();
    } catch (err) {
      if (quickJobsStatus) quickJobsStatus.textContent = "Failed: " + (err instanceof Error ? err.message : String(err));
    } finally {
      pauseBtn.disabled = false;
    }
    return;
  }

  const resumeBtn = target.closest<HTMLButtonElement>("[data-resume-schedule]");
  if (resumeBtn) {
    const agent = resumeBtn.getAttribute("data-resume-schedule") || "";
    const id = resumeBtn.getAttribute("data-schedule-id") || "";
    if (!agent || !id) return;
    resumeBtn.disabled = true;
    try {
      const res = await fetch("/api/tasks/schedule/" + encodeURIComponent(id) + "/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent }),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "resume failed");
      await loadAndRenderSchedules();
    } catch (err) {
      if (quickJobsStatus) quickJobsStatus.textContent = "Failed: " + (err instanceof Error ? err.message : String(err));
    } finally {
      resumeBtn.disabled = false;
    }
    return;
  }

  const deleteBtn = target.closest<HTMLButtonElement>("[data-delete-schedule]");
  if (deleteBtn) {
    const agent = deleteBtn.getAttribute("data-delete-schedule") || "";
    const id = deleteBtn.getAttribute("data-schedule-id") || "";
    if (!agent || !id) return;
    deleteBtn.disabled = true;
    if (quickJobsStatus) quickJobsStatus.textContent = "Deleting…";
    try {
      const res = await fetch("/api/tasks/schedule/" + encodeURIComponent(id) + "?agent=" + encodeURIComponent(agent), { method: "DELETE" });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "delete failed");
      if (quickJobsStatus) quickJobsStatus.textContent = "Deleted.";
      await loadAndRenderSchedules();
      syncQuickViewForSchedules();
    } catch (err) {
      if (quickJobsStatus) quickJobsStatus.textContent = "Failed: " + (err instanceof Error ? err.message : String(err));
    } finally {
      deleteBtn.disabled = false;
    }
  }
}

// ── Form submit ───────────────────────────────────────────────────────────
async function onFormSubmit(event: Event): Promise<void> {
  event.preventDefault();
  const agent = quickTaskAgent ? (quickTaskAgent.value || "").trim() : "alice";
  const headline = quickTaskHeadline ? (quickTaskHeadline.value || "").trim() : "";
  const brief = quickTaskBrief ? (quickTaskBrief.value || "").trim() : "";
  if (!agent || !headline || !brief) {
    if (quickJobStatus) quickJobStatus.textContent = "Agent, title, and description are required.";
    return;
  }
  const isRecurring = quickTaskRecurring ? quickTaskRecurring.checked : false;
  if (quickJobSubmit) quickJobSubmit.disabled = true;
  if (quickJobStatus) quickJobStatus.textContent = isRecurring ? "Saving schedule…" : "Creating task…";

  try {
    if (isRecurring) {
      const isInterval = quickTaskModeInterval ? quickTaskModeInterval.checked : true;
      const cron = quickTaskCron ? (quickTaskCron.value || "").trim() : "";
      const intervalHours = quickTaskIntervalHours ? Number(quickTaskIntervalHours.value || "24") : 24;
      const intervalStart = quickTaskIntervalStart ? (quickTaskIntervalStart.value || "").trim() : "";
      if (!isInterval && !cron) {
        if (quickJobStatus) quickJobStatus.textContent = "Enter a cron expression.";
        return;
      }
      const recurrence = isInterval
        ? { interval: { start: intervalStart || "08:00", every_hours: intervalHours }, enabled: true, skip_if_active: true }
        : { cron, enabled: true, skip_if_active: true };
      const res = await fetch("/api/tasks/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: agent, headline, kind: "other", priority: "P2", brief, recurrence }),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "failed");
      if (quickJobStatus) quickJobStatus.textContent = "Schedule created.";
      if (quickJobsStatus) quickJobsStatus.textContent = "Created " + (out.id || "schedule");
      if (quickTaskHeadline) quickTaskHeadline.value = "";
      if (quickTaskBrief) quickTaskBrief.value = "";
      setQuickView("jobs", { scroll: true });
      await loadAndRenderSchedules();
      syncQuickViewForSchedules();
    } else {
      const res = await fetch("/api/tasks/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: agent, headline, kind: "other", priority: "P2", brief }),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "failed");
      if (quickJobStatus) quickJobStatus.textContent = "Task created.";
      if (quickJobsStatus) quickJobsStatus.textContent = "Created " + (out.id || "task");
      if (quickTaskHeadline) quickTaskHeadline.value = "";
      if (quickTaskBrief) quickTaskBrief.value = "";
      setQuickView("jobs", { scroll: true });
    }
  } catch (err) {
    if (quickJobStatus) quickJobStatus.textContent = "Failed: " + (err instanceof Error ? err.message : String(err));
  } finally {
    if (quickJobSubmit) quickJobSubmit.disabled = false;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(() => {
  clockEl = document.getElementById("clock");
  dateEl = document.getElementById("date");
  msgEl = document.getElementById("message");
  quickJobsView = document.getElementById("quick-jobs-view");
  quickJobForm = document.getElementById("quick-job-form") as HTMLFormElement | null;
  quickOpenCreate = document.getElementById("quick-open-create");
  quickBackJobs = document.getElementById("quick-back-jobs");
  quickJobSubmit = document.getElementById("quick-job-submit") as HTMLButtonElement | null;
  quickJobStatus = document.getElementById("quick-job-status");
  quickJobsStatus = document.getElementById("quick-jobs-status");
  quickJobsNext = document.getElementById("quick-jobs-next");
  quickJobCount = document.getElementById("quick-job-count");
  quickJobsList = document.getElementById("quick-jobs-list");
  quickTaskAgent = document.getElementById("quick-task-agent") as HTMLSelectElement | null;
  quickTaskHeadline = document.getElementById("quick-task-headline") as HTMLInputElement | null;
  quickTaskBrief = document.getElementById("quick-task-brief") as HTMLTextAreaElement | null;
  quickTaskRecurring = document.getElementById("quick-task-recurring") as HTMLInputElement | null;
  quickTaskScheduleSection = document.getElementById("quick-task-schedule-section");
  quickTaskModeCron = document.getElementById("quick-task-mode-cron") as HTMLInputElement | null;
  quickTaskModeInterval = document.getElementById("quick-task-mode-interval") as HTMLInputElement | null;
  quickCronSection = document.getElementById("quick-cron-section");
  quickIntervalSection = document.getElementById("quick-interval-section");
  quickTaskCron = document.getElementById("quick-task-cron") as HTMLInputElement | null;
  quickTaskIntervalStart = document.getElementById("quick-task-interval-start") as HTMLInputElement | null;
  quickTaskIntervalHours = document.getElementById("quick-task-interval-hours") as HTMLInputElement | null;
  multiAgentPanel = document.getElementById("multi-agent-panel");
  multiAgentGrid = document.getElementById("multi-agent-grid");
  multiAgentSub = document.getElementById("multi-agent-sub");
  multiAgentExtras = document.getElementById("multi-agent-extras");
  multiAgentRefresh = document.getElementById("multi-agent-refresh");

  // Clock
  renderClock();
  clockInterval = setInterval(renderClock, 1000);
  setQuickView(quickView);
  loadSettings();

  // Quick view buttons
  quickOpenCreate?.addEventListener("click", () => setQuickView("create", { scroll: true, user: true }));
  quickBackJobs?.addEventListener("click", () => setQuickView("jobs", { scroll: true, user: true }));

  // Form field listeners
  quickTaskBrief?.addEventListener("input", updateBriefCount);
  quickTaskRecurring?.addEventListener("change", syncScheduleSection);
  quickTaskModeCron?.addEventListener("change", syncCronIntervalSections);
  quickTaskModeInterval?.addEventListener("change", syncCronIntervalSections);

  syncScheduleSection();
  syncCronIntervalSections();
  populateQuickTaskDropdowns();

  // Form submit
  quickJobForm?.addEventListener("submit", onFormSubmit);

  // Schedule list delegated click handler
  document.addEventListener("click", onScheduleClick);

  // Multi-agent summary
  multiAgentRefresh?.addEventListener("click", fetchSummary);
  fetchSummary();
  summaryInterval = setInterval(fetchSummary, 30000);

  // "Open Tasks" button
  const openTasksBtn = document.getElementById("multi-agent-open-tasks-btn");
  openTasksBtn?.addEventListener("click", () => router.push("/tasks"));

  // Count badge navigation
  multiAgentGrid?.addEventListener("click", (ev) => {
    const link = (ev.target as HTMLElement).closest<HTMLElement>(".multi-agent-count-link");
    if (!link) return;
    ev.preventDefault();
    navigateToTasksDir(link.getAttribute("data-agent") || "", link.getAttribute("data-status") || "");
  });
  multiAgentGrid?.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const link = (ev.target as HTMLElement).closest<HTMLElement>(".multi-agent-count-link");
    if (!link) return;
    ev.preventDefault();
    navigateToTasksDir(link.getAttribute("data-agent") || "", link.getAttribute("data-status") || "");
  });
});

onBeforeUnmount(() => {
  if (clockInterval) clearInterval(clockInterval);
  if (summaryInterval) clearInterval(summaryInterval);
  if (scrollAnimFrame) cancelAnimationFrame(scrollAnimFrame);
  document.removeEventListener("click", onScheduleClick);
});
</script>

<template>
  <div id="dashboard-panel">
    <section class="hero">
      <div class="logo-art" role="img" aria-label="Caravel ship logo">
        <svg class="logo-ship" viewBox="0 0 120 96" width="120" height="96" fill="none" aria-hidden="true">
          <!-- masts -->
          <path d="M34 70 V30 M58 70 V14 M84 60 V28" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.55" />
          <!-- yards: long spars running low-forward to high-aft -->
          <path d="M12 59 L52 24 M28 45 L80 6 M64 53 L102 22" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.5" />
          <!-- mizzen lateen -->
          <path d="M66 52 L100 24 Q106 40 98 60 Q82 58 66 52 Z" fill="currentColor" opacity="0.6" />
          <!-- main lateen -->
          <path d="M30 44 L78 8 Q88 36 74 64 Q52 60 30 44 Z" fill="currentColor" opacity="0.92" />
          <!-- fore lateen -->
          <path d="M14 58 L50 26 Q58 46 48 66 Q30 64 14 58 Z" fill="currentColor" opacity="0.74" />
          <!-- pennant -->
          <path d="M58 14 h12 l-3.5 3 l3.5 3 h-12 Z" fill="currentColor" opacity="0.9" />
          <!-- sterncastle -->
          <path d="M82 70 V60 H102 L100 70 Z" fill="currentColor" opacity="0.85" />
          <!-- hull -->
          <path d="M16 70 H104 L95 84 Q90 89 82 89 H38 Q30 89 25 84 Z" fill="currentColor" />
        </svg>
      </div>
      <div class="brand-name" aria-label="Caravel">Caravel</div>
      <div class="time" id="clock">--:--:--</div>
      <div class="date" id="date">Loading date...</div>
      <div class="message" id="message">Welcome back.</div>
      <a
        class="repo-cta"
        href="https://github.com/caravelhq/caravel"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Star Caravel on GitHub"
      >
        <span class="repo-text">Like Caravel? Star it on GitHub</span>
        <span class="repo-star">★</span>
      </a>
      <section class="multi-agent-panel" id="multi-agent-panel" hidden>
        <div class="multi-agent-head">
          <div>
            <div class="multi-agent-title">Multi-Agent Tasks</div>
            <div class="multi-agent-sub" id="multi-agent-sub">Loading...</div>
          </div>
          <div class="multi-agent-head-actions">
            <button class="multi-agent-action" id="multi-agent-open-tasks-btn" type="button" title="Open the Tasks panel">Open Tasks</button>
            <button class="multi-agent-refresh" id="multi-agent-refresh" type="button" title="Refresh">↻</button>
          </div>
        </div>
        <div class="multi-agent-grid" id="multi-agent-grid"></div>
        <div class="multi-agent-extras" id="multi-agent-extras"></div>
      </section>
    </section>

    <!-- Quick jobs view: schedule list -->
    <section class="quick-jobs-view" id="quick-jobs-view">
      <div class="quick-jobs-header">
        <div class="quick-jobs-next" id="quick-jobs-next">No schedules</div>
        <button class="quick-open-create" id="quick-open-create" type="button">+ New Task</button>
      </div>
      <div class="quick-jobs-list" id="quick-jobs-list">
        <div class="quick-jobs-empty">Loading...</div>
      </div>
      <div class="quick-jobs-status" id="quick-jobs-status"></div>
    </section>

    <!-- Quick task create / schedule form -->
    <form class="quick-job-form quick-view-hidden" id="quick-job-form">
      <div class="quick-job-form-head">
        <button class="quick-back-jobs" id="quick-back-jobs" type="button">← Schedules</button>
        <h2 class="quick-job-form-title">New Task</h2>
      </div>

      <div class="quick-field">
        <label class="quick-label" for="quick-task-agent">Agent</label>
        <select class="quick-select" id="quick-task-agent">
          <option value="alice">alice</option>
        </select>
      </div>

      <div class="quick-field">
        <label class="quick-label" for="quick-task-headline">Title</label>
        <input class="quick-input" id="quick-task-headline" type="text" placeholder="Short task title" autocomplete="off" />
      </div>

      <div class="quick-field">
        <label class="quick-label" for="quick-task-brief">Description <span class="quick-count" id="quick-job-count">0 chars</span></label>
        <textarea class="quick-textarea" id="quick-task-brief" rows="4" placeholder="What should the agent do?"></textarea>
      </div>

      <div class="quick-field quick-field-check">
        <label class="quick-check-label">
          <input type="checkbox" id="quick-task-recurring" />
          Recurring
        </label>
      </div>

      <section class="quick-view-hidden quick-schedule-section" id="quick-task-schedule-section">
        <div class="quick-field quick-field-radios">
          <label class="quick-radio-label">
            <input type="radio" name="quick-task-mode" id="quick-task-mode-interval" checked />
            Interval
          </label>
          <label class="quick-radio-label">
            <input type="radio" name="quick-task-mode" id="quick-task-mode-cron" />
            Cron
          </label>
        </div>

        <section id="quick-interval-section">
          <div class="quick-field">
            <label class="quick-label" for="quick-task-interval-start">Start time (HH:MM)</label>
            <input class="quick-input" id="quick-task-interval-start" type="text" placeholder="08:00" />
          </div>
          <div class="quick-field">
            <label class="quick-label" for="quick-task-interval-hours">Every (hours)</label>
            <input class="quick-input" id="quick-task-interval-hours" type="number" value="24" min="1" max="168" />
          </div>
        </section>

        <section class="quick-view-hidden" id="quick-cron-section">
          <div class="quick-field">
            <label class="quick-label" for="quick-task-cron">Cron expression</label>
            <input class="quick-input" id="quick-task-cron" type="text" placeholder="0 8 * * *" autocomplete="off" />
          </div>
        </section>
      </section>

      <div class="quick-field quick-field-submit">
        <button class="quick-submit" id="quick-job-submit" type="submit">Create</button>
        <div class="quick-job-status" id="quick-job-status"></div>
      </div>
    </form>
  </div>
</template>
