    // Register service worker for PWA install
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(function() {});
    }

    const $ = (id) => document.getElementById(id);

    const clockEl = $("clock");
    const dateEl = $("date");
    const msgEl = $("message");
    const dockEl = $("dock");
    const pillsEl = $("dock-pills");
    const settingsBtn = $("settings-btn");
    const settingsModal = $("settings-modal");
    const settingsClose = $("settings-close");
    const hbConfig = $("hb-config");
    const hbModal = $("hb-modal");
    const hbModalClose = $("hb-modal-close");
    const hbForm = $("hb-form");
    const hbIntervalInput = $("hb-interval-input");
    const hbPromptInput = $("hb-prompt-input");
    const hbModalStatus = $("hb-modal-status");
    const hbCancelBtn = $("hb-cancel-btn");
    const hbSaveBtn = $("hb-save-btn");
    const infoOpen = $("info-open");
    const infoModal = $("info-modal");
    const infoClose = $("info-close");
    const infoBody = $("info-body");
    const hbToggle = $("hb-toggle");
    const clockToggle = $("clock-toggle");
    const hbInfoEl = $("hb-info");
    const clockInfoEl = $("clock-info");
    const quickJobsView = $("quick-jobs-view");
    const quickJobForm = $("quick-job-form");
    const quickOpenCreate = $("quick-open-create");
    const quickBackJobs = $("quick-back-jobs");
    const quickJobSubmit = $("quick-job-submit");
    const quickJobStatus = $("quick-job-status");
    const quickJobsStatus = $("quick-jobs-status");
    const quickJobsNext = $("quick-jobs-next");
    const quickJobCount = $("quick-job-count");
    const quickJobsList = $("quick-jobs-list");
    const jobsBubbleEl = $("jobs-bubble");
    const tasksBubbleEl = $("tasks-bubble");
    const uptimeBubbleEl = $("uptime-bubble");

    // ── Audio action modal — shared between global-mic and global-speaker ──
    (function() {
      var modal = $("audio-action-modal");
      var iconEl = $("audio-action-icon");
      var labelEl = $("audio-action-label");
      var stopBtn = $("audio-action-stop");
      var stopCb = null;

      function showAudioModal(type, onStop) {
        stopCb = onStop || null;
        if (iconEl) {
          iconEl.innerHTML = type === "playing"
            ? '<i class="fa-solid fa-volume-high" style="color:#9be7ff"></i>'
            : '<i class="fa-solid fa-microphone" style="color:#ff9b9b"></i>';
        }
        if (labelEl) labelEl.textContent = type === "playing" ? "Playing..." : "Recording...";
        if (modal) modal.hidden = false;
      }

      function hideAudioModal() {
        if (modal) modal.hidden = true;
        stopCb = null;
      }

      if (stopBtn) {
        stopBtn.addEventListener("click", function() {
          if (typeof stopCb === "function") stopCb();
          hideAudioModal();
        });
      }

      window.__showAudioModal = showAudioModal;
      window.__hideAudioModal = hideAudioModal;
    })();
    // New task form fields
    const quickTaskAgent = $("quick-task-agent");
    const quickTaskHeadline = $("quick-task-headline");
    const quickTaskBrief = $("quick-task-brief");
    const quickTaskRecurring = $("quick-task-recurring");
    const quickTaskScheduleSection = $("quick-task-schedule-section");
    const quickTaskModeCron = $("quick-task-mode-cron");
    const quickTaskModeInterval = $("quick-task-mode-interval");
    const quickCronSection = $("quick-cron-section");
    const quickIntervalSection = $("quick-interval-section");
    const quickTaskCron = $("quick-task-cron");
    const quickTaskIntervalStart = $("quick-task-interval-start");
    const quickTaskIntervalHours = $("quick-task-interval-hours");
    let hbBusy = false;
    let hbSaveBusy = false;
    let use12Hour = localStorage.getItem("clock.format") === "12";
    let quickView = "jobs";
    let quickViewInitialized = false;
    let quickViewChosenByUser = false;
    let lastRenderedSchedules = [];
    let scrollAnimFrame = 0;
    let heartbeatTimezoneOffsetMinutes = 0;
    // Status-dock connectivity: drives an adaptive poll cadence (faster while
    // offline) and an immediate refresh on tab-visible / network-back.
    let stateOnline = true;

    function clampTimezoneOffsetMinutes(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      return Math.max(-720, Math.min(840, Math.round(n)));
    }

    function toOffsetDate(baseDate) {
      const base = baseDate instanceof Date ? baseDate : new Date(baseDate);
      return new Date(base.getTime() + heartbeatTimezoneOffsetMinutes * 60_000);
    }

    function formatOffsetDate(baseDate, options) {
      return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(toOffsetDate(baseDate));
    }

    function isSameOffsetDay(a, b) {
      const da = toOffsetDate(a);
      const db = toOffsetDate(b);
      return (
        da.getUTCFullYear() === db.getUTCFullYear() &&
        da.getUTCMonth() === db.getUTCMonth() &&
        da.getUTCDate() === db.getUTCDate()
      );
    }

    function greetingForHour(h) {
      if (h < 5) return "Night mode.";
      if (h < 12) return "Good morning.";
      if (h < 18) return "Good afternoon.";
      if (h < 22) return "Good evening.";
      return "Wind down and ship clean.";
    }

    function isNightHour(hour) {
      return hour < 5 || hour >= 22;
    }

    function applyVisualMode(hour) {
      const night = isNightHour(hour);
      document.body.classList.toggle("night-mode", night);
      document.body.classList.toggle("day-mode", !night);
      document.body.dataset.mode = night ? "night" : "day";
      msgEl.textContent = night ? "Night mode." : greetingForHour(hour);
    }


    function renderClock() {
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

      // Subtle 1s pulse to keep the clock feeling alive.
      clockEl.classList.remove("ms-pulse");
      requestAnimationFrame(() => clockEl.classList.add("ms-pulse"));
    }

    function buildPills(state) {
      const pills = [];

      if (state.telegram && state.telegram.configured) {
        pills.push({
          cls: "ok",
          icon: "✈️",
          label: "Telegram",
          value: state.telegram.allowedUserCount + " user" + (state.telegram.allowedUserCount !== 1 ? "s" : ""),
        });
      }

      if (state.discord && state.discord.configured) {
        pills.push({
          cls: "ok",
          icon: "🎮",
          label: "Discord",
          value: state.discord.allowedUserCount + " user" + (state.discord.allowedUserCount !== 1 ? "s" : ""),
        });
      }

      return pills;
    }

    function fmtDur(ms) {
      if (ms == null) return "n/a";
      const s = Math.floor(ms / 1000);
      const d = Math.floor(s / 86400);
      if (d > 0) {
        const h = Math.floor((s % 86400) / 3600);
        return d + "d " + h + "h";
      }
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ss = s % 60;
      if (h > 0) return h + "h " + m + "m";
      if (m > 0) return m + "m " + ss + "s";
      return ss + "s";
    }

    function matchCronField(field, value) {
      const parts = String(field || "").split(",");
      for (const partRaw of parts) {
        const part = String(partRaw || "").trim();
        if (!part) continue;
        const pair = part.split("/");
        const range = pair[0];
        const stepStr = pair[1];
        const step = stepStr ? Number.parseInt(stepStr, 10) : 1;
        if (!Number.isInteger(step) || step <= 0) continue;

        if (range === "*") {
          if (value % step === 0) return true;
          continue;
        }

        if (range.includes("-")) {
          const bounds = range.split("-");
          const lo = Number.parseInt(bounds[0], 10);
          const hi = Number.parseInt(bounds[1], 10);
          if (!Number.isInteger(lo) || !Number.isInteger(hi)) continue;
          if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
          continue;
        }

        if (Number.parseInt(range, 10) === value) return true;
      }
      return false;
    }

    function cronMatchesAt(schedule, date) {
      const parts = String(schedule || "").trim().split(/\s+/);
      if (parts.length !== 5) return false;
      const shifted = toOffsetDate(date);
      const d = {
        minute: shifted.getUTCMinutes(),
        hour: shifted.getUTCHours(),
        dayOfMonth: shifted.getUTCDate(),
        month: shifted.getUTCMonth() + 1,
        dayOfWeek: shifted.getUTCDay(),
      };

      return (
        matchCronField(parts[0], d.minute) &&
        matchCronField(parts[1], d.hour) &&
        matchCronField(parts[2], d.dayOfMonth) &&
        matchCronField(parts[3], d.month) &&
        matchCronField(parts[4], d.dayOfWeek)
      );
    }

    function nextRunAt(schedule, now) {
      const probe = new Date(now);
      probe.setSeconds(0, 0);
      probe.setMinutes(probe.getMinutes() + 1);
      for (let i = 0; i < 2880; i++) {
        if (cronMatchesAt(schedule, probe)) return new Date(probe);
        probe.setMinutes(probe.getMinutes() + 1);
      }
      return null;
    }

    function clockFromSchedule(schedule) {
      const parts = String(schedule || "").trim().split(/\s+/);
      if (parts.length < 2) return schedule;
      const minute = Number(parts[0]);
      const hour = Number(parts[1]);
      if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return schedule;
      }
      const shiftedNow = toOffsetDate(new Date());
      shiftedNow.setUTCHours(hour, minute, 0, 0);
      const instant = new Date(shiftedNow.getTime() - heartbeatTimezoneOffsetMinutes * 60_000);
      return formatOffsetDate(instant, {
        hour: "numeric",
        minute: "2-digit",
        hour12: use12Hour,
      });
    }

    function renderSchedulesList(schedules) {
      if (!quickJobsList) return;
      const items = Array.isArray(schedules) ? schedules : [];
      lastRenderedSchedules = items;

      if (!items.length) {
        quickJobsList.innerHTML = '<div class="quick-jobs-empty">No scheduled tasks yet.</div>';
        if (quickJobsNext) quickJobsNext.textContent = "No schedules";
        return;
      }

      if (quickJobsNext) quickJobsNext.textContent = items.length + " schedule" + (items.length === 1 ? "" : "s");

      quickJobsList.innerHTML = items
        .map((t) => {
          const rec = t.recurrence || {};
          const cadence = rec.cron
            ? "cron: " + rec.cron
            : (rec.interval ? "every " + rec.interval.every_hours + "h @ " + rec.interval.start : "--");
          const enabled = rec.enabled !== false;
          const agent = t.agent || "--";
          const headline = t.headline || t.title || t.id || "--";
          const count = rec.count != null ? " (" + rec.count + " fired)" : "";
          return (
            '<div class="quick-job-item">' +
              '<div class="quick-job-item-main">' +
                '<div class="quick-job-line">' +
                  '<span class="quick-job-item-name">' + esc(headline) + "</span>" +
                  '<span class="quick-job-item-time">' + esc(agent) + "</span>" +
                  '<span class="quick-job-item-cooldown">' + esc(cadence) + esc(count) + "</span>" +
                "</div>" +
                '<div style="font-size:11px;opacity:0.6;padding:2px 0 4px;">' +
                  (enabled ? '<span style="color:#a8f1ca">● active</span>' : '<span style="color:#ffd39f">⏸ paused</span>') +
                "</div>" +
              "</div>" +
              '<div style="display:flex;gap:6px;">' +
                (enabled
                  ? '<button class="quick-job-delete" type="button" data-pause-schedule="' + escAttr(t.agent || "") + '" data-schedule-id="' + escAttr(t.id || "") + '">Pause</button>'
                  : '<button class="quick-job-delete" type="button" data-resume-schedule="' + escAttr(t.agent || "") + '" data-schedule-id="' + escAttr(t.id || "") + '">Resume</button>'
                ) +
                '<button class="quick-job-delete" type="button" data-delete-schedule="' + escAttr(t.agent || "") + '" data-schedule-id="' + escAttr(t.id || "") + '">Delete</button>' +
              "</div>" +
            "</div>"
          );
        })
        .join("");
    }

    async function loadAndRenderSchedules() {
      try {
        const res = await fetch("/api/tasks/scheduled", { cache: "no-store" });
        if (!res.ok) throw new Error("status " + res.status);
        const out = await res.json();
        renderSchedulesList(Array.isArray(out.templates) ? out.templates : []);
      } catch (_) {
        renderSchedulesList([]);
      }
    }

    async function refreshState() {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) throw new Error("status " + res.status);
        const state = await res.json();
        stateOnline = true;
        const pills = buildPills(state);
        pillsEl.innerHTML = pills.map((p) =>
          '<div class="pill ' + p.cls + '">' +
            '<div class="pill-label"><span class="pill-icon">' + esc(p.icon || "") + "</span>" + esc(p.label) + '</div>' +
            '<div class="pill-value">' + esc(p.value) + '</div>' +
          "</div>"
        ).join("");
        if (jobsBubbleEl) {
          jobsBubbleEl.innerHTML =
            '<div class="side-icon">🗂️</div>' +
            '<div class="side-value">' + esc(String(state.jobs?.length ?? 0)) + "</div>" +
            '<div class="side-label">Jobs</div>';
        }
        if (tasksBubbleEl) {
          tasksBubbleEl.innerHTML =
            '<div class="side-icon">📋</div>' +
            '<div class="side-value">' + esc(String(state.tasksActive ?? 0)) + "</div>" +
            '<div class="side-label">Tasks</div>';
        }
        loadAndRenderSchedules();
        syncQuickViewForSchedules();
        if (uptimeBubbleEl) {
          uptimeBubbleEl.innerHTML =
            '<div class="side-icon">⏱️</div>' +
            '<div class="side-value">' + esc(fmtDur(state.daemon?.uptimeMs ?? 0)) + "</div>" +
            '<div class="side-label">Uptime</div>';
        }
      } catch (err) {
        stateOnline = false;
        pillsEl.innerHTML = '<div class="pill bad"><div class="pill-label"><span class="pill-icon">⚠️</span>Status</div><div class="pill-value">Offline</div></div>';
        if (jobsBubbleEl) {
          jobsBubbleEl.innerHTML = '<div class="side-icon">🗂️</div><div class="side-value">-</div><div class="side-label">Jobs</div>';
        }
        if (tasksBubbleEl) {
          tasksBubbleEl.innerHTML = '<div class="side-icon">📋</div><div class="side-value">-</div><div class="side-label">Tasks</div>';
        }
        lastRenderedSchedules = [];
        renderSchedulesList([]);
        syncQuickViewForSchedules();
        if (uptimeBubbleEl) {
          uptimeBubbleEl.innerHTML = '<div class="side-icon">⏱️</div><div class="side-value">-</div><div class="side-label">Uptime</div>';
        }
      }
    }
    function smoothScrollTo(top) {
      if (scrollAnimFrame) cancelAnimationFrame(scrollAnimFrame);
      const start = window.scrollY;
      const target = Math.max(0, top);
      const distance = target - start;
      if (Math.abs(distance) < 1) return;
      const duration = 560;
      const t0 = performance.now();

      const step = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        window.scrollTo(0, start + distance * eased);
        if (p < 1) {
          scrollAnimFrame = requestAnimationFrame(step);
        } else {
          scrollAnimFrame = 0;
        }
      };

      scrollAnimFrame = requestAnimationFrame(step);
    }

    function focusQuickView(view) {
      const target = view === "jobs" ? quickJobsView : quickJobForm;
      if (!target) return;
      const y = Math.max(0, window.scrollY + target.getBoundingClientRect().top - 44);
      smoothScrollTo(y);
    }

    function setQuickView(view, options) {
      if (!quickJobsView || !quickJobForm) return;
      const showJobs = view === "jobs";
      quickJobsView.classList.toggle("quick-view-hidden", !showJobs);
      quickJobForm.classList.toggle("quick-view-hidden", showJobs);
      quickView = showJobs ? "jobs" : "create";
      if (options && options.user) quickViewChosenByUser = true;
      if (options && options.scroll) focusQuickView(quickView);
    }

    function syncQuickViewForSchedules() {
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

    function cap(s) {
      if (!s) return "";
      return s.slice(0, 1).toUpperCase() + s.slice(1);
    }

    async function loadSettings() {
      if (!hbToggle) return;
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        const on = Boolean(data?.heartbeat?.enabled);
        const intervalMinutes = Number(data?.heartbeat?.interval) || 15;
        const prompt = typeof data?.heartbeat?.prompt === "string" ? data.heartbeat.prompt : "";
        heartbeatTimezoneOffsetMinutes = clampTimezoneOffsetMinutes(data?.timezoneOffsetMinutes);
        setHeartbeatUi(on, undefined, intervalMinutes, prompt);
        renderClock();
        loadAndRenderSchedules();
      } catch (err) {
        hbToggle.textContent = "Error";
        hbToggle.className = "hb-toggle off";
        if (hbInfoEl) hbInfoEl.textContent = "unavailable";
      }
    }

    async function openTechnicalInfo() {
      if (!infoModal || !infoBody) return;
      infoModal.classList.add("open");
      infoModal.setAttribute("aria-hidden", "false");
      infoBody.innerHTML = '<div class="info-section"><div class="info-title">Loading</div><pre class="info-json">Loading technical data...</pre></div>';
      try {
        const res = await fetch("/api/technical-info");
        const data = await res.json();
        renderTechnicalInfo(data);
      } catch (err) {
        infoBody.innerHTML = '<div class="info-section"><div class="info-title">Error</div><pre class="info-json">' + esc(String(err)) + "</pre></div>";
      }
    }

    function renderTechnicalInfo(data) {
      if (!infoBody) return;
      const sections = [
        { title: "daemon", value: data?.daemon ?? null },
        { title: "settings.json", value: data?.files?.settingsJson ?? null },
        { title: "session.json", value: data?.files?.sessionJson ?? null },
        { title: "state.json", value: data?.files?.stateJson ?? null },
      ];
      infoBody.innerHTML = sections.map((section) =>
        '<div class="info-section">' +
          '<div class="info-title">' + esc(section.title) + "</div>" +
          '<pre class="info-json">' + esc(JSON.stringify(section.value, null, 2)) + "</pre>" +
        "</div>"
      ).join("");
    }

    function setHeartbeatUi(on, label, intervalMinutes, prompt) {
      if (!hbToggle) return;
      hbToggle.textContent = label || (on ? "Enabled" : "Disabled");
      hbToggle.className = "hb-toggle " + (on ? "on" : "off");
      hbToggle.dataset.enabled = on ? "1" : "0";
      if (intervalMinutes != null) hbToggle.dataset.interval = String(intervalMinutes);
      if (prompt != null) hbToggle.dataset.prompt = String(prompt);
      const iv = Number(hbToggle.dataset.interval) || 15;
      if (hbInfoEl) hbInfoEl.textContent = on ? ("every " + iv + " minutes") : ("paused (interval " + iv + "m)");
    }

    function openHeartbeatModal() {
      if (!hbModal) return;
      hbModal.classList.add("open");
      hbModal.setAttribute("aria-hidden", "false");
    }

    function closeHeartbeatModal() {
      if (!hbModal) return;
      hbModal.classList.remove("open");
      hbModal.setAttribute("aria-hidden", "true");
      if (hbModalStatus) hbModalStatus.textContent = "";
      hbSaveBusy = false;
      if (hbSaveBtn) hbSaveBtn.disabled = false;
      if (hbCancelBtn) hbCancelBtn.disabled = false;
    }

    async function openHeartbeatConfig() {
      if (!hbIntervalInput || !hbPromptInput || !hbModalStatus) return;
      openHeartbeatModal();
      hbModalStatus.textContent = "Loading...";
      try {
        const res = await fetch("/api/settings/heartbeat");
        const out = await res.json();
        if (!out.ok) throw new Error(out.error || "failed to load heartbeat");
        const hb = out.heartbeat || {};
        hbIntervalInput.value = String(Number(hb.interval) || Number(hbToggle?.dataset.interval) || 15);
        hbPromptInput.value = typeof hb.prompt === "string" ? hb.prompt : (hbToggle?.dataset.prompt || "");
        hbModalStatus.textContent = "";
      } catch (err) {
        hbModalStatus.textContent = "Failed: " + String(err instanceof Error ? err.message : err);
      }
    }

    if (settingsBtn && settingsModal) {
      settingsBtn.addEventListener("click", async () => {
        settingsModal.classList.toggle("open");
        if (settingsModal.classList.contains("open")) await loadSettings();
      });
    }

    if (settingsClose && settingsModal) {
      settingsClose.addEventListener("click", () => settingsModal.classList.remove("open"));
    }
    if (hbConfig) {
      hbConfig.addEventListener("click", openHeartbeatConfig);
    }
    if (hbModalClose) {
      hbModalClose.addEventListener("click", closeHeartbeatModal);
    }
    if (hbCancelBtn) {
      hbCancelBtn.addEventListener("click", closeHeartbeatModal);
    }
    if (infoOpen) {
      infoOpen.addEventListener("click", openTechnicalInfo);
    }
    if (infoClose && infoModal) {
      infoClose.addEventListener("click", () => {
        infoModal.classList.remove("open");
        infoModal.setAttribute("aria-hidden", "true");
      });
    }
    document.addEventListener("click", (event) => {
      if (!settingsModal || !settingsBtn) return;
      if (!settingsModal.classList.contains("open")) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (settingsModal.contains(target) || settingsBtn.contains(target)) return;
      settingsModal.classList.remove("open");
    });
    document.addEventListener("click", (event) => {
      if (!hbModal) return;
      if (!hbModal.classList.contains("open")) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target === hbModal) closeHeartbeatModal();
    });
    document.addEventListener("click", (event) => {
      if (!infoModal) return;
      if (!infoModal.classList.contains("open")) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target === infoModal) {
        infoModal.classList.remove("open");
        infoModal.setAttribute("aria-hidden", "true");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (hbModal && hbModal.classList.contains("open")) {
        closeHeartbeatModal();
      } else if (infoModal && infoModal.classList.contains("open")) {
        infoModal.classList.remove("open");
        infoModal.setAttribute("aria-hidden", "true");
      } else if (settingsModal && settingsModal.classList.contains("open")) {
        settingsModal.classList.remove("open");
      }
    });

    if (hbToggle) {
      hbToggle.addEventListener("click", async () => {
        if (hbBusy) return;
        const current = hbToggle.dataset.enabled === "1";
        const intervalMinutes = Number(hbToggle.dataset.interval) || 15;
        const currentPrompt = hbToggle.dataset.prompt || "";
        const next = !current;
        hbBusy = true;
        hbToggle.disabled = true;
        setHeartbeatUi(next, next ? "Enabled" : "Disabled", intervalMinutes, currentPrompt);
        try {
          const res = await fetch("/api/settings/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: next }),
          });
          const out = await res.json();
          if (!out.ok) throw new Error(out.error || "save failed");
          if (out.heartbeat) {
            setHeartbeatUi(Boolean(out.heartbeat.enabled), undefined, Number(out.heartbeat.interval) || intervalMinutes, typeof out.heartbeat.prompt === "string" ? out.heartbeat.prompt : currentPrompt);
          }
          await refreshState();
        } catch {
          setHeartbeatUi(current, current ? "Enabled" : "Disabled", intervalMinutes, currentPrompt);
        } finally {
          hbBusy = false;
          hbToggle.disabled = false;
        }
      });
    }

    if (hbForm && hbIntervalInput && hbPromptInput && hbModalStatus && hbSaveBtn && hbCancelBtn) {
      hbForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (hbSaveBusy) return;

        const interval = Number(String(hbIntervalInput.value || "").trim());
        const prompt = String(hbPromptInput.value || "").trim();
        if (!Number.isFinite(interval) || interval < 1 || interval > 1440) {
          hbModalStatus.textContent = "Interval must be 1-1440 minutes.";
          return;
        }
        if (!prompt) {
          hbModalStatus.textContent = "Prompt is required.";
          return;
        }

        hbSaveBusy = true;
        hbSaveBtn.disabled = true;
        hbCancelBtn.disabled = true;
        hbModalStatus.textContent = "Saving...";
        try {
          const res = await fetch("/api/settings/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              interval,
              prompt,
            }),
          });
          const out = await res.json();
          if (!out.ok) throw new Error(out.error || "save failed");
          const enabled = hbToggle ? hbToggle.dataset.enabled === "1" : false;
          const next = out.heartbeat || {};
          setHeartbeatUi(
            "enabled" in next ? Boolean(next.enabled) : enabled,
            undefined,
            Number(next.interval) || interval,
            typeof next.prompt === "string" ? next.prompt : prompt
          );
          hbModalStatus.textContent = "Saved.";
          await refreshState();
          setTimeout(() => closeHeartbeatModal(), 120);
        } catch (err) {
          hbModalStatus.textContent = "Failed: " + String(err instanceof Error ? err.message : err);
          hbSaveBusy = false;
          hbSaveBtn.disabled = false;
          hbCancelBtn.disabled = false;
        }
      });
    }

    function renderClockToggle() {
      if (!clockToggle) return;
      clockToggle.textContent = use12Hour ? "12h" : "24h";
      clockToggle.className = "hb-toggle " + (use12Hour ? "on" : "off");
      if (clockInfoEl) clockInfoEl.textContent = use12Hour ? "12-hour format" : "24-hour format";
    }

    if (clockToggle) {
      renderClockToggle();
      clockToggle.addEventListener("click", () => {
        use12Hour = !use12Hour;
        localStorage.setItem("clock.format", use12Hour ? "12" : "24");
        renderClockToggle();
        renderClock();
      });
    }

    var headerToggle = $("header-toggle");
    var headerHidden = localStorage.getItem("header.hidden") === "1";
    if (headerHidden) document.body.classList.add("hide-header");

    function renderHeaderToggle() {
      if (!headerToggle) return;
      headerToggle.textContent = headerHidden ? "Off" : "On";
      headerToggle.className = "hb-toggle " + (headerHidden ? "off" : "on");
    }
    renderHeaderToggle();

    if (headerToggle) {
      headerToggle.addEventListener("click", function() {
        headerHidden = !headerHidden;
        localStorage.setItem("header.hidden", headerHidden ? "1" : "0");
        document.body.classList.toggle("hide-header", headerHidden);
        renderHeaderToggle();
      });
    }

    var debugToggle = $("debug-toggle");
    var debugEnabled = localStorage.getItem("debug.enabled") === "1";

    function renderDebugToggle() {
      if (!debugToggle) return;
      debugToggle.textContent = debugEnabled ? "On" : "Off";
      debugToggle.className = "hb-toggle " + (debugEnabled ? "on" : "off");
    }
    renderDebugToggle();

    function isDebugEnabled() { return debugEnabled; }

    if (debugToggle) {
      debugToggle.addEventListener("click", function() {
        debugEnabled = !debugEnabled;
        localStorage.setItem("debug.enabled", debugEnabled ? "1" : "0");
        renderDebugToggle();
        updateSessionBadge(lastSessionInfo);
        if (debugEnabled) { try { pollChat({ force: true }); } catch (_) {} }
      });
    }

    // Split view: parent renders a stage on the left; an iframe of /?embed=1
    // renders a stripped stage on the right. Embed mode hides chrome
    // (repo banner, dock, settings, split toggle) so the dock + repo banner
    // appear only once and the right pane is purely content. The right
    // pane defaults to the chat tab.
    var splitToggle = $("split-toggle");
    var splitToggleRow = $("split-toggle-row");
    var splitNavToggle = $("split-nav-toggle");
    var splitPane = $("split-pane");
    var splitIframe = $("split-iframe");
    var splitPaneClose = $("split-pane-close");
    var inIframe = false;
    try { inIframe = window.self !== window.top; } catch (_) { inIframe = true; }
    var embedQuery = /[?&]embed=1\b/.test(location.search);
    var embedMode = inIframe || embedQuery;
    if (embedMode) document.body.classList.add("embed");
    if (embedMode && splitToggleRow) splitToggleRow.style.display = "none";

    var splitEnabled = !embedMode && localStorage.getItem("split.enabled") === "1";

    function applySplitMode() {
      if (embedMode) return;
      document.body.classList.toggle("split-mode", splitEnabled);
      if (splitPane) splitPane.hidden = !splitEnabled;
      if (splitIframe) {
        if (splitEnabled) {
          var cur = splitIframe.src;
          if (!cur || cur === "about:blank") splitIframe.src = "/?embed=1";
        } else {
          // Release the second SSE connection / chat state when toggled off.
          splitIframe.src = "about:blank";
        }
      }
    }

    function renderSplitToggle() {
      if (splitToggle) {
        splitToggle.textContent = splitEnabled ? "On" : "Off";
        splitToggle.className = "hb-toggle " + (splitEnabled ? "on" : "off");
      }
      if (splitNavToggle) {
        splitNavToggle.setAttribute("aria-pressed", splitEnabled ? "true" : "false");
      }
    }
    renderSplitToggle();
    applySplitMode();

    function toggleSplit() {
      splitEnabled = !splitEnabled;
      localStorage.setItem("split.enabled", splitEnabled ? "1" : "0");
      renderSplitToggle();
      applySplitMode();
    }

    if (splitToggle) splitToggle.addEventListener("click", toggleSplit);
    if (splitNavToggle) splitNavToggle.addEventListener("click", toggleSplit);

    if (splitPaneClose) {
      splitPaneClose.addEventListener("click", function() {
        splitEnabled = false;
        localStorage.setItem("split.enabled", "0");
        renderSplitToggle();
        applySplitMode();
      });
    }

    // ── Voice Settings (STT toggle + model config in settings modal) ──
    (function() {
      var voiceSttToggle = $("voice-stt-toggle");
      var voiceSttMeta = $("voice-stt-meta");
      var voiceMicToggle = $("voice-mic-toggle");
      var voiceTtsToggle = $("voice-tts-toggle");
      if (!voiceSttToggle) return;

      var voiceSttEnabled = false;
      var voiceMicEnabled = true;
      var voiceTtsEnabled = true;

      function renderVoiceSttToggle() {
        voiceSttToggle.textContent = voiceSttEnabled ? "DeepGram" : "Whisper";
        voiceSttToggle.className = "hb-toggle " + (voiceSttEnabled ? "on" : "off");
        if (voiceSttMeta) voiceSttMeta.textContent = voiceSttEnabled ? "DeepGram STT" : "Whisper (local)";
      }

      function applyMicEnabled(enabled) {
        voiceMicEnabled = enabled;
        window.__micEnabled = enabled;
        var micBtn = $("global-mic");
        var vmBtn = $("global-voice-mode");
        if (micBtn) micBtn.hidden = !enabled;
        if (vmBtn) {
          if (!enabled) {
            vmBtn.hidden = true;
          } else {
            // Restore voice-mode visibility only when chat tab is active.
            var cp = $("chat-panel");
            vmBtn.hidden = !(cp && !cp.hidden);
          }
        }
        if (voiceMicToggle) {
          voiceMicToggle.textContent = enabled ? "On" : "Off";
          voiceMicToggle.className = "hb-toggle " + (enabled ? "on" : "off");
        }
      }

      function applyTtsEnabled(enabled) {
        voiceTtsEnabled = enabled;
        window.__ttsEnabled = enabled;
        var spkBtn = $("global-speaker");
        if (spkBtn) spkBtn.hidden = !enabled;
        if (voiceTtsToggle) {
          voiceTtsToggle.textContent = enabled ? "On" : "Off";
          voiceTtsToggle.className = "hb-toggle " + (enabled ? "on" : "off");
        }
      }

      async function loadVoiceSettings() {
        try {
          var res = await fetch("/api/settings/voice");
          var data = await res.json();
          if (!data.ok) return;
          var v = data.voice;
          // Only allow enabling DeepGram STT if an API key is actually configured.
          voiceSttEnabled = !!(v && v.sttEnabled && v.hasApiKey);
          renderVoiceSttToggle();
          applyMicEnabled(!(v && v.micEnabled === false));
          applyTtsEnabled(!(v && v.ttsEnabled === false));
        } catch (_) {}
      }

      voiceSttToggle.addEventListener("click", async function() {
        voiceSttEnabled = !voiceSttEnabled;
        renderVoiceSttToggle();
        try {
          await fetch("/api/settings/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sttEnabled: voiceSttEnabled }),
          });
        } catch (_) {}
      });

      if (voiceMicToggle) {
        voiceMicToggle.addEventListener("click", async function() {
          var newEnabled = !voiceMicEnabled;
          applyMicEnabled(newEnabled);
          try {
            await fetch("/api/settings/voice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ micEnabled: newEnabled }),
            });
          } catch (_) {}
        });
      }

      if (voiceTtsToggle) {
        voiceTtsToggle.addEventListener("click", async function() {
          var newEnabled = !voiceTtsEnabled;
          applyTtsEnabled(newEnabled);
          try {
            await fetch("/api/settings/voice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ttsEnabled: newEnabled }),
            });
          } catch (_) {}
        });
      }

      // Refresh voice settings whenever the settings modal opens.
      if (settingsBtn) settingsBtn.addEventListener("click", loadVoiceSettings);
      loadVoiceSettings();
    })();

    // ── Global Mic — dictate into any focused input or textarea ──
    (function() {
      var globalMicBtn = $("global-mic");
      if (!globalMicBtn) return;

      var gmSupported = !!(
        typeof MediaRecorder !== "undefined" &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia
      );
      var gmMimeType = null;
      if (gmSupported) {
        var gmCandidates = [
          "audio/ogg;codecs=opus", "audio/ogg",
          "audio/webm;codecs=opus", "audio/webm",
        ];
        for (var gmi = 0; gmi < gmCandidates.length; gmi++) {
          if (MediaRecorder.isTypeSupported(gmCandidates[gmi])) {
            gmMimeType = gmCandidates[gmi];
            break;
          }
        }
        if (!gmMimeType) gmSupported = false;
      }
      if (!gmSupported) { globalMicBtn.hidden = true; return; }

      var gmRecorder = null;
      var gmChunks = [];
      var gmStream = null;
      var gmLastFocus = null;  // Most recently focused text element.
      var gmHoldMode = false;
      var gmHoldTimer = null;
      var gmPressStart = 0;
      var GM_HOLD_MS = 250;

      // Track the last focused text element so we know where to insert,
      // and enable the button when any input/textarea is focused.
      document.addEventListener("focusin", function(e) {
        var t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && t.id !== "global-mic") {
          gmLastFocus = t;
          // Enable the button when a text field gains focus (unless actively recording/transcribing).
          if (!gmRecorder || gmRecorder.state === "inactive") {
            globalMicBtn.disabled = false;
          }
        }
      }, true);

      // Disable the button when focus leaves all text fields (with a brief delay to let focusin fire first).
      document.addEventListener("focusout", function(e) {
        var t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && t.id !== "global-mic") {
          if (!gmRecorder || gmRecorder.state === "inactive") {
            setTimeout(function() {
              var active = document.activeElement;
              if (!active || (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA")) {
                globalMicBtn.disabled = true;
              }
            }, 120);
          }
        }
      }, true);

      function insertTextAtCursor(el, text) {
        if (!el) return;
        if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
        var start = typeof el.selectionStart === "number" ? el.selectionStart : el.value.length;
        var end = typeof el.selectionEnd === "number" ? el.selectionEnd : el.value.length;
        var before = el.value.slice(0, start);
        var after = el.value.slice(end);
        // Insert with a space separator if the preceding text is non-empty and not whitespace-terminated.
        var prefix = (before.length > 0 && !/\s$/.test(before)) ? " " : "";
        el.value = before + prefix + text + after;
        var newPos = start + prefix.length + text.length;
        try { el.selectionStart = el.selectionEnd = newPos; } catch (_) {}
        el.dispatchEvent(new Event("input", { bubbles: true }));
        // Resize if it's the chat input.
        if (typeof autoResizeChatInput === "function" && el.id === "chat-input") {
          autoResizeChatInput();
        }
      }

      function gmSetState(state) {
        globalMicBtn.classList.remove("recording", "transcribing");
        // Keep disabled when idle unless a suitable field is focused.
        if (state === "recording") {
          globalMicBtn.disabled = false;
          globalMicBtn.classList.add("recording");
          globalMicBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
          globalMicBtn.title = "Stop recording";
        } else if (state === "transcribing") {
          globalMicBtn.disabled = true;
          globalMicBtn.classList.add("transcribing");
          globalMicBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          globalMicBtn.title = "Transcribing…";
        } else {
          // Return to enabled only if a suitable field is currently focused.
          var active = document.activeElement;
          globalMicBtn.disabled = !(active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active !== globalMicBtn);
          globalMicBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
          globalMicBtn.title = "Dictate into focused field";
        }
      }

      function gmStopStream() {
        if (gmStream) {
          gmStream.getTracks().forEach(function(t) { t.stop(); });
          gmStream = null;
        }
      }

      async function gmStartRecording() {
        if (gmRecorder && gmRecorder.state !== "inactive") return;
        try {
          gmStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          console.error("[global-mic] getUserMedia failed:", e);
          return;
        }
        gmChunks = [];
        try {
          gmRecorder = new MediaRecorder(gmStream, { mimeType: gmMimeType });
        } catch (e) {
          console.error("[global-mic] MediaRecorder init failed:", e);
          gmStopStream();
          return;
        }
        gmRecorder.ondataavailable = function(e) {
          if (e.data && e.data.size > 0) gmChunks.push(e.data);
        };
        gmRecorder.start(200);
        gmSetState("recording");
        // Show the small audio modal so recording is visible even on mobile.
        if (typeof window.__showAudioModal === "function") {
          window.__showAudioModal("recording", function() { gmStopAndInsert(); });
        }
      }

      async function gmStopAndInsert() {
        if (!gmRecorder || gmRecorder.state === "inactive") return;
        var target = gmLastFocus;  // Capture before async gap.
        if (typeof window.__hideAudioModal === "function") window.__hideAudioModal();
        gmRecorder.onstop = async function() {
          gmSetState("transcribing");
          var blob = new Blob(gmChunks, { type: gmMimeType });
          gmChunks = [];
          gmRecorder = null;
          gmStopStream();
          try {
            var ext = (gmMimeType || "").includes("webm") ? ".webm" : ".ogg";
            var fd = new FormData();
            fd.append("audio", blob, "gm-recording" + ext);
            var res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
            var data = await res.json();
            if (data.ok && data.text) {
              insertTextAtCursor(target || chatInput, data.text.trim());
            } else if (!data.ok) {
              console.error("[global-mic] transcription failed:", data.error);
            }
          } catch (e) {
            console.error("[global-mic] transcribe request failed:", e);
          }
          gmSetState("idle");
        };
        gmRecorder.stop();
      }

      function gmPressDown(e) {
        if (e && e.preventDefault) e.preventDefault();
        gmPressStart = Date.now();
        gmHoldTimer = setTimeout(function() {
          gmHoldMode = true;
          gmStartRecording();
        }, GM_HOLD_MS);
      }

      function gmPressUp(e) {
        if (e && e.preventDefault) e.preventDefault();
        clearTimeout(gmHoldTimer);
        var duration = Date.now() - gmPressStart;
        if (gmHoldMode) {
          gmHoldMode = false;
          gmStopAndInsert();
        } else if (duration < GM_HOLD_MS) {
          // Tap: toggle.
          if (gmRecorder && gmRecorder.state !== "inactive") {
            gmStopAndInsert();
          } else {
            gmStartRecording();
          }
        }
      }

      globalMicBtn.addEventListener("mousedown", gmPressDown);
      globalMicBtn.addEventListener("touchstart", gmPressDown, { passive: false });
      globalMicBtn.addEventListener("mouseup", gmPressUp);
      globalMicBtn.addEventListener("touchend", gmPressUp, { passive: false });
      globalMicBtn.addEventListener("mouseleave", function() {
        if (gmHoldMode) {
          gmHoldMode = false;
          clearTimeout(gmHoldTimer);
          gmStopAndInsert();
        }
      });
    })();

    // ── Schedule pause/resume/delete handlers ──
    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const pauseBtn = target.closest("[data-pause-schedule]");
      if (pauseBtn && pauseBtn instanceof HTMLButtonElement) {
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
          if (quickJobsStatus) quickJobsStatus.textContent = "Failed: " + String(err instanceof Error ? err.message : err);
        } finally {
          pauseBtn.disabled = false;
        }
        return;
      }
      const resumeBtn = target.closest("[data-resume-schedule]");
      if (resumeBtn && resumeBtn instanceof HTMLButtonElement) {
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
          if (quickJobsStatus) quickJobsStatus.textContent = "Failed: " + String(err instanceof Error ? err.message : err);
        } finally {
          resumeBtn.disabled = false;
        }
        return;
      }
      const deleteBtn = target.closest("[data-delete-schedule]");
      if (deleteBtn && deleteBtn instanceof HTMLButtonElement) {
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
          if (quickJobsStatus) quickJobsStatus.textContent = "Failed: " + String(err instanceof Error ? err.message : err);
        } finally {
          deleteBtn.disabled = false;
        }
        return;
      }
    });

    if (quickOpenCreate) {
      quickOpenCreate.addEventListener("click", () => setQuickView("create", { scroll: true, user: true }));
    }

    if (quickBackJobs) {
      quickBackJobs.addEventListener("click", () => setQuickView("jobs", { scroll: true, user: true }));
    }

    // ── Quick task create form ──
    async function populateQuickTaskDropdowns() {
      try {
        const agentsRes = await fetch("/api/agents", { cache: "no-store" });
        if (agentsRes.ok && quickTaskAgent) {
          const data = await agentsRes.json();
          const agents = Array.isArray(data.agents) ? data.agents : [];
          quickTaskAgent.innerHTML = agents
            .map((a) => '<option value="' + escAttr(a.name) + '"' + (a.name === "alice" ? " selected" : "") + '>' + esc((a.emoji ? a.emoji + " " : "") + (a.displayName || a.name)) + "</option>")
            .join("");
        }
      } catch (_) {}
    }

    function updateBriefCount() {
      if (quickTaskBrief && quickJobCount) {
        quickJobCount.textContent = String((quickTaskBrief.value || "").trim().length) + " chars";
      }
    }

    function syncScheduleSection() {
      if (!quickTaskRecurring || !quickTaskScheduleSection) return;
      quickTaskScheduleSection.classList.toggle("quick-view-hidden", !quickTaskRecurring.checked);
    }

    function syncCronIntervalSections() {
      // Interval is the default mode (id="quick-task-mode-interval" is checked by default)
      const modeIntervalEl = document.getElementById("quick-task-mode-interval");
      const isInterval = modeIntervalEl ? modeIntervalEl.checked : true;
      if (quickCronSection) quickCronSection.classList.toggle("quick-view-hidden", isInterval);
      if (quickIntervalSection) quickIntervalSection.classList.toggle("quick-view-hidden", !isInterval);
    }

    if (quickTaskBrief) quickTaskBrief.addEventListener("input", updateBriefCount);
    if (quickTaskRecurring) quickTaskRecurring.addEventListener("change", syncScheduleSection);
    if (quickTaskModeCron) quickTaskModeCron.addEventListener("change", syncCronIntervalSections);
    if (quickTaskModeInterval) quickTaskModeInterval.addEventListener("change", syncCronIntervalSections);

    syncScheduleSection();
    syncCronIntervalSections();
    populateQuickTaskDropdowns();

    if (quickJobForm && quickJobSubmit && quickJobStatus) {
      quickJobForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const agent = quickTaskAgent ? (quickTaskAgent.value || "").trim() : "alice";
        const headline = quickTaskHeadline ? (quickTaskHeadline.value || "").trim() : "";
        const brief = quickTaskBrief ? (quickTaskBrief.value || "").trim() : "";

        if (!agent || !headline || !brief) {
          quickJobStatus.textContent = "Agent, title, and description are required.";
          return;
        }

        const isRecurring = quickTaskRecurring ? quickTaskRecurring.checked : false;
        quickJobSubmit.disabled = true;
        quickJobStatus.textContent = isRecurring ? "Saving schedule…" : "Creating task…";

        try {
          if (isRecurring) {
            const modeIntervalEl = document.getElementById("quick-task-mode-interval");
            const isInterval = modeIntervalEl ? modeIntervalEl.checked : true;
            const cron = quickTaskCron ? (quickTaskCron.value || "").trim() : "";
            const intervalHours = quickTaskIntervalHours ? Number(quickTaskIntervalHours.value || "24") : 24;
            const intervalStart = quickTaskIntervalStart ? (quickTaskIntervalStart.value || "").trim() : "";

            if (!isInterval && !cron) {
              quickJobStatus.textContent = "Enter a cron expression.";
              return;
            }

            // Build the recurrence block matching createScheduledTemplate's expected shape:
            // interval mode: { interval: { start, every_hours }, enabled, skip_if_active }
            // cron mode:     { cron, enabled, skip_if_active }
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
            quickJobStatus.textContent = "Schedule created.";
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
              body: JSON.stringify({ agent, headline, kind: "other", priority: "P2", brief }),
            });
            const out = await res.json();
            if (!out.ok) throw new Error(out.error || "failed");
            quickJobStatus.textContent = "Task created.";
            if (quickJobsStatus) quickJobsStatus.textContent = "Created " + (out.id || "task");
            if (quickTaskHeadline) quickTaskHeadline.value = "";
            if (quickTaskBrief) quickTaskBrief.value = "";
            setQuickView("jobs", { scroll: true });
          }
        } catch (err) {
          quickJobStatus.textContent = "Failed: " + String(err instanceof Error ? err.message : err);
        } finally {
          quickJobSubmit.disabled = false;
        }
      });
    }

    function esc(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function escAttr(s) {
      return esc(String(s)).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    renderClock();
    setInterval(renderClock, 1000);
    setQuickView(quickView);

    loadSettings();
    // Adaptive status-dock polling. Self-scheduling (not a fixed setInterval)
    // so we can poll faster while offline and recover instantly when the tab
    // becomes visible again. Mobile freezes timers while the screen is off, so
    // after an unlock the old fixed interval could leave the dock stuck on
    // "Offline" until a throttled tick fired — the visibility/online kick
    // below fixes that.
    var STATE_POLL_OK_MS = 1000;
    var STATE_POLL_OFFLINE_MS = 400;
    var statePollTimer = null;
    function scheduleStatePoll(delay) {
      if (statePollTimer) clearTimeout(statePollTimer);
      statePollTimer = setTimeout(runStatePoll, delay);
    }
    async function runStatePoll() {
      await refreshState();
      scheduleStatePoll(stateOnline ? STATE_POLL_OK_MS : STATE_POLL_OFFLINE_MS);
    }
    function kickStatePoll() {
      // Refresh now and reset the cadence — don't wait on a throttled timer.
      scheduleStatePoll(0);
    }
    runStatePoll();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") kickStatePoll();
    });
    window.addEventListener("online", kickStatePoll);
    window.addEventListener("focus", kickStatePoll);
    // bfcache restore (mobile back/forward + some unlock paths).
    window.addEventListener("pageshow", kickStatePoll);

    // ── Chat ──
    const tabDashboardBtn = $("tab-dashboard");
    const tabChatBtn = $("tab-chat");
    const dashboardPanel = $("dashboard-panel");
    const chatPanel = $("chat-panel");
    const chatMessages = $("chat-messages");
    const chatForm = $("chat-form");
    const chatInput = $("chat-input");
    const chatSend = $("chat-send");

    var CHAT_ID_KEY = "caravel.chat.id";
    let chatHistory = [];
    let chatSessionId = localStorage.getItem(CHAT_ID_KEY) || generateChatId();
    // Expose for Vue voice island (Stage 1 port needs chatSessionId to submit to active chat)
    window.__chatSessionId = chatSessionId;
    window.__chatHistory = chatHistory;
    let chatListCache = [];
    let chatServerUpdatedAt = null;
    let chatPollTimer = null;
    var CHAT_POLL_FAST_MS = 500;
    var CHAT_POLL_IDLE_MS = 10000;

    // Agents: per-chat identity. agentsCache is the catalog from /api/agents.
    // chatAgentLocked is the agentId already persisted server-side (set once,
    // on the first user message of a new chat — immutable after that).
    // pendingAgentId is the user's picker selection for a brand-new chat that
    // hasn't been locked in yet; it's sent with the first message.
    var agentsCache = [];

    // The agent picked by default for a new chat when nothing's selected.
    // Falls back to the first agent in the catalog if this name isn't present.
    var DEFAULT_CHAT_AGENT = "alice";
    // The chat picker renders the catalog in the order /api/agents returns it
    // (the server sorts it). Each agent's emoji / displayName / description
    // come from its agents/<name>/agent.json manifest — no hardcoded roster.
    function orderedChatAgents() {
      var coord = null;
      var rest = [];
      for (var i = 0; i < agentsCache.length; i++) {
        var a = agentsCache[i];
        if (!a || !a.name) continue;
        if (a.name === DEFAULT_CHAT_AGENT) coord = a;
        else rest.push(a);
      }
      // Coordinator first (if present), then the rest in catalog order.
      return coord ? [coord].concat(rest) : rest;
    }
    // Resolve the default chat agent from the catalog (coordinator if present,
    // else the first available agent).
    function defaultChatAgentName() {
      var match = agentsCache.find(function (a) { return a.name === DEFAULT_CHAT_AGENT; });
      if (match) return match.name;
      return agentsCache.length > 0 ? agentsCache[0].name : null;
    }
    var chatAgentLocked = null;
    var pendingAgentId = null;
    var agentsFetched = false;

    function generateChatId() {
      var id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(CHAT_ID_KEY, id);
      return id;
    }

    function cleanHistory(arr) {
      if (!Array.isArray(arr)) return [];
      // Server is source of truth; render whatever it sends. We only filter
      // out old-format placeholders left behind by previous builds.
      return arr.filter(function(m) {
        if (m.role === "assistant" && m.text && m.text.startsWith("[Failed:")) return false;
        return true;
      });
    }

    function hasActiveWork() {
      for (var i = 0; i < chatHistory.length; i++) {
        var s = chatHistory[i].state;
        if (s === "pending" || s === "sent" || s === "thinking" || s === "streaming" || s === "background") {
          return true;
        }
      }
      return false;
    }

    function schedulePoll() {
      if (chatPollTimer) clearTimeout(chatPollTimer);
      var delay = hasActiveWork() ? CHAT_POLL_FAST_MS : CHAT_POLL_IDLE_MS;
      chatPollTimer = setTimeout(function() {
        pollChat().finally(schedulePoll);
      }, delay);
    }

    async function pollChat(opts) {
      if (document.visibilityState !== "visible") return;
      try {
        var force = opts && opts.force;
        var url = "/api/chats/" + encodeURIComponent(chatSessionId);
        if (chatServerUpdatedAt && !force) url += "?since=" + encodeURIComponent(chatServerUpdatedAt);
        var res = await fetch(url);
        var data = await res.json();
        if (!data || !data.ok) return;
        updateSessionBadge(data.session);
        if (data.unchanged) {
          if (data.updatedAt) chatServerUpdatedAt = data.updatedAt;
          return;
        }
        if (data.chat && data.chat.messages) {
          chatHistory = cleanHistory(data.chat.messages);
          chatServerUpdatedAt = data.chat.updatedAt || chatServerUpdatedAt;
          if (data.chat.agentId && chatAgentLocked !== data.chat.agentId) {
            chatAgentLocked = data.chat.agentId;
            updateAgentBadge();
            updateSendDisabled();
          }
          renderChatHistory();
          // Voice mode: speak assistant reply, streaming chunk-by-chunk as it arrives.
          if (typeof window.__vmOnAssistantChunk === "function") {
            var lastMsg = chatHistory[chatHistory.length - 1];
            if (lastMsg && lastMsg.role === "assistant" && lastMsg.text) {
              var st = lastMsg.state;
              var isDone = !st || st === "done";
              if (isDone || st === "streaming") {
                window.__vmOnAssistantChunk(lastMsg.text, isDone);
              }
            }
          }
        }
      } catch (_) {}
    }

    async function loadChatFromServer() {
      try {
        var res = await fetch("/api/chats/" + encodeURIComponent(chatSessionId));
        var data = await res.json();
        if (data.ok && data.chat) {
          chatServerUpdatedAt = data.chat.updatedAt || null;
          chatHistory = cleanHistory(data.chat.messages || []);
          chatAgentLocked = data.chat.agentId || null;
          renderChatHistory();
          updateAgentBadge();
          updateSendDisabled();
        }
        if (data && data.ok) updateSessionBadge(data.session);
      } catch (_) {}
    }

    var lastSessionInfo = null;

    function updateSessionBadge(session) {
      lastSessionInfo = session || null;
      var el = $("chat-session-badge");
      if (!el) return;
      if (typeof debugEnabled !== "undefined" && !debugEnabled) {
        el.hidden = true;
        return;
      }
      var chatFp = chatSessionId ? chatSessionId.slice(0, 8) : "";
      if (!session || !session.sessionId) {
        el.hidden = false;
        el.textContent = "thread " + chatFp + " · no session yet";
        el.title = "No Claude session has been created for this chat yet. Send a message to spawn one.";
        el.dataset.sessionId = "";
        return;
      }
      var sidFp = session.sessionId.slice(0, 8);
      var turns = typeof session.turnCount === "number" ? session.turnCount : 0;
      el.hidden = false;
      el.textContent = "thread " + chatFp + " → " + sidFp + " · " + turns + " turn" + (turns === 1 ? "" : "s");
      el.title = "thread: " + chatSessionId + "\nsession: " + session.sessionId + "\n(click to copy session id)";
      el.dataset.sessionId = session.sessionId;
    }

    // Populate the "new task" target <select> from the live agent catalog so
    // it reflects whatever agents/<name>/ profiles exist — no hardcoded list.
    function populateTaskTargetSelect() {
      var sel = $("multi-agent-new-to");
      if (!sel) return;
      var prev = sel.value;
      var ordered = orderedChatAgents();
      var html = "";
      for (var i = 0; i < ordered.length; i++) {
        var a = ordered[i];
        var label = (a.emoji ? a.emoji + " " : "") + (a.displayName || a.name);
        html += '<option value="' + escAttr(a.name) + '">' + esc(label) + '</option>';
      }
      sel.innerHTML = html;
      if (prev) sel.value = prev;
    }

    async function loadAgents() {
      try {
        var res = await fetch("/api/agents");
        var data = await res.json();
        if (data && data.ok && Array.isArray(data.agents)) {
          agentsCache = data.agents;
        }
      } catch (_) {}
      agentsFetched = true;
      // Default pendingAgentId to the coordinator when nothing's picked yet
      // and the chat hasn't locked one in.
      if (!pendingAgentId && !chatAgentLocked) {
        pendingAgentId = defaultChatAgentName();
      }
      // Populate the "new task" target dropdown from the live catalog.
      populateTaskTargetSelect();
      renderChatHistory();
      updateAgentBadge();
    }

    function findAgent(id) {
      if (!id) return null;
      for (var i = 0; i < agentsCache.length; i++) {
        if (agentsCache[i].name === id) return agentsCache[i];
      }
      return null;
    }

    function effectiveAgentId() {
      return chatAgentLocked || pendingAgentId || null;
    }

    function agentPicked() {
      // True once an agent is either locked in on the server or selected in
      // the picker. Send button is blocked until this is true. If no agent
      // profiles exist in this project, the picker is skipped entirely and
      // the chat runs as a single default agent (old behaviour).
      if (agentsFetched && agentsCache.length === 0) return true;
      return !!(chatAgentLocked || pendingAgentId);
    }

    function updateAgentBadge() {
      var el = $("chat-agent-badge");
      var id = effectiveAgentId();
      var agent = findAgent(id);
      if (chatInput) {
        chatInput.placeholder = agent ? "Message " + agent.displayName + "..." : "Message...";
      }
      if (!el) return;
      if (!agent) {
        el.hidden = true;
        el.textContent = "";
        el.title = "";
        el.dataset.locked = "";
        return;
      }
      el.hidden = false;
      el.textContent = (agent.emoji ? agent.emoji + " " : "") + agent.displayName;
      el.title = agent.description + (chatAgentLocked ? " (locked for this chat)" : " (not yet locked — send first message to confirm)");
      el.dataset.locked = chatAgentLocked ? "1" : "0";
    }

    function updateSendDisabled() {
      if (!chatSend) return;
      chatSend.disabled = !agentPicked();
    }

    async function loadChatList() {
      try {
        var res = await fetch("/api/chats");
        var data = await res.json();
        if (data.ok && Array.isArray(data.chats)) {
          chatListCache = data.chats;
          renderChatList();
        }
      } catch (_) {}
    }

    function renderChatList() {
      var listEl = $("chat-history-list");
      if (!listEl) return;
      listEl.textContent = "";
      if (!chatListCache.length) {
        var empty = document.createElement("div");
        empty.className = "chat-history-empty";
        empty.textContent = "No saved chats";
        listEl.appendChild(empty);
        return;
      }
      for (var i = 0; i < chatListCache.length; i++) {
        var chat = chatListCache[i];
        var isActive = chat.id === chatSessionId;
        var row = document.createElement("div");
        row.className = "chat-history-row" + (isActive ? " chat-history-row-active" : "");
        row.dataset.chatId = chat.id;

        var item = document.createElement("button");
        item.className = "chat-history-item" + (isActive ? " chat-history-active" : "");
        item.type = "button";
        item.dataset.chatId = chat.id;
        var preview = document.createElement("span");
        preview.className = "chat-history-preview";
        var agentForRow = findAgent(chat.agentId);
        var prefix = agentForRow && agentForRow.emoji ? agentForRow.emoji + " " : "";
        preview.textContent = prefix + (chat.name || chat.preview || "(empty)");
        var meta = document.createElement("span");
        meta.className = "chat-history-meta";
        var d = new Date(chat.updatedAt);
        meta.textContent = chat.messageCount + " msgs \u00b7 " + d.toLocaleDateString();
        item.appendChild(preview);
        item.appendChild(meta);
        item.addEventListener("click", (function(id) {
          return function() { switchToChat(id); };
        })(chat.id));
        row.appendChild(item);

        var renameBtn = document.createElement("button");
        renameBtn.className = "chat-history-rename-btn";
        renameBtn.type = "button";
        renameBtn.title = chat.name ? "Rename chat" : "Name this chat";
        renameBtn.setAttribute("aria-label", renameBtn.title);
        renameBtn.textContent = "\u270f\ufe0f";
        renameBtn.addEventListener("click", (function(c) {
          return function(ev) {
            ev.stopPropagation();
            beginInlineRename(c);
          };
        })(chat));
        row.appendChild(renameBtn);

        if (isActive) {
          var syncBtn = document.createElement("button");
          syncBtn.className = "chat-history-sync-btn";
          syncBtn.type = "button";
          syncBtn.title = "Force resync from server";
          syncBtn.setAttribute("aria-label", "Force resync from server");
          syncBtn.textContent = "\u21bb";
          syncBtn.addEventListener("click", function(ev) {
            ev.stopPropagation();
            pollChat({ force: true });
          });
          row.appendChild(syncBtn);
        }

        listEl.appendChild(row);
      }
    }

    function beginInlineRename(chat) {
      var listEl = $("chat-history-list");
      if (!listEl) return;
      var row = listEl.querySelector('.chat-history-row[data-chat-id="' + chat.id + '"]');
      if (!row || row.querySelector(".chat-history-rename-input")) return;

      var item = row.querySelector(".chat-history-item");
      if (!item) return;
      item.style.display = "none";

      var input = document.createElement("input");
      input.type = "text";
      input.className = "chat-history-rename-input";
      input.value = chat.name || "";
      input.placeholder = chat.preview || "Chat name";
      input.maxLength = 80;

      var commit = function(save) {
        if (!input.parentNode) return;
        input.disabled = true;
        if (save) {
          var name = input.value.trim();
          submitChatRename(chat.id, name).then(function() { loadChatList(); });
        } else {
          input.remove();
          item.style.display = "";
        }
      };

      input.addEventListener("keydown", function(ev) {
        if (ev.key === "Enter") { ev.preventDefault(); commit(true); }
        else if (ev.key === "Escape") { ev.preventDefault(); commit(false); }
      });
      input.addEventListener("blur", function() { commit(true); });

      row.insertBefore(input, row.firstChild);
      input.focus();
      input.select();
    }

    async function submitChatRename(id, name) {
      try {
        await fetch("/api/chats/" + encodeURIComponent(id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name }),
        });
      } catch (_) {}
    }

    async function switchToChat(id) {
      chatSessionId = id;
      window.__chatSessionId = id;
      localStorage.setItem(CHAT_ID_KEY, id);
      chatServerUpdatedAt = null;
      chatAgentLocked = null;
      pendingAgentId = null;
      var fetchedName = "";
      var fetchedPreview = "";
      try {
        var res = await fetch("/api/chats/" + encodeURIComponent(id));
        var data = await res.json();
        if (data.ok && data.chat) {
          chatHistory = cleanHistory(data.chat.messages);
          chatServerUpdatedAt = data.chat.updatedAt || null;
          chatAgentLocked = data.chat.agentId || null;
          fetchedName = data.chat.name || "";
          fetchedPreview = data.chat.preview || "";
        } else {
          chatHistory = [];
        }
      } catch (_) {
        chatHistory = [];
      }
      // Freshly-opened chat with no lock-in: default the picker to the coordinator.
      if (!chatAgentLocked && !pendingAgentId && agentsCache.length > 0) {
        pendingAgentId = defaultChatAgentName();
      }
      updateAgentBadge();
      updateChatNameInput(fetchedName, fetchedPreview);
      updateSendDisabled();
      renderChatHistory();
      schedulePoll();
      var dropdown = $("chat-history-dropdown");
      if (dropdown) dropdown.hidden = true;
      loadChatList();
    }

    // Reflect the current chat's name into the inline toolbar input AND
    // the new-chat-area title input. The toolbar one is shown for chats
    // with messages; the new-chat one is shown for empty chats. Both
    // commit via submitChatRename on blur or Enter.
    //
    // Kelly 2026-05-20: the toolbar's placeholder shows what the chat
    // WOULD auto-name to (chat.preview or "Untitled chat") rather than
    // the literal word "auto", so it reads like a suggestion.
    function updateChatNameInput(name, preview) {
      var toolbar = $("chat-name-input");
      var inline = $("chat-new-title-input");
      var autoSuggestion = (preview ? String(preview).trim().slice(0, 50) : "") || "Untitled chat";
      if (toolbar) {
        toolbar.value = name || "";
        toolbar.dataset.committed = name || "";
        toolbar.setAttribute("placeholder", autoSuggestion);
      }
      if (inline) {
        inline.value = name || "";
        inline.dataset.committed = name || "";
      }
      refreshChatTitleVisibility();
    }

    // Toolbar input shown for existing chats; new-chat input shown for
    // empty chats. Called from updateChatNameInput and after every
    // renderChatHistory so the visibility tracks chatHistory.length.
    function refreshChatTitleVisibility() {
      var toolbar = $("chat-name-input");
      var inline = $("chat-new-title-input");
      var isEmpty = !chatHistory || chatHistory.length === 0;
      if (toolbar) toolbar.hidden = isEmpty;
      if (inline) inline.hidden = !isEmpty;
    }

    function startNewChat() {
      chatSessionId = generateChatId();
      chatHistory = [];
      chatServerUpdatedAt = null;
      chatAgentLocked = null;
      pendingAgentId = null;
      if (agentsCache.length > 0) {
        pendingAgentId = defaultChatAgentName();
      }
      updateAgentBadge();
      updateChatNameInput("");
      updateSendDisabled();
      renderChatHistory();
      schedulePoll();
      var dropdown = $("chat-history-dropdown");
      if (dropdown) dropdown.hidden = true;
      loadChatList();
    }

    // Load agents first so the picker has data when the empty state renders,
    // then pull chat state from the server.
    loadAgents().then(function() {
      return loadChatFromServer();
    }).finally(schedulePoll);

    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") pollChat();
    });

    function setActiveTab(tab) {
      const allBtns = [tabDashboardBtn, tabChatBtn];
      const allPanels = [dashboardPanel, chatPanel];
      const filesBtn = $("tab-files");
      const filesPnl = $("files-panel");
      const tasksBtn = $("tab-tasks");
      const tasksPnl = $("tasks-panel");
      if (filesBtn) allBtns.push(filesBtn);
      if (filesPnl) allPanels.push(filesPnl);
      if (tasksBtn) allBtns.push(tasksBtn);
      if (tasksPnl) allPanels.push(tasksPnl);
      allBtns.forEach(b => { if (b) { b.classList.remove("tab-btn-active"); b.setAttribute("aria-selected", "false"); } });
      allPanels.forEach(p => { if (p) p.hidden = true; });
      // Voice-mode dock button only makes sense on the chat tab, and requires mic to be enabled.
      var gvm = $("global-voice-mode");
      if (gvm) gvm.hidden = (tab !== "chat") || (window.__micEnabled === false);

      if (tab === "dashboard") {
        tabDashboardBtn && tabDashboardBtn.classList.add("tab-btn-active");
        tabDashboardBtn && tabDashboardBtn.setAttribute("aria-selected", "true");
        if (dashboardPanel) dashboardPanel.hidden = false;
      } else if (tab === "chat") {
        tabChatBtn && tabChatBtn.classList.add("tab-btn-active");
        tabChatBtn && tabChatBtn.setAttribute("aria-selected", "true");
        if (chatPanel) chatPanel.hidden = false;
        if (chatInput) chatInput.focus();
        requestAnimationFrame(function() {
          if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        });
      } else if (tab === "files") {
        if (filesBtn) { filesBtn.classList.add("tab-btn-active"); filesBtn.setAttribute("aria-selected", "true"); }
        if (filesPnl) filesPnl.hidden = false;
      } else if (tab === "tasks") {
        if (tasksBtn) { tasksBtn.classList.add("tab-btn-active"); tasksBtn.setAttribute("aria-selected", "true"); }
        if (tasksPnl) tasksPnl.hidden = false;
        if (typeof window.__ensureTasksLoaded === "function") window.__ensureTasksLoaded();
      }
      if (typeof window.__updateSpeakerDisabled === "function") window.__updateSpeakerDisabled();
    }

    if (tabDashboardBtn) tabDashboardBtn.addEventListener("click", () => {
      window.__taskBackContext = null;
      if (typeof window.__renderFilesBackButton === "function") window.__renderFilesBackButton();
      setActiveTab("dashboard");
    });
    if (tabChatBtn) tabChatBtn.addEventListener("click", () => setActiveTab("chat"));
    var tabTasksBtn = $("tab-tasks");
    if (tabTasksBtn) tabTasksBtn.addEventListener("click", () => setActiveTab("tasks"));

    // Right-pane (embed) defaults to the chat tab so split view opens
    // straight into a second chat instead of a duplicate dashboard.
    if (embedMode) setActiveTab("chat");

    renderChatHistory();

    function createChatEmptyState() {
      var empty = document.createElement("div");
      empty.className = "chat-empty";

      if (!agentsFetched) {
        empty.textContent = "Loading agents…";
        return empty;
      }
      if (agentsCache.length === 0) {
        // No agents/ directory in this project — fall back to the pre-multi-agent
        // empty state. Runner will use the project CLAUDE.md as before.
        empty.textContent = "Send a message to start chatting with the daemon.";
        return empty;
      }

      var head = document.createElement("div");
      head.className = "chat-picker-head";
      head.textContent = "Pick an agent to start this chat";
      empty.appendChild(head);

      var sub = document.createElement("div");
      sub.className = "chat-picker-sub";
      sub.textContent = "Agent is locked once you send the first message.";
      empty.appendChild(sub);

      var list = document.createElement("div");
      list.className = "chat-picker-list";
      var orderedAgents = orderedChatAgents();
      for (var i = 0; i < orderedAgents.length; i++) {
        (function(agent) {
          var item = document.createElement("button");
          item.type = "button";
          item.className = "chat-picker-item";
          if (pendingAgentId === agent.name) item.classList.add("chat-picker-item-active");

          var title = document.createElement("div");
          title.className = "chat-picker-item-title";
          var nameLabel = agent.displayName || agent.name;
          title.textContent =
            (agent.emoji ? agent.emoji + " " : "") +
            nameLabel;
          item.appendChild(title);

          var desc = document.createElement("div");
          desc.className = "chat-picker-item-desc";
          desc.textContent = agent.description;
          item.appendChild(desc);

          item.addEventListener("click", function() {
            pendingAgentId = agent.name;
            updateAgentBadge();
            updateSendDisabled();
            // Toggle the active class directly — renderChatHistory skips
            // rebuilding the empty state when one already exists, so re-
            // rendering wouldn't paint the picked item's -active styling.
            var items = list.querySelectorAll(".chat-picker-item");
            for (var j = 0; j < items.length; j++) {
              items[j].classList.toggle("chat-picker-item-active", items[j] === item);
            }
            // Refresh the picker actions (enable the "Set a task" button now
            // that an agent is selected).
            updatePickerActions();
          });

          list.appendChild(item);
        })(orderedAgents[i]);
      }
      empty.appendChild(list);

      // Task creation lives in the Tasks panel now — chat is for chat.
      function updatePickerActions() { /* no-op kept for the click handler above */ }

      return empty;
    }

    function createChatMessageEl() {
      var msgEl = document.createElement("div");
      var roleEl = document.createElement("div");
      roleEl.className = "chat-msg-role";
      var textEl = document.createElement("div");
      textEl.className = "chat-msg-text";
      msgEl.appendChild(roleEl);
      msgEl.appendChild(textEl);
      return msgEl;
    }

    function syncChatMessageEl(msgEl, msg) {
      var roleEl = msgEl.querySelector(".chat-msg-role");
      var textEl = msgEl.querySelector(".chat-msg-text");
      if (!roleEl || !textEl) {
        msgEl.textContent = "";
        roleEl = document.createElement("div");
        roleEl.className = "chat-msg-role";
        textEl = document.createElement("div");
        textEl.className = "chat-msg-text";
        msgEl.appendChild(roleEl);
        msgEl.appendChild(textEl);
      }

      var isUser = msg.role === "user";
      var state = msg.state || (isUser ? "sent" : "done");

      var cls = "chat-msg " + (isUser ? "chat-msg-user" : "chat-msg-assistant");
      if (state === "streaming") cls += " chat-msg-streaming";
      if (state === "error") cls += " chat-msg-error";
      if (isUser && state === "pending") cls += " chat-msg-user-pending";
      msgEl.className = cls;

      roleEl.textContent = "";
      var roleText = document.createElement("span");
      roleText.className = "chat-msg-role-label";
      roleText.textContent = isUser ? "You" : "Claude";
      roleEl.appendChild(roleText);
      if (isUser && state === "pending") {
        var pill = document.createElement("span");
        pill.className = "chat-msg-pill";
        pill.textContent = "queued";
        roleEl.appendChild(pill);
      }

      textEl.innerHTML = renderMarkdown(msg.text || "");

      var existingMeta = msgEl.querySelectorAll(".chat-msg-meta");
      for (var k = 0; k < existingMeta.length; k++) existingMeta[k].remove();

      if (!isUser) {
        var metaLabel = null;
        var metaClass = "";
        if (state === "thinking") {
          metaClass = "chat-msg-thinking";
          metaLabel = "thinking\u2026";
        } else if (state === "background") {
          metaClass = "chat-msg-background";
          metaLabel = "\u2699 working in background\u2026";
        }
        if (metaLabel) {
          var meta = document.createElement("div");
          meta.className = "chat-msg-meta " + metaClass;
          var labelSpan = document.createElement("span");
          labelSpan.className = "chat-msg-meta-label";
          labelSpan.textContent = metaLabel;
          meta.appendChild(labelSpan);
          var stopBtn = document.createElement("button");
          stopBtn.type = "button";
          stopBtn.className = "chat-msg-stop-inline";
          stopBtn.title = "Stop this response";
          stopBtn.setAttribute("aria-label", "Stop this response");
          stopBtn.textContent = "stop";
          stopBtn.addEventListener("click", function() {
            stopBtn.disabled = true;
            interruptCurrent({ sendAfter: true });
          });
          meta.appendChild(stopBtn);
          msgEl.appendChild(meta);
        }

        var isActive =
          state === "thinking" || state === "streaming" || state === "background";
        msgEl.dataset.active = isActive ? "1" : "0";
      }
    }

    function updateChatTaskBtnVisibility() {
      // Chat-pane "+ Task" button retired — task creation now lives in the
      // dedicated Tasks panel. Function preserved as a no-op so callers
      // (renderChatHistory) don't need to be touched.
    }

    function renderChatHistory() {
      if (typeof window.__updateSpeakerDisabled === "function") window.__updateSpeakerDisabled();
      updateChatTaskBtnVisibility();
      // Title-input visibility tracks chatHistory.length (toolbar input
      // for chats with messages, inline new-chat input for empty chats).
      if (typeof refreshChatTitleVisibility === "function") refreshChatTitleVisibility();
      if (!chatMessages) return;
      if (!chatHistory.length) {
        if (
          chatMessages.children.length !== 1 ||
          !chatMessages.firstElementChild ||
          !chatMessages.firstElementChild.classList.contains("chat-empty")
        ) {
          chatMessages.textContent = "";
          chatMessages.appendChild(createChatEmptyState());
        }
        return;
      }

      if (chatMessages.firstElementChild && chatMessages.firstElementChild.classList.contains("chat-empty")) {
        chatMessages.textContent = "";
      }

      var msgEls = chatMessages.querySelectorAll(".chat-msg");
      for (var i = 0; i < chatHistory.length; i++) {
        var msgEl = msgEls[i];
        if (!msgEl) {
          msgEl = createChatMessageEl();
          chatMessages.appendChild(msgEl);
        }
        syncChatMessageEl(msgEl, chatHistory[i]);
      }

      var allMsgEls = chatMessages.querySelectorAll(".chat-msg");
      for (var j = allMsgEls.length - 1; j >= chatHistory.length; j--) {
        allMsgEls[j].remove();
      }

      updateInterruptBtn();

      requestAnimationFrame(function() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      });
    }

    function updateInterruptBtn() {
      var btn = $("chat-interrupt");
      if (!btn) return;
      // Only show interrupt when there's a live assistant run to interrupt.
      // Pending/sent user messages aren't interruptible — they haven't started.
      var live = false;
      for (var i = 0; i < chatHistory.length; i++) {
        var m = chatHistory[i];
        if (m.role !== "assistant") continue;
        var s = m.state;
        if (s === "thinking" || s === "streaming" || s === "background") {
          live = true;
          break;
        }
      }
      btn.hidden = !live;
      if (live) btn.disabled = false;
    }

    function autoResizeChatInput() {
      if (!chatInput) return;
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
    }

    async function sendChat() {
      if (!chatInput) return;
      var message = (chatInput.value || "").trim();
      if (!message) return;
      // Guard: block send until an agent is picked. With the picker rendered
      // as empty state, this should only bite if the user pastes into the
      // textarea before clicking an agent.
      if (!agentPicked()) return;

      chatInput.value = "";
      autoResizeChatInput();

      chatHistory.push({ role: "user", text: message, state: "pending" });
      // Optimistically lock the agent client-side so the picker disappears
      // before the server round-trip completes.
      if (!chatAgentLocked && pendingAgentId) {
        chatAgentLocked = pendingAgentId;
        updateAgentBadge();
        updateSendDisabled();
      }
      renderChatHistory();

      var payload = { message: message, chatId: chatSessionId };
      if (!chatAgentLocked && pendingAgentId) payload.agentId = pendingAgentId;
      else if (chatAgentLocked) payload.agentId = chatAgentLocked;
      else if (pendingAgentId) payload.agentId = pendingAgentId;

      try {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (_) {
        // Network failed — the server-side processor is still the source of truth.
        // The next poll will reconcile whatever state actually exists.
      }
      pollChat().finally(schedulePoll);
      if (chatInput) chatInput.focus();
    }

    if (chatForm) {
      chatForm.addEventListener("submit", function(e) {
        e.preventDefault();
        sendChat();
      });
    }

    var chatDeleteBtn = $("chat-delete");
    if (chatDeleteBtn) {
      chatDeleteBtn.addEventListener("click", async function() {
        // Empty chat (no messages yet) — no server file to delete, just reset.
        if (!chatSessionId || chatHistory.length === 0) {
          startNewChat();
          return;
        }
        var n = chatHistory.length;
        var suffix = n === 1 ? " message" : " messages";
        if (!window.confirm("Delete this chat? " + n + suffix + " will be permanently removed.")) {
          return;
        }
        var idToDelete = chatSessionId;
        try {
          await fetch("/api/chats/" + encodeURIComponent(idToDelete), { method: "DELETE" });
        } catch (_) {
          // Server error is non-fatal — still clear client state so the user
          // isn't stuck staring at a chat they just tried to delete.
        }
        startNewChat();
      });
    }

    // Chat name inputs — TWO surfaces (Kelly 2026-05-20):
    //   - toolbar input (#chat-name-input), shown for chats with messages.
    //   - new-chat-area input (#chat-new-title-input), shown for empty
    //     chats. Sits above the message input box.
    // Both commit via submitChatRename on blur or Enter, sync each other
    // via updateChatNameInput, and skip the PATCH when value is unchanged.
    function wireChatNameInput(el, peerSel) {
      if (!el) return;
      el.dataset.committed = el.value || "";
      var commit = function () {
        var v = (el.value || "").trim();
        if (!chatSessionId) return;
        if (v === (el.dataset.committed || "")) return;
        el.dataset.committed = v;
        // Mirror into the peer so both inputs read the same when the user
        // toggles between empty and populated states later.
        var peer = peerSel ? document.querySelector(peerSel) : null;
        if (peer) { peer.value = v; peer.dataset.committed = v; }
        submitChatRename(chatSessionId, v).then(function () { loadChatList(); }).catch(function () {});
      };
      el.addEventListener("blur", commit);
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          commit();
          el.blur();
        }
      });
    }
    wireChatNameInput($("chat-name-input"), "#chat-new-title-input");
    wireChatNameInput($("chat-new-title-input"), "#chat-name-input");

    var chatSessionBadge = $("chat-session-badge");
    if (chatSessionBadge) {
      chatSessionBadge.addEventListener("click", function() {
        var sid = chatSessionBadge.dataset.sessionId || "";
        if (!sid) return;
        try { navigator.clipboard.writeText(sid); } catch (_) {}
        var original = chatSessionBadge.textContent;
        chatSessionBadge.textContent = "copied";
        setTimeout(function() { chatSessionBadge.textContent = original; }, 900);
      });
    }

    var chatHistoryBtn = $("chat-history-btn");
    var chatHistoryDropdown = $("chat-history-dropdown");
    if (chatHistoryBtn && chatHistoryDropdown) {
      chatHistoryBtn.addEventListener("click", function() {
        var showing = !chatHistoryDropdown.hidden;
        chatHistoryDropdown.hidden = showing;
        if (!showing) loadChatList();
      });
      // Close dropdown when clicking outside
      document.addEventListener("click", function(e) {
        if (!chatHistoryDropdown.hidden && !chatHistoryBtn.contains(e.target) && !chatHistoryDropdown.contains(e.target)) {
          chatHistoryDropdown.hidden = true;
        }
      });
    }

    var chatNewBtn = $("chat-new-btn");
    if (chatNewBtn) {
      chatNewBtn.addEventListener("click", function() {
        startNewChat();
      });
    }

    if (chatInput) {
      chatInput.addEventListener("input", autoResizeChatInput);
    }

    var chatCancelBtn = $("chat-cancel");
    if (chatCancelBtn) chatCancelBtn.hidden = true;

    async function interruptCurrent(opts) {
      var sendAfter = !!(opts && opts.sendAfter);
      try {
        await fetch("/api/chat/interrupt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: chatSessionId }),
        });
      } catch (_) {}
      if (sendAfter && chatInput && (chatInput.value || "").trim()) {
        await sendChat();
      } else {
        await pollChat();
      }
      schedulePoll();
    }

    var chatInterruptBtn = $("chat-interrupt");
    if (chatInterruptBtn) {
      chatInterruptBtn.addEventListener("click", function() {
        chatInterruptBtn.disabled = true;
        interruptCurrent({ sendAfter: true });
      });
    }

    // ── Voice Recording ──
    var chatMicBtn = $("chat-mic");
    (function() {
      if (!chatMicBtn) return;

      // Feature detection — hide button if recording isn't available.
      var micSupported = !!(
        typeof MediaRecorder !== "undefined" &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia
      );
      var micMimeType = null;
      if (micSupported) {
        var candidates = [
          "audio/ogg;codecs=opus",
          "audio/ogg",
          "audio/webm;codecs=opus",
          "audio/webm",
        ];
        for (var ci = 0; ci < candidates.length; ci++) {
          if (MediaRecorder.isTypeSupported(candidates[ci])) {
            micMimeType = candidates[ci];
            break;
          }
        }
        if (!micMimeType) micSupported = false;
      }

      if (!micSupported) {
        chatMicBtn.hidden = true;
        return;
      }

      var micRecorder = null;
      var micChunks = [];
      var micStream = null;

      function setMicState(state) {
        chatMicBtn.classList.remove("recording", "transcribing");
        chatMicBtn.disabled = false;
        if (state === "recording") {
          chatMicBtn.classList.add("recording");
          chatMicBtn.textContent = "⏹";
          chatMicBtn.title = "Stop recording";
          chatMicBtn.setAttribute("aria-label", "Stop recording");
        } else if (state === "transcribing") {
          chatMicBtn.classList.add("transcribing");
          chatMicBtn.textContent = "⏳";
          chatMicBtn.title = "Transcribing…";
          chatMicBtn.setAttribute("aria-label", "Transcribing");
          chatMicBtn.disabled = true;
        } else {
          chatMicBtn.textContent = "🎤";
          chatMicBtn.title = "Record voice message";
          chatMicBtn.setAttribute("aria-label", "Record");
        }
      }

      function stopMicStream() {
        if (micStream) {
          micStream.getTracks().forEach(function(t) { t.stop(); });
          micStream = null;
        }
      }

      function setMicError(msg) {
        chatMicBtn.classList.remove("recording", "transcribing");
        chatMicBtn.disabled = false;
        chatMicBtn.textContent = "❌";
        chatMicBtn.title = msg;
        chatMicBtn.setAttribute("aria-label", msg);
        setTimeout(function() { setMicState("idle"); }, 3500);
      }

      function stopAndTranscribe() {
        if (!micRecorder || micRecorder.state === "inactive") return;
        micRecorder.onstop = async function() {
          setMicState("transcribing");
          var blob = new Blob(micChunks, { type: micMimeType });
          micChunks = [];
          micRecorder = null;
          stopMicStream();
          var errored = false;
          try {
            var ext = (micMimeType || "").includes("webm") ? ".webm" : ".ogg";
            var fd = new FormData();
            fd.append("audio", blob, "recording" + ext);
            var res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
            var data = await res.json();
            if (data.ok && data.text && chatInput) {
              chatInput.value = data.text;
              autoResizeChatInput();
              chatInput.focus();
            } else if (!data.ok) {
              console.error("[voice] transcription failed:", data.error);
              setMicError(data.error ? "Voice error: " + data.error : "Transcription failed");
              errored = true;
            }
          } catch (err) {
            console.error("[voice] transcribe request failed:", err);
            setMicError("Voice request failed");
            errored = true;
          }
          if (!errored) setMicState("idle");
        };
        micRecorder.stop();
      }

      chatMicBtn.addEventListener("click", async function() {
        if (micRecorder && micRecorder.state !== "inactive") {
          stopAndTranscribe();
          return;
        }
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          console.error("[voice] getUserMedia failed:", err);
          return;
        }
        micChunks = [];
        try {
          micRecorder = new MediaRecorder(micStream, { mimeType: micMimeType });
        } catch (err) {
          console.error("[voice] MediaRecorder init failed:", err);
          stopMicStream();
          return;
        }
        micRecorder.ondataavailable = function(e) {
          if (e.data && e.data.size > 0) micChunks.push(e.data);
        };
        micRecorder.start(1000);
        setMicState("recording");
      });
    })();

    // ── Voice Mode (DeepGram TTS + auto-submit) ──
    (function() {
      var voiceModeOverlay = $("voice-mode-overlay");
      var voiceModeCloseBtn = $("voice-mode-close");
      var voiceModeBtn = $("voice-mode-btn");
      var voiceModeStatus = $("voice-mode-status");
      var voiceModeTranscript = $("voice-mode-transcript");
      var voiceModeToggle = $("global-voice-mode");

      if (!voiceModeOverlay || !voiceModeBtn || !voiceModeToggle) return;

      var vmActive = false;
      var vmRecorder = null;
      var vmChunks = [];
      var vmStream = null;
      var vmMimeType = null;
      var vmBusy = false;
      var vmCurrentAudio = null;
      var vmAudioQueue = [];
      var vmQueueRunning = false;
      var vmQueueGen = 0;
      var vmTurnCursor = 0;
      var vmSpokenChunks = [];

      // Feature detect recording support (reuse same candidates as main mic).
      var vmSupported = !!(
        typeof MediaRecorder !== "undefined" &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia
      );
      if (vmSupported) {
        var vmCandidates = [
          "audio/ogg;codecs=opus", "audio/ogg",
          "audio/webm;codecs=opus", "audio/webm",
        ];
        for (var vi = 0; vi < vmCandidates.length; vi++) {
          if (MediaRecorder.isTypeSupported(vmCandidates[vi])) {
            vmMimeType = vmCandidates[vi];
            break;
          }
        }
        if (!vmMimeType) vmSupported = false;
      }

      // Expose TTS playback functions for the global read-aloud button.
      // Placed before the vmSupported guard so they're available even when
      // MediaRecorder isn't supported (TTS only needs fetch + Audio).
      window.__vmEnqueueChunk = vmEnqueueChunk;
      window.__vmExtractChunks = vmExtractChunks;
      window.__vmStripMarkdown = vmStripMarkdown;
      window.__vmStopAudio = vmStopAudio;
      window.__vmIsPlaying = function() { return vmQueueRunning; };

      // Hide the toggle if recording isn't available.
      if (!vmSupported) {
        voiceModeToggle.hidden = true;
        return;
      }

      function vmSetStatus(text, btnClass) {
        voiceModeStatus.textContent = text;
        voiceModeBtn.classList.remove("listening", "processing", "speaking");
        if (btnClass) voiceModeBtn.classList.add(btnClass);
      }

      function vmSetTranscript(html) {
        voiceModeTranscript.innerHTML = html;
      }

      function vmStopStream() {
        if (vmStream) {
          vmStream.getTracks().forEach(function(t) { t.stop(); });
          vmStream = null;
        }
      }

      function vmStopAudio() {
        vmQueueGen++;
        vmSpokenChunks = [];
        if (vmCurrentAudio) {
          vmCurrentAudio.pause();
          vmCurrentAudio.src = "";
          vmCurrentAudio = null;
        }
        vmAudioQueue = [];
        vmQueueRunning = false;
      }

      // Strip markdown symbols before sending text to DeepGram TTS.
      function vmStripMarkdown(text) {
        return text
          .replace(/```[\s\S]*?```/g, "")
          .replace(/`[^`]+`/g, "")
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/^#{1,6}\s+/gm, "")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/^[-*+]\s+/gm, "")
          .replace(/^\d+\.\s+/gm, "")
          .replace(/^>\s+/gm, "")
          .replace(/~~([^~]+)~~/g, "$1")
          .replace(/__([^_]+)__/g, "$1")
          .replace(/_([^_]+)_/g, "$1")
          .replace(/\|/g, "  ")
          .replace(/^[-:|]+$/gm, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      // Extract speakable chunks from pending text.
      // A block is "complete" when it is followed by a \n\n separator (the server
      // emits one per progress block) or when isDone=true (flush everything).
      // Within a complete block longer than 250 chars, split at sentence terminators.
      // During streaming, the last block may be incomplete — only dispatch sentences
      // within it that end with ". " "! " or "? ".
      function vmExtractChunks(pending, isDone) {
        var chunks = [];
        var consumed = 0;
        var blocks = pending.split(/(\n\n+)/);
        var pos = 0;
        for (var b = 0; b < blocks.length; b++) {
          var part = blocks[b];
          if (/^\n\n+$/.test(part)) {
            pos += part.length;
            continue;
          }
          var hasTrailingSep = (b + 1 < blocks.length) && /^\n\n+$/.test(blocks[b + 1]);
          var isComplete = hasTrailingSep || isDone;
          if (isComplete) {
            var trimmed = part.trim();
            if (trimmed.length > 250) {
              var re = /[.!?]\s+/g;
              var m;
              var sentStart = 0;
              while ((m = re.exec(trimmed)) !== null) {
                var end = m.index + m[0].length;
                var sent = trimmed.slice(sentStart, end).trim();
                if (sent) chunks.push(sent);
                sentStart = end;
              }
              var tail = trimmed.slice(sentStart).trim();
              if (tail) chunks.push(tail);
            } else if (trimmed) {
              chunks.push(trimmed);
            }
            pos += part.length;
            consumed = pos;
          } else {
            // Incomplete last block — only dispatch complete sentences
            var re2 = /[.!?]\s+/g;
            var m2;
            var sentStart2 = 0;
            var lastSentEnd = 0;
            while ((m2 = re2.exec(part)) !== null) {
              var end2 = m2.index + m2[0].length;
              var sent2 = part.slice(sentStart2, end2).trim();
              if (sent2) chunks.push(sent2);
              sentStart2 = end2;
              lastSentEnd = end2;
            }
            consumed = pos + lastSentEnd;
            break;
          }
        }
        return { chunks: chunks, consumed: consumed };
      }

      // Render the accumulated spoken chunks to the transcript area.
      // The last chunk is styled as "active" (currently speaking); prior chunks are dimmed.
      function vmRenderTranscript() {
        if (!vmSpokenChunks.length) { voiceModeTranscript.innerHTML = ""; return; }
        var html = "";
        for (var i = 0; i < vmSpokenChunks.length; i++) {
          var isActive = i === vmSpokenChunks.length - 1;
          html += '<div class="vm-reply' + (isActive ? " vm-active" : "") + '">' + esc(vmSpokenChunks[i]) + "</div>";
        }
        voiceModeTranscript.innerHTML = html;
        voiceModeTranscript.scrollTop = voiceModeTranscript.scrollHeight;
      }

      // Sequential audio queue runner. Plays clips in submission order, one at a time.
      // Uses vmQueueGen as a cancellation token — incremented by vmStopAudio() on barge-in.
      // Each queued item is {audio, url, text}; audio may be null if TTS fetch failed.
      async function vmRunQueue(gen) {
        if (vmQueueRunning) return;
        vmQueueRunning = true;
        while (vmAudioQueue.length > 0 && gen === vmQueueGen) {
          var item = await vmAudioQueue.shift();
          if (gen !== vmQueueGen) {
            if (item && item.url) URL.revokeObjectURL(item.url);
            continue;
          }
          if (!item) continue;  // fully stale (promise resolved null before gen bump)
          // Reveal this chunk's text in the transcript as it begins playing.
          if (vmActive) { vmSpokenChunks.push(item.text); vmRenderTranscript(); }
          if (!item.audio) {
            // TTS fetch failed — text is shown, move on without waiting.
            continue;
          }
          if (vmActive) vmSetStatus("Speaking…", "speaking");
          if (typeof window.__vmOnSpeaking === "function") window.__vmOnSpeaking();
          vmCurrentAudio = item.audio;
          await new Promise(function(resolve) {
            item.audio.onended = function() {
              URL.revokeObjectURL(item.url);
              vmCurrentAudio = null;
              resolve();
            };
            item.audio.onerror = function() {
              URL.revokeObjectURL(item.url);
              vmCurrentAudio = null;
              resolve();
            };
            item.audio.play().catch(function(e) {
              console.error("[voice-mode] audio play failed:", e);
              URL.revokeObjectURL(item.url);
              vmCurrentAudio = null;
              resolve();
            });
          });
        }
        if (gen === vmQueueGen) {
          vmQueueRunning = false;
          vmBusy = false;
          if (vmActive) vmSetStatus("Press and hold to talk", null);
          if (typeof window.__vmOnQueueEnd === "function") window.__vmOnQueueEnd();
        }
      }

      // Fetch TTS for one chunk and push the result Promise to the queue.
      // Each item resolves to {audio, url, text} — audio/url may be null if the fetch fails,
      // but text is always carried through so the transcript can advance even on error.
      function vmEnqueueChunk(chunkText) {
        var stripped = vmStripMarkdown(chunkText).trim();
        if (!stripped) return;
        var displayText = chunkText.trim();  // original (unstripped) for transcript display
        var gen = vmQueueGen;
        var p = fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: stripped }),
        }).then(function(res) {
          if (gen !== vmQueueGen) return null;  // stale — discard entirely
          if (!res.ok) {
            return res.json().catch(function() { return {}; }).then(function(err) {
              var detail = err.error || ("HTTP " + res.status);
              console.error("[voice-mode] TTS chunk error:", detail);
              if (gen === vmQueueGen) vmSetStatus("Voice playback failed — " + detail, null);
              return { audio: null, url: null, text: displayText };
            });
          }
          return res.blob().then(function(blob) {
            if (gen !== vmQueueGen) return null;
            var url = URL.createObjectURL(blob);
            return { audio: new Audio(url), url: url, text: displayText };
          });
        }).catch(function(e) {
          console.error("[voice-mode] TTS chunk fetch failed:", e);
          return { audio: null, url: null, text: displayText };
        });
        vmAudioQueue.push(p);
        if (!vmQueueRunning) vmRunQueue(vmQueueGen);
      }

      // Called from pollChat on each poll that sees assistant text (streaming or done).
      // Tracks a cursor (vmTurnCursor) so only newly arrived text is dispatched.
      function vmOnAssistantChunk(fullText, isDone) {
        if (!vmActive) return;
        if (!fullText) return;
        // Safety: if text shrank (shouldn't happen mid-turn), reset
        if (fullText.length < vmTurnCursor) {
          vmTurnCursor = 0;
          vmStopAudio();
        }
        var pending = fullText.slice(vmTurnCursor);
        if (!pending) return;
        var result = vmExtractChunks(pending, isDone);
        if (result.consumed > 0) vmTurnCursor += result.consumed;
        for (var i = 0; i < result.chunks.length; i++) {
          var chunk = result.chunks[i].trim();
          if (chunk) vmEnqueueChunk(chunk);
        }
        if (result.chunks.length) vmBusy = true;
      }

      window.__vmOnAssistantChunk = vmOnAssistantChunk;

      async function vmRecordAndSubmit() {
        if (vmBusy) return;
        vmBusy = true;
        vmStopAudio();
        vmSetStatus("Requesting microphone…", null);
        try {
          vmStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          console.error("[voice-mode] getUserMedia failed:", e);
          vmSetStatus("Microphone unavailable", null);
          vmBusy = false;
          return;
        }
        vmChunks = [];
        try {
          vmRecorder = new MediaRecorder(vmStream, { mimeType: vmMimeType });
        } catch (e) {
          console.error("[voice-mode] MediaRecorder init failed:", e);
          vmStopStream();
          vmSetStatus("Press and hold to talk", null);
          vmBusy = false;
          return;
        }
        vmRecorder.ondataavailable = function(e) {
          if (e.data && e.data.size > 0) vmChunks.push(e.data);
        };
        vmSetStatus("Listening… (release to send)", "listening");
        vmSetTranscript("");
        voiceModeBtn.textContent = "⏹";
        vmRecorder.start(200);
      }

      async function vmStopAndSubmit() {
        if (!vmRecorder || vmRecorder.state === "inactive") return;
        vmRecorder.onstop = async function() {
          voiceModeBtn.textContent = "🎤";
          vmSetStatus("Transcribing…", "processing");
          var blob = new Blob(vmChunks, { type: vmMimeType });
          vmChunks = [];
          vmRecorder = null;
          vmStopStream();
          var text = "";
          try {
            var ext = (vmMimeType || "").includes("webm") ? ".webm" : ".ogg";
            var fd = new FormData();
            fd.append("audio", blob, "vm-recording" + ext);
            var res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
            var data = await res.json();
            if (data.ok && data.text) {
              text = data.text.trim();
            } else {
              console.error("[voice-mode] transcription failed:", data.error);
              vmSetStatus("Transcription failed — try again", null);
              vmBusy = false;
              return;
            }
          } catch (e) {
            console.error("[voice-mode] transcribe request failed:", e);
            vmSetStatus("Request failed — try again", null);
            vmBusy = false;
            return;
          }
          if (!text) {
            vmSetStatus("Nothing heard — try again", null);
            vmBusy = false;
            return;
          }
          vmSetTranscript('<div class="vm-heard">"' + esc(text) + '"</div>');
          vmSetStatus("Sending…", "processing");
          // Auto-submit without review: put text into chatInput and call sendChat.
          if (chatInput) {
            chatInput.value = text;
            autoResizeChatInput();
          }
          try {
            await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: text,
                chatId: chatSessionId,
                agentId: chatAgentLocked || pendingAgentId || undefined,
              }),
            });
            if (chatInput) { chatInput.value = ""; autoResizeChatInput(); }
            chatHistory.push({ role: "user", text: text, state: "pending" });
            if (!chatAgentLocked && pendingAgentId) {
              chatAgentLocked = pendingAgentId;
              updateAgentBadge();
              updateSendDisabled();
            }
            renderChatHistory();
            vmTurnCursor = 0;   // Reset cursor — new assistant turn begins
            vmSpokenChunks = []; // Clear accumulated transcript for new turn
          } catch (e) {
            console.error("[voice-mode] chat send failed:", e);
          }
          vmSetStatus("Waiting for reply…", "processing");
          // vmBusy stays true; vmOnAssistantChunk clears it when the queue drains.
        };
        vmRecorder.stop();
      }

      // Tap = toggle (click to start, click to stop).
      // Hold (≥250ms) = push-to-talk (record while held, submit on release).
      var VM_HOLD_MS = 250;
      var vmPressStart = 0;
      var vmHoldMode = false;
      var vmHoldTimer = null;

      function vmPressDown(e) {
        if (e && e.preventDefault) e.preventDefault();
        vmPressStart = Date.now();
        vmHoldTimer = setTimeout(function() {
          vmHoldMode = true;
          if (!vmBusy && (!vmRecorder || vmRecorder.state === "inactive")) {
            vmRecordAndSubmit();
          }
        }, VM_HOLD_MS);
      }

      function vmPressUp(e) {
        if (e && e.preventDefault) e.preventDefault();
        clearTimeout(vmHoldTimer);
        var duration = Date.now() - vmPressStart;
        if (vmHoldMode) {
          vmHoldMode = false;
          if (vmRecorder && vmRecorder.state !== "inactive") vmStopAndSubmit();
        } else if (duration < VM_HOLD_MS) {
          // Tap: toggle record.
          if (vmRecorder && vmRecorder.state !== "inactive") {
            vmStopAndSubmit();
          } else if (!vmBusy) {
            vmRecordAndSubmit();
          }
        }
      }

      voiceModeBtn.addEventListener("mousedown", vmPressDown);
      voiceModeBtn.addEventListener("touchstart", vmPressDown, { passive: false });
      voiceModeBtn.addEventListener("mouseup", vmPressUp);
      voiceModeBtn.addEventListener("touchend", vmPressUp, { passive: false });
      voiceModeBtn.addEventListener("mouseleave", function() {
        // If dragged out while in hold mode, stop recording.
        if (vmHoldMode) {
          vmHoldMode = false;
          clearTimeout(vmHoldTimer);
          if (vmRecorder && vmRecorder.state !== "inactive") vmStopAndSubmit();
        }
      });

      function vmOpen() {
        vmActive = true;
        voiceModeOverlay.hidden = false;
        vmSetStatus("Press and hold to talk", null);
        vmSetTranscript("");
        vmSpokenChunks = [];
        vmBusy = false;
        voiceModeBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        // Prime cursor to skip any assistant text already in history when voice mode opens.
        vmTurnCursor = 0;
        if (typeof chatHistory !== "undefined" && chatHistory.length) {
          var last = chatHistory[chatHistory.length - 1];
          if (last && last.role === "assistant" && last.text) vmTurnCursor = last.text.length;
        }
      }

      function vmClose() {
        vmActive = false;
        voiceModeOverlay.hidden = true;
        vmStopStream();
        vmStopAudio();
        vmBusy = false;
        if (vmRecorder && vmRecorder.state !== "inactive") {
          vmRecorder.stop();
          vmRecorder = null;
        }
      }

      voiceModeToggle.addEventListener("click", function() {
        if (vmActive) vmClose(); else vmOpen();
      });
      voiceModeCloseBtn.addEventListener("click", vmClose);
    })();

    // ── Voice Task button — opens Vue island Stage 2 task creator ──
    (function() {
      var voiceTaskBtn = $("global-voice-task");
      if (!voiceTaskBtn) return;
      voiceTaskBtn.addEventListener("click", function() {
        document.dispatchEvent(new CustomEvent("voice:open-task-creator"));
      });
      // Show once island is ready (same mic-enabled guard as walkie-talkie)
      function applyVoiceTaskVisibility() {
        voiceTaskBtn.hidden = window.__micEnabled === false;
      }
      document.addEventListener("voice:island-ready", applyVoiceTaskVisibility);
      applyVoiceTaskVisibility();
    })();

    // ── Global read-aloud button ──
    (function() {
      var speakerBtn = $("global-speaker");
      if (!speakerBtn) return;

      var sbPlaying = false;

      function setSpeakerState(playing) {
        sbPlaying = playing;
        speakerBtn.classList.toggle("is-playing", playing);
        speakerBtn.title = playing ? "Stop reading" : "Read page aloud";
        speakerBtn.setAttribute("aria-label", playing ? "Stop reading" : "Read page aloud");
        speakerBtn.innerHTML = playing
          ? '<i class="fa-solid fa-stop"></i>'
          : '<i class="fa-solid fa-volume-high"></i>';
        if (playing) {
          if (typeof window.__showAudioModal === "function") {
            window.__showAudioModal("playing", function() {
              if (typeof window.__vmStopAudio === "function") window.__vmStopAudio();
              window.__vmOnSpeaking = null;
              window.__vmOnQueueEnd = null;
              setSpeakerState(false);
            });
          }
        } else {
          if (typeof window.__hideAudioModal === "function") window.__hideAudioModal();
        }
      }

      // Strip YAML frontmatter (--- ... ---) from the start of a string.
      function stripFrontmatter(text) {
        return text.replace(/^---[\r\n][\s\S]*?[\r\n]---[\r\n]?/, "").trim();
      }

      // Resolve the primary readable text for the currently visible panel.
      function resolveReadAloudText() {
        var chatPnl = $("chat-panel");
        var filesPnl = $("files-panel");
        var tasksPnl = $("tasks-panel");

        if (chatPnl && !chatPnl.hidden) {
          // Last assistant message with a done (or absent) state.
          for (var i = chatHistory.length - 1; i >= 0; i--) {
            var m = chatHistory[i];
            if (m.role === "assistant") {
              var s = m.state;
              if (!s || s === "done") return m.text || null;
            }
          }
          return null;
        }

        if (filesPnl && !filesPnl.hidden) {
          var fc = $("files-content");
          if (fc) {
            var txt = (fc.innerText || "").trim();
            // Skip placeholder/error/loading states.
            if (txt && !/^(Select a file|Loading\.|Error:)/.test(txt)) {
              return stripFrontmatter(txt) || null;
            }
          }
          return null;
        }

        if (tasksPnl && !tasksPnl.hidden) {
          var tv = $("tasks-viewer");
          var tb = $("tasks-viewer-body");
          if (tv && !tv.hidden && tb) {
            var txt2 = (tb.innerText || "").trim();
            if (txt2 && !/^Loading task/.test(txt2)) return stripFrontmatter(txt2) || null;
          }
          return null;
        }

        return null;
      }

      function updateSpeakerDisabled() {
        if (!sbPlaying) speakerBtn.disabled = !resolveReadAloudText();
      }
      window.__updateSpeakerDisabled = updateSpeakerDisabled;
      updateSpeakerDisabled();

      speakerBtn.addEventListener("click", function() {
        // Toggle off if already playing.
        var isPlaying = sbPlaying || (typeof window.__vmIsPlaying === "function" && window.__vmIsPlaying());
        if (isPlaying) {
          if (typeof window.__vmStopAudio === "function") window.__vmStopAudio();
          window.__vmOnSpeaking = null;
          window.__vmOnQueueEnd = null;
          setSpeakerState(false);
          return;
        }

        if (typeof window.__vmEnqueueChunk !== "function") return;  // TTS not available

        var text = resolveReadAloudText();
        if (!text) return;  // nothing sensible in view

        // Stop any in-flight voice-mode or previous speaker audio.
        if (typeof window.__vmStopAudio === "function") window.__vmStopAudio();

        // Set up playback callbacks before enqueuing so they're in place
        // when the first clip fires (queue is async).
        window.__vmOnSpeaking = function() { setSpeakerState(true); };
        window.__vmOnQueueEnd = function() {
          setSpeakerState(false);
          window.__vmOnSpeaking = null;
          window.__vmOnQueueEnd = null;
        };

        // Text is fully available — extract all chunks at once (isDone=true).
        var enqueued = 0;
        if (typeof window.__vmExtractChunks === "function") {
          var result = window.__vmExtractChunks(text, true);
          if (result && result.chunks) {
            for (var i = 0; i < result.chunks.length; i++) {
              var chunk = result.chunks[i].trim();
              if (chunk) { window.__vmEnqueueChunk(chunk); enqueued++; }
            }
          }
        } else {
          window.__vmEnqueueChunk(text);
          enqueued = 1;
        }

        if (enqueued > 0) {
          setSpeakerState(true);
        } else {
          // Nothing enqueued (empty extract) — clear callbacks and stay idle.
          window.__vmOnSpeaking = null;
          window.__vmOnQueueEnd = null;
        }
      });
    })();

    // ── Files ──
    const tabFilesBtn = $("tab-files");
    const filesPanel = $("files-panel");
    const filesList = $("files-list");
    const filesContent = $("files-content");
    const filesBreadcrumb = $("files-breadcrumb");
    const filesBranchSelect = $("files-branch-select");
    const filesNavBack = $("files-nav-back");
    const filesNavForward = $("files-nav-forward");
    const filesPickerToggle = $("files-picker-toggle");
    const filesPickerToggleLabel = $("files-picker-toggle-label");
    const filesSidebar = $("files-sidebar");
    let filesCurrentDir = ".";
    let filesActiveFile = "";
    let filesLoaded = false;
    let filesActiveRepoRoot = ".";
    let filesHeadBranch = "";
    let filesSelectedBranch = "";
    let filesHasRepo = false;
    var filesHistory = [];
    var filesHistoryIdx = -1;
    var filesSkipHistoryPush = false;

    // Kelly 2026-05-25: the picker-collapse layout is now driven by
    // container queries on the panel itself, not viewport media queries
    // (so split-screen / sidebar-mode browsers collapse correctly even
    // when the OS viewport is wide). Mirror that here by reading the
    // panel's actual width. Falls back to viewport when no panel found.
    function isPanelNarrow(panelId, threshold) {
      var el = document.getElementById(panelId);
      if (el && el.clientWidth > 0) return el.clientWidth <= threshold;
      return typeof window.matchMedia === "function"
        && window.matchMedia("(max-width: " + threshold + "px)").matches;
    }
    function isMobileFiles() {
      return isPanelNarrow("files-panel", 1199);
    }

    function setPickerCollapsed(collapsed) {
      if (!filesSidebar || !filesPickerToggle) return;
      filesSidebar.classList.toggle("files-sidebar-collapsed", collapsed);
      filesPickerToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }

    function updatePickerToggleLabel() {
      if (!filesPickerToggleLabel) return;
      if (filesActiveFile) {
        var parts = filesActiveFile.split("/");
        filesPickerToggleLabel.textContent = parts[parts.length - 1] || "Browse files";
      } else if (filesCurrentDir && filesCurrentDir !== ".") {
        var dParts = filesCurrentDir.split("/");
        filesPickerToggleLabel.textContent = "Browse: " + (dParts[dParts.length - 1] || filesCurrentDir);
      } else {
        filesPickerToggleLabel.textContent = "Browse files";
      }
    }

    if (tabFilesBtn) {
      tabFilesBtn.addEventListener("click", function() {
        setActiveTab("files");
        if (!filesLoaded) {
          filesLoaded = true;
          refreshBranchSelector().then(function() {
            loadDirectory(".");
          });
        }
      });
    }

    function fmtSize(bytes) {
      if (bytes == null) return "";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function fileIcon(entry) {
      if (entry.type === "directory") return "\ud83d\udcc1";
      var ext = (entry.name.match(/\.([^.]+)$/) || [])[1] || "";
      ext = ext.toLowerCase();
      if (ext === "md" || ext === "markdown" || ext === "mdx") return "\ud83d\udcdd";
      if (ext === "ts" || ext === "js" || ext === "mjs") return "\ud83d\udce6";
      if (ext === "json") return "\ud83d\udccb";
      if (ext === "sh" || ext === "bash") return "\u2699\ufe0f";
      if (ext === "yml" || ext === "yaml") return "\ud83d\udcd1";
      if (["png","jpg","jpeg","gif","webp","svg","bmp","ico","avif"].indexOf(ext) !== -1) return "\ud83d\uddbc\ufe0f";
      return "\ud83d\udcc4";
    }

    function applyRepoVisibility(hasRepo) {
      filesHasRepo = !!hasRepo;
      if (filesBranchSelect) filesBranchSelect.hidden = !filesHasRepo;
      if (!filesHasRepo) {
        filesSelectedBranch = "";
        filesHeadBranch = "";
      }
    }

    async function refreshBranchSelector() {
      if (!filesBranchSelect) return;
      try {
        var res = await fetch("/api/git/branches?path=" + encodeURIComponent(filesCurrentDir || "."));
        var data = await res.json();
        if (!data.ok) {
          filesBranchSelect.innerHTML = "";
          applyRepoVisibility(false);
          return;
        }
        applyRepoVisibility(data.hasRepo !== false && (data.branches || []).length > 0);
        if (!filesHasRepo) {
          filesBranchSelect.innerHTML = "";
          return;
        }
        filesActiveRepoRoot = data.root || ".";
        filesHeadBranch = data.current || "";
        if (!filesSelectedBranch) filesSelectedBranch = filesHeadBranch;

        var opts = [];
        var hasSelected = false;
        for (var i = 0; i < data.branches.length; i++) {
          var b = data.branches[i];
          var label = b === filesHeadBranch ? b + " (current)" : b;
          var sel = (b === filesSelectedBranch) ? ' selected' : '';
          if (b === filesSelectedBranch) hasSelected = true;
          opts.push('<option value="' + esc(b) + '"' + sel + '>' + esc(label) + '</option>');
        }
        if (!hasSelected && filesSelectedBranch) {
          opts.unshift('<option value="' + esc(filesSelectedBranch) + '" selected>' + esc(filesSelectedBranch) + '</option>');
        }
        filesBranchSelect.innerHTML = opts.join("");
        filesBranchSelect.title = "Repo: " + (data.rootLabel || data.root || "~");
      } catch (_) {
        filesBranchSelect.innerHTML = "";
        applyRepoVisibility(false);
      }
    }

    function pushHistory(dir, file) {
      if (filesSkipHistoryPush) return;
      var last = filesHistory[filesHistoryIdx];
      if (last && last.dir === dir && last.file === file) return;
      filesHistory = filesHistory.slice(0, filesHistoryIdx + 1);
      filesHistory.push({ dir: dir, file: file });
      filesHistoryIdx = filesHistory.length - 1;
      updateNavButtons();
    }

    function updateNavButtons() {
      if (filesNavBack) filesNavBack.disabled = filesHistoryIdx <= 0;
      if (filesNavForward) filesNavForward.disabled = filesHistoryIdx < 0 || filesHistoryIdx >= filesHistory.length - 1;
    }

    async function goToHistory(delta) {
      var next = filesHistoryIdx + delta;
      if (next < 0 || next >= filesHistory.length) return;
      filesHistoryIdx = next;
      var entry = filesHistory[next];
      filesSkipHistoryPush = true;
      try {
        await loadDirectory(entry.dir);
        if (entry.file) await loadFile(entry.file);
      } finally {
        filesSkipHistoryPush = false;
      }
      updateNavButtons();
    }

    if (filesNavBack) filesNavBack.addEventListener("click", function() { goToHistory(-1); });
    if (filesNavForward) filesNavForward.addEventListener("click", function() { goToHistory(1); });

    if (filesBranchSelect) {
      filesBranchSelect.addEventListener("change", function() {
        filesSelectedBranch = filesBranchSelect.value || "";
        loadDirectory(filesCurrentDir);
      });
    }

    function renderBreadcrumb(dirPath) {
      if (!filesBreadcrumb) return;
      filesBreadcrumb.textContent = "";

      var rootBtn = document.createElement("button");
      rootBtn.textContent = "~";
      rootBtn.addEventListener("click", function() { loadDirectory("."); });
      filesBreadcrumb.appendChild(rootBtn);

      if (dirPath && dirPath !== ".") {
        var parts = dirPath.split("/");
        for (var i = 0; i < parts.length; i++) {
          var sep = document.createElement("span");
          sep.textContent = " / ";
          filesBreadcrumb.appendChild(sep);

          var partBtn = document.createElement("button");
          partBtn.textContent = parts[i];
          var partPath = parts.slice(0, i + 1).join("/");
          partBtn.addEventListener("click", (function(p) {
            return function() { loadDirectory(p); };
          })(partPath));
          filesBreadcrumb.appendChild(partBtn);
        }
      }
    }

    async function loadDirectory(dirPath) {
      filesCurrentDir = dirPath || ".";
      filesActiveFile = "";
      pushHistory(filesCurrentDir, "");
      renderBreadcrumb(filesCurrentDir);
      updatePickerToggleLabel();
      setPickerCollapsed(false);

      if (!filesList) return;
      filesList.innerHTML = '<div class="files-loading">Loading...</div>';
      if (filesContent) filesContent.innerHTML = '<div class="files-empty">Select a file to view</div>';

      try {
        var url = "/api/files/list?path=" + encodeURIComponent(filesCurrentDir);
        if (filesSelectedBranch) url += "&branch=" + encodeURIComponent(filesSelectedBranch);
        var res = await fetch(url);
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "failed");

        applyRepoVisibility(data.hasRepo);
        if (data.root && data.root !== filesActiveRepoRoot) {
          filesActiveRepoRoot = data.root;
          filesSelectedBranch = "";
          if (filesHasRepo) await refreshBranchSelector();
        } else if (!filesActiveRepoRoot) {
          filesActiveRepoRoot = data.root || ".";
          if (filesHasRepo) await refreshBranchSelector();
        }
        filesHeadBranch = data.current || "";

        if (!data.entries.length) {
          filesList.innerHTML = '<div class="files-loading">Empty directory</div>';
          return;
        }

        filesList.textContent = "";
        for (var i = 0; i < data.entries.length; i++) {
          var entry = data.entries[i];
          var item = document.createElement("button");
          item.className = "files-item";
          item.dataset.path = entry.path;
          item.dataset.type = entry.type;

          var icon = document.createElement("span");
          icon.className = "files-item-icon";
          icon.textContent = fileIcon(entry);
          item.appendChild(icon);

          var name = document.createElement("span");
          name.className = "files-item-name";
          name.textContent = entry.name + (entry.isSymlink ? " \u2197" : "");
          if (entry.isSymlink) name.title = "symlink";
          item.appendChild(name);

          if (entry.type === "file" && entry.size != null) {
            var size = document.createElement("span");
            size.className = "files-item-size";
            size.textContent = fmtSize(entry.size);
            item.appendChild(size);
          }

          item.addEventListener("click", (function(e) {
            return function() {
              if (e.type === "directory") {
                loadDirectory(e.path);
              } else {
                loadFile(e.path);
              }
            };
          })(entry));

          filesList.appendChild(item);
        }
      } catch (err) {
        filesList.innerHTML = '<div class="files-loading">Error: ' + esc(String(err instanceof Error ? err.message : err)) + '</div>';
      }
    }

    async function loadFile(filePath) {
      filesActiveFile = filePath;
      pushHistory(filesCurrentDir, filePath);
      updatePickerToggleLabel();
      if (isMobileFiles()) setPickerCollapsed(true);

      // Highlight active file in sidebar
      if (filesList) {
        var items = filesList.querySelectorAll(".files-item");
        for (var i = 0; i < items.length; i++) {
          items[i].classList.toggle("files-item-active", items[i].dataset.path === filePath);
        }
      }

      if (!filesContent) return;

      // Image files: render an <img> from the raw-bytes endpoint. The JSON
      // text reader below can't carry binary, so images route here first.
      if (isImageFile(filePath)) {
        renderImageFile(filePath);
        if (typeof window.__updateSpeakerDisabled === "function") window.__updateSpeakerDisabled();
        return;
      }

      filesContent.innerHTML = '<div class="files-loading">Loading...</div>';

      try {
        var url = "/api/files/read?path=" + encodeURIComponent(filePath);
        if (filesSelectedBranch) url += "&branch=" + encodeURIComponent(filesSelectedBranch);
        var res = await fetch(url);
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "failed");

        filesContent.textContent = "";
        if (data.markdown) {
          // Detect + strip YAML frontmatter so the marked renderer doesn't
          // treat the `---` pair as horizontal-rule + paragraph + hr.
          // Frontmatter renders as a small monospace block above the body.
          // Mirror of the task-report panel's frontmatter handling.
          var fmHtml = "";
          var rawSrc = data.content || "";
          var bodySrc = rawSrc;
          var fmMatch = rawSrc.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
          if (fmMatch) {
            fmHtml = '<pre class="files-md-frontmatter">' + escHtml(fmMatch[1]) + '</pre>';
            bodySrc = rawSrc.slice(fmMatch[0].length);
          }
          var div = document.createElement("div");
          div.className = "files-md";
          div.innerHTML = fmHtml + renderMarkdown(bodySrc);
          filesContent.appendChild(div);
        } else if (isYaml(filePath) && typeof globalThis.yamlRender === 'function') {
          var ydiv = document.createElement("div");
          ydiv.className = "files-yaml";
          ydiv.innerHTML = globalThis.yamlRender(data.content);
          filesContent.appendChild(ydiv);
        } else {
          var lang = detectLang(filePath);
          if (lang) {
            var pre = document.createElement("pre");
            pre.className = "files-code";
            var code = document.createElement("code");
            code.innerHTML = highlightCode(data.content, lang);
            pre.appendChild(code);
            filesContent.appendChild(pre);
          } else {
            var raw = document.createElement("pre");
            raw.className = "files-raw";
            raw.textContent = data.content;
            filesContent.appendChild(raw);
          }
        }
      } catch (err) {
        filesContent.innerHTML = '<div class="files-empty">Error: ' + esc(String(err instanceof Error ? err.message : err)) + '</div>';
      }
      if (typeof window.__updateSpeakerDisabled === "function") window.__updateSpeakerDisabled();
    }

    function detectLang(filePath) {
      var ext = (filePath.match(/\.([^./]+)$/) || [])[1] || "";
      ext = ext.toLowerCase();
      if (ext === "json") return "json";
      if (ext === "js" || ext === "mjs" || ext === "cjs" || ext === "ts" || ext === "tsx" || ext === "jsx") return "js";
      if (ext === "py") return "py";
      if (ext === "vue") return "vue";
      if (ext === "html" || ext === "htm") return "html";
      if (ext === "css" || ext === "scss" || ext === "sass" || ext === "less") return "css";
      return "";
    }

    function isYaml(filePath) {
      var ext = (filePath.match(/\.([^./]+)$/) || [])[1] || "";
      ext = ext.toLowerCase();
      return ext === "yaml" || ext === "yml";
    }

    function isImageFile(filePath) {
      var ext = (filePath.match(/\.([^./]+)$/) || [])[1] || "";
      ext = ext.toLowerCase();
      return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"].indexOf(ext) !== -1;
    }

    // Render an image into the Files content pane with zoom + pan. Pixel art
    // (small natural size) starts integer-upscaled and pixel-rendered so it's
    // crisp; photos start fit-to-width. Zoom via the +/−/Fit/1:1 buttons or
    // the mouse wheel (cursor-anchored); pan by dragging when zoomed past the
    // viewport. A toggle flips pixelated/smooth; a checkerboard backs alpha.
    function renderImageFile(filePath) {
      if (!filesContent) return;
      var url = "/api/files/raw?path=" + encodeURIComponent(filePath);
      if (filesSelectedBranch) url += "&branch=" + encodeURIComponent(filesSelectedBranch);

      filesContent.textContent = "";
      var wrap = document.createElement("div");
      wrap.className = "files-image-view";

      // Toolbar: dimensions/zoom readout + zoom controls + pixelated toggle.
      var meta = document.createElement("div");
      meta.className = "files-image-meta";
      var info = document.createElement("span");
      info.className = "files-image-info";
      info.textContent = "Loading…";
      function mkBtn(label, title) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "files-image-toggle";
        b.textContent = label;
        if (title) b.title = title;
        return b;
      }
      var zoomOutBtn = mkBtn("−", "Zoom out (or scroll down)");
      var zoomLevel = document.createElement("span");
      zoomLevel.className = "files-image-zoom";
      zoomLevel.textContent = "—";
      var zoomInBtn = mkBtn("+", "Zoom in (or scroll up)");
      var fitBtn = mkBtn("Fit", "Fit to width");
      var oneBtn = mkBtn("1:1", "Actual pixels");
      var toggle = mkBtn("Pixelated: on", "Toggle crisp / smooth scaling");
      meta.appendChild(info);
      meta.appendChild(zoomOutBtn);
      meta.appendChild(zoomLevel);
      meta.appendChild(zoomInBtn);
      meta.appendChild(fitBtn);
      meta.appendChild(oneBtn);
      meta.appendChild(toggle);

      var imgWrap = document.createElement("div");
      imgWrap.className = "files-image-canvas";
      var img = document.createElement("img");
      img.className = "files-image is-pixelated";
      img.alt = filePath;

      // scale = display pixels per image pixel. natural dims captured on load.
      var natW = 0, natH = 0, scale = 1, pixelated = true, loaded = false;
      var MIN_SCALE = 0.05, MAX_SCALE = 64;

      function clamp(s) { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)); }

      function apply() {
        if (!natW) return;
        img.style.width = Math.max(1, Math.round(natW * scale)) + "px";
        img.style.height = Math.max(1, Math.round(natH * scale)) + "px";
        var pct = scale >= 1 ? ("×" + (Math.round(scale * 100) / 100)) : (Math.round(scale * 100) + "%");
        zoomLevel.textContent = pct;
        info.textContent = natW + " × " + natH + " px";
      }

      function fitScale() {
        var avail = (imgWrap.clientWidth || 400) - 24; // minus padding
        if (!natW) return 1;
        return natW <= avail ? defaultScale() : avail / natW;
      }
      function defaultScale() {
        // Pixel-art: integer upscale toward ~384px. Photo: 1:1 (fit handles big).
        if (natW <= 512) return Math.max(1, Math.floor(384 / natW));
        return 1;
      }

      // Zoom keeping the point under the cursor (cx,cy in canvas client coords)
      // stationary. factor multiplies the current scale.
      function zoomAt(factor, cx, cy) {
        if (!natW) return;
        var prev = scale;
        scale = clamp(scale * factor);
        if (scale === prev) return;
        var rect = imgWrap.getBoundingClientRect();
        // position within the scrollable content, at the cursor
        var px = imgWrap.scrollLeft + (cx - rect.left);
        var py = imgWrap.scrollTop + (cy - rect.top);
        var ratio = scale / prev;
        apply();
        imgWrap.scrollLeft = px * ratio - (cx - rect.left);
        imgWrap.scrollTop = py * ratio - (cy - rect.top);
      }
      function zoomCenter(factor) {
        var rect = imgWrap.getBoundingClientRect();
        zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
      }

      zoomInBtn.addEventListener("click", function () { zoomCenter(1.25); });
      zoomOutBtn.addEventListener("click", function () { zoomCenter(1 / 1.25); });
      oneBtn.addEventListener("click", function () { var p = scale; scale = clamp(1); if (scale !== p) apply(); });
      fitBtn.addEventListener("click", function () { scale = clamp(fitScale()); apply(); imgWrap.scrollTop = 0; imgWrap.scrollLeft = 0; });
      toggle.addEventListener("click", function () {
        pixelated = !pixelated;
        img.classList.toggle("is-pixelated", pixelated);
        toggle.textContent = "Pixelated: " + (pixelated ? "on" : "off");
      });

      // Wheel zoom, anchored at the cursor. Plain wheel zooms (no modifier
      // needed) since the canvas is a dedicated viewer; preventDefault stops
      // the page from scrolling under it.
      imgWrap.addEventListener("wheel", function (ev) {
        if (!loaded) return;
        ev.preventDefault();
        var factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
        zoomAt(factor, ev.clientX, ev.clientY);
      }, { passive: false });

      // Pointer handling: 1 pointer = drag-to-pan, 2 pointers = pinch-zoom
      // (anchored at the pinch midpoint) + two-finger pan. Works for mouse,
      // touch, and pen via Pointer Events; the canvas sets touch-action:none
      // so the browser doesn't claim the gesture for native scroll/zoom.
      var pointers = new Map(); // pointerId -> { x, y }
      var panActive = false, panSL = 0, panST = 0, panSX = 0, panSY = 0;
      var pinchPrevDist = 0, pinchPrevMid = null;

      function ptList() { return Array.prototype.slice.call(pointers.values()); }
      function pinchMid() { var p = ptList(); return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; }
      function pinchSpread() { var p = ptList(); return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }

      function startPan(x, y) {
        panActive = true; panSX = x; panSY = y;
        panSL = imgWrap.scrollLeft; panST = imgWrap.scrollTop;
        imgWrap.classList.add("is-grabbing");
      }

      imgWrap.addEventListener("pointerdown", function (ev) {
        if (!loaded) return;
        pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        try { imgWrap.setPointerCapture(ev.pointerId); } catch (_) {}
        if (pointers.size === 1) {
          startPan(ev.clientX, ev.clientY);
        } else if (pointers.size === 2) {
          // Entering pinch — stop single-finger pan, seed the baselines.
          panActive = false;
          imgWrap.classList.remove("is-grabbing");
          pinchPrevDist = pinchSpread();
          pinchPrevMid = pinchMid();
        }
      });

      imgWrap.addEventListener("pointermove", function (ev) {
        if (!pointers.has(ev.pointerId)) return;
        pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pointers.size >= 2) {
          ev.preventDefault();
          var dist = pinchSpread();
          var mid = pinchMid();
          if (pinchPrevDist > 0 && dist > 0) {
            zoomAt(dist / pinchPrevDist, mid.x, mid.y);   // scale about the pinch centre
            if (pinchPrevMid) {                            // + two-finger pan
              imgWrap.scrollLeft -= (mid.x - pinchPrevMid.x);
              imgWrap.scrollTop -= (mid.y - pinchPrevMid.y);
            }
          }
          pinchPrevDist = dist; pinchPrevMid = mid;
        } else if (panActive) {
          imgWrap.scrollLeft = panSL - (ev.clientX - panSX);
          imgWrap.scrollTop = panST - (ev.clientY - panSY);
        }
      });

      function dropPointer(ev) {
        if (!pointers.has(ev.pointerId)) return;
        pointers.delete(ev.pointerId);
        try { imgWrap.releasePointerCapture(ev.pointerId); } catch (_) {}
        if (pointers.size === 1) {
          // 2→1: resume single-finger pan from the remaining pointer.
          var rem = ptList()[0];
          pinchPrevDist = 0; pinchPrevMid = null;
          startPan(rem.x, rem.y);
        } else if (pointers.size === 0) {
          panActive = false;
          pinchPrevDist = 0; pinchPrevMid = null;
          imgWrap.classList.remove("is-grabbing");
        }
      }
      imgWrap.addEventListener("pointerup", dropPointer);
      imgWrap.addEventListener("pointercancel", dropPointer);

      img.addEventListener("load", function () {
        natW = img.naturalWidth; natH = img.naturalHeight;
        if (!natW || !natH) { info.textContent = "image"; return; }
        loaded = true;
        if (natW > 512) {
          // Photo: smooth, fit to width.
          pixelated = false;
          img.classList.remove("is-pixelated");
          toggle.textContent = "Pixelated: off";
          scale = clamp(fitScale());
        } else {
          scale = clamp(defaultScale());
        }
        apply();
      });
      img.addEventListener("error", function () {
        wrap.innerHTML = '<div class="files-empty">Could not load image: ' + escHtml(filePath) + '</div>';
      });
      img.src = url;

      imgWrap.appendChild(img);
      wrap.appendChild(meta);
      wrap.appendChild(imgWrap);
      filesContent.appendChild(wrap);
    }

    function escHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function highlightCode(src, lang) {
      if (lang === "json") return highlightJson(src);
      if (lang === "js") return highlightJs(src);
      if (lang === "py") return highlightPy(src);
      if (lang === "vue") return highlightVue(src);
      if (lang === "html") return highlightHtml(src);
      if (lang === "css") return highlightCss(src);
      return escHtml(src);
    }

    function highlightJson(src) {
      var out = "";
      var i = 0;
      var len = src.length;
      while (i < len) {
        var ch = src[i];
        if (ch === '"') {
          var start = i;
          i++;
          while (i < len) {
            if (src[i] === "\\" && i + 1 < len) { i += 2; continue; }
            if (src[i] === '"') { i++; break; }
            i++;
          }
          var str = src.slice(start, i);
          var j = i;
          while (j < len && /\s/.test(src[j])) j++;
          if (src[j] === ":") {
            out += '<span class="syn-key">' + escHtml(str) + '</span>';
          } else {
            out += '<span class="syn-str">' + escHtml(str) + '</span>';
          }
          continue;
        }
        if (ch === "-" || (ch >= "0" && ch <= "9")) {
          var nStart = i;
          if (ch === "-") i++;
          while (i < len && /[0-9.eE+\-]/.test(src[i])) i++;
          out += '<span class="syn-num">' + escHtml(src.slice(nStart, i)) + '</span>';
          continue;
        }
        if (src.slice(i, i + 4) === "true" || src.slice(i, i + 5) === "false") {
          var kw = src.slice(i, i + 4) === "true" ? "true" : "false";
          out += '<span class="syn-bool">' + kw + '</span>';
          i += kw.length;
          continue;
        }
        if (src.slice(i, i + 4) === "null") {
          out += '<span class="syn-null">null</span>';
          i += 4;
          continue;
        }
        if ("{}[],:".indexOf(ch) >= 0) {
          out += '<span class="syn-punct">' + escHtml(ch) + '</span>';
          i++;
          continue;
        }
        out += escHtml(ch);
        i++;
      }
      return out;
    }

    var JS_KEYWORDS = /^(break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|async|await|as|interface|type|enum|implements|public|private|protected|readonly|abstract)$/;
    var JS_BUILTINS = /^(true|false|null|undefined|NaN|Infinity|console|Math|JSON|Object|Array|String|Number|Boolean|Promise|Date|RegExp|Error|window|document|globalThis)$/;

    function highlightJs(src) {
      var out = "";
      var i = 0;
      var len = src.length;
      while (i < len) {
        var ch = src[i];
        // Line comment
        if (ch === "/" && src[i + 1] === "/") {
          var end = src.indexOf("\n", i);
          if (end === -1) end = len;
          out += '<span class="syn-comment">' + escHtml(src.slice(i, end)) + '</span>';
          i = end;
          continue;
        }
        // Block comment
        if (ch === "/" && src[i + 1] === "*") {
          var bend = src.indexOf("*/", i + 2);
          if (bend === -1) bend = len; else bend += 2;
          out += '<span class="syn-comment">' + escHtml(src.slice(i, bend)) + '</span>';
          i = bend;
          continue;
        }
        // Strings
        if (ch === '"' || ch === "'" || ch === "`") {
          var quote = ch;
          var sStart = i;
          i++;
          while (i < len) {
            if (src[i] === "\\" && i + 1 < len) { i += 2; continue; }
            if (src[i] === quote) { i++; break; }
            if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
              var depth = 1;
              i += 2;
              while (i < len && depth > 0) {
                if (src[i] === "{") depth++;
                else if (src[i] === "}") depth--;
                i++;
              }
              continue;
            }
            i++;
          }
          out += '<span class="syn-str">' + escHtml(src.slice(sStart, i)) + '</span>';
          continue;
        }
        // Number
        if (ch >= "0" && ch <= "9") {
          var nStart = i;
          while (i < len && /[0-9._xXbBoOeE+\-a-fA-F]/.test(src[i])) i++;
          out += '<span class="syn-num">' + escHtml(src.slice(nStart, i)) + '</span>';
          continue;
        }
        // Identifier / keyword
        if (/[A-Za-z_$]/.test(ch)) {
          var idStart = i;
          while (i < len && /[A-Za-z0-9_$]/.test(src[i])) i++;
          var word = src.slice(idStart, i);
          if (JS_KEYWORDS.test(word)) {
            out += '<span class="syn-kw">' + word + '</span>';
          } else if (JS_BUILTINS.test(word)) {
            out += '<span class="syn-builtin">' + word + '</span>';
          } else if (src[i] === "(") {
            out += '<span class="syn-fn">' + word + '</span>';
          } else {
            out += escHtml(word);
          }
          continue;
        }
        out += escHtml(ch);
        i++;
      }
      return out;
    }

    var PY_KEYWORDS = /^(False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|match|case)$/;
    var PY_BUILTINS = /^(abs|all|any|bool|bytes|callable|chr|dict|dir|enumerate|filter|float|format|frozenset|getattr|hasattr|hash|help|hex|id|input|int|isinstance|issubclass|iter|len|list|map|max|min|next|object|open|ord|pow|print|property|range|repr|reversed|round|set|setattr|slice|sorted|str|sum|super|tuple|type|vars|zip|self|cls)$/;

    function highlightPy(src) {
      var out = "";
      var i = 0;
      var len = src.length;
      while (i < len) {
        var ch = src[i];
        // Decorator
        if (ch === "@" && /[A-Za-z_]/.test(src[i + 1] || "")) {
          var dStart = i;
          i++;
          while (i < len && /[A-Za-z0-9_.]/.test(src[i])) i++;
          out += '<span class="syn-decor">' + escHtml(src.slice(dStart, i)) + '</span>';
          continue;
        }
        // Comment
        if (ch === "#") {
          var end = src.indexOf("\n", i);
          if (end === -1) end = len;
          out += '<span class="syn-comment">' + escHtml(src.slice(i, end)) + '</span>';
          i = end;
          continue;
        }
        // Triple-quoted strings (treat as comments/strings)
        if ((ch === '"' || ch === "'") && src[i + 1] === ch && src[i + 2] === ch) {
          var tq = ch + ch + ch;
          var tStart = i;
          i += 3;
          var tEnd = src.indexOf(tq, i);
          if (tEnd === -1) { i = len; }
          else { i = tEnd + 3; }
          out += '<span class="syn-str">' + escHtml(src.slice(tStart, i)) + '</span>';
          continue;
        }
        // Simple string (handles r"" / b"" prefix too)
        if (ch === '"' || ch === "'") {
          var quote = ch;
          var sStart = i;
          i++;
          while (i < len) {
            if (src[i] === "\\" && i + 1 < len) { i += 2; continue; }
            if (src[i] === quote) { i++; break; }
            if (src[i] === "\n") break;
            i++;
          }
          out += '<span class="syn-str">' + escHtml(src.slice(sStart, i)) + '</span>';
          continue;
        }
        // Number
        if (ch >= "0" && ch <= "9") {
          var nStart = i;
          while (i < len && /[0-9._xXbBoOeE+\-a-fA-F]/.test(src[i])) i++;
          out += '<span class="syn-num">' + escHtml(src.slice(nStart, i)) + '</span>';
          continue;
        }
        // Identifier / keyword
        if (/[A-Za-z_]/.test(ch)) {
          var idStart = i;
          while (i < len && /[A-Za-z0-9_]/.test(src[i])) i++;
          var word = src.slice(idStart, i);
          if (PY_KEYWORDS.test(word)) {
            out += '<span class="syn-kw">' + word + '</span>';
          } else if (PY_BUILTINS.test(word)) {
            out += '<span class="syn-builtin">' + word + '</span>';
          } else if (src[i] === "(") {
            out += '<span class="syn-fn">' + word + '</span>';
          } else {
            out += escHtml(word);
          }
          continue;
        }
        out += escHtml(ch);
        i++;
      }
      return out;
    }

    function highlightHtmlTag(tag) {
      // Input is a single tag token like "<div id=\"x\">", "</script>", "<img/>".
      var out = "";
      var len = tag.length;
      if (len < 2) return escHtml(tag);
      out += '<span class="syn-punct">&lt;</span>';
      var i = 1;
      if (tag[i] === "/") { out += '<span class="syn-punct">/</span>'; i++; }
      var nameStart = i;
      while (i < len && /[a-zA-Z0-9\-]/.test(tag[i])) i++;
      if (i > nameStart) {
        out += '<span class="syn-tag">' + escHtml(tag.slice(nameStart, i)) + '</span>';
      }
      while (i < len && tag[i] !== ">") {
        if (/\s/.test(tag[i])) { out += tag[i]; i++; continue; }
        if (tag[i] === "/") { out += '<span class="syn-punct">/</span>'; i++; continue; }
        var aStart = i;
        while (i < len && /[a-zA-Z0-9:@\-._]/.test(tag[i])) i++;
        if (i > aStart) {
          out += '<span class="syn-attr">' + escHtml(tag.slice(aStart, i)) + '</span>';
        } else {
          out += escHtml(tag[i]); i++; continue;
        }
        if (tag[i] === "=") {
          out += '<span class="syn-punct">=</span>';
          i++;
          if (tag[i] === '"' || tag[i] === "'") {
            var quote = tag[i];
            var vStart = i;
            i++;
            while (i < len && tag[i] !== quote) i++;
            if (i < len) i++;
            out += '<span class="syn-str">' + escHtml(tag.slice(vStart, i)) + '</span>';
          } else {
            var uStart = i;
            while (i < len && !/[\s>]/.test(tag[i])) i++;
            out += '<span class="syn-str">' + escHtml(tag.slice(uStart, i)) + '</span>';
          }
        }
      }
      if (i < len && tag[i] === ">") out += '<span class="syn-punct">&gt;</span>';
      return out;
    }

    function highlightHtml(src) {
      var out = "";
      var i = 0;
      var len = src.length;
      while (i < len) {
        if (src.slice(i, i + 4) === "<!--") {
          var end = src.indexOf("-->", i + 4);
          end = end === -1 ? len : end + 3;
          out += '<span class="syn-comment">' + escHtml(src.slice(i, end)) + '</span>';
          i = end;
          continue;
        }
        if (src[i] === "<") {
          var tagEnd = src.indexOf(">", i);
          if (tagEnd === -1) { out += escHtml(src.slice(i)); break; }
          out += highlightHtmlTag(src.slice(i, tagEnd + 1));
          i = tagEnd + 1;
          continue;
        }
        if (src[i] === "{" && src[i + 1] === "{") {
          var iend = src.indexOf("}}", i + 2);
          if (iend === -1) { out += escHtml(src.slice(i)); break; }
          iend += 2;
          out += '<span class="syn-interp">' + escHtml(src.slice(i, iend)) + '</span>';
          i = iend;
          continue;
        }
        out += escHtml(src[i]);
        i++;
      }
      return out;
    }

    function highlightCss(src) {
      var out = "";
      var i = 0;
      var len = src.length;
      var depth = 0;
      while (i < len) {
        var ch = src[i];
        if (ch === "/" && src[i + 1] === "*") {
          var end = src.indexOf("*/", i + 2);
          end = end === -1 ? len : end + 2;
          out += '<span class="syn-comment">' + escHtml(src.slice(i, end)) + '</span>';
          i = end;
          continue;
        }
        if (ch === '"' || ch === "'") {
          var quote = ch;
          var sStart = i;
          i++;
          while (i < len && src[i] !== quote) {
            if (src[i] === "\\" && i + 1 < len) i++;
            i++;
          }
          if (i < len) i++;
          out += '<span class="syn-str">' + escHtml(src.slice(sStart, i)) + '</span>';
          continue;
        }
        if (ch === "{") { depth++; out += '<span class="syn-punct">{</span>'; i++; continue; }
        if (ch === "}") { if (depth > 0) depth--; out += '<span class="syn-punct">}</span>'; i++; continue; }
        if (ch === "@" && /[a-zA-Z]/.test(src[i + 1] || "")) {
          var aStart = i;
          i++;
          while (i < len && /[a-zA-Z\-]/.test(src[i])) i++;
          out += '<span class="syn-kw">' + escHtml(src.slice(aStart, i)) + '</span>';
          continue;
        }
        if (depth > 0 && /[a-zA-Z\-]/.test(ch)) {
          var pStart = i;
          while (i < len && /[a-zA-Z0-9\-]/.test(src[i])) i++;
          var j = i;
          while (j < len && /\s/.test(src[j])) j++;
          if (src[j] === ":") {
            out += '<span class="syn-key">' + escHtml(src.slice(pStart, i)) + '</span>';
          } else {
            out += escHtml(src.slice(pStart, i));
          }
          continue;
        }
        if (depth > 0 && (ch >= "0" && ch <= "9")) {
          var nStart = i;
          while (i < len && /[0-9.]/.test(src[i])) i++;
          while (i < len && /[a-zA-Z%]/.test(src[i])) i++;
          out += '<span class="syn-num">' + escHtml(src.slice(nStart, i)) + '</span>';
          continue;
        }
        if (ch === "#" && /[0-9a-fA-F]/.test(src[i + 1] || "")) {
          var hStart = i;
          i++;
          while (i < len && /[0-9a-fA-F]/.test(src[i])) i++;
          out += '<span class="syn-num">' + escHtml(src.slice(hStart, i)) + '</span>';
          continue;
        }
        out += escHtml(ch);
        i++;
      }
      return out;
    }

    function highlightVue(src) {
      var out = "";
      var i = 0;
      var len = src.length;
      // Match top-level SFC blocks: template, script (+ setup), style (+ scoped / lang="…").
      var blockRe = /<(template|script|style)(\s[^>]*?)?>/i;
      while (i < len) {
        var rest = src.slice(i);
        var m = blockRe.exec(rest);
        if (!m) { out += escHtml(rest); break; }
        out += escHtml(rest.slice(0, m.index));
        var blockName = m[1].toLowerCase();
        var openTag = m[0];
        out += highlightHtmlTag(openTag);
        var contentStart = m.index + openTag.length;
        var closeRe = new RegExp("</" + blockName + "\\s*>", "i");
        var close = closeRe.exec(rest.slice(contentStart));
        if (!close) {
          var tailContent = rest.slice(contentStart);
          out += highlightVueBlockContent(tailContent, blockName);
          break;
        }
        var content = rest.slice(contentStart, contentStart + close.index);
        out += highlightVueBlockContent(content, blockName);
        var closeTag = close[0];
        out += highlightHtmlTag(closeTag);
        i += contentStart + close.index + closeTag.length;
      }
      return out;
    }

    function highlightVueBlockContent(content, blockName) {
      if (blockName === "script") return highlightJs(content);
      if (blockName === "style") return highlightCss(content);
      return highlightHtml(content);
    }

    function renderMarkdown(src) {
      if (!src) return "";
      // Bundled marked (CommonMark + GFM) is loaded via /marked.js before
      // this script runs; it sets globalThis.markdownRender. Plain-text
      // fallback if the bundle failed to load.
      var fn = (typeof globalThis !== 'undefined') ? globalThis.markdownRender : null;
      if (typeof fn === 'function') return fn(src);
      return src;
    }

    if (filesPickerToggle) {
      filesPickerToggle.addEventListener("click", function() {
        if (!filesSidebar) return;
        var collapsed = filesSidebar.classList.contains("files-sidebar-collapsed");
        setPickerCollapsed(!collapsed);
      });
    }

    // === Multi-agent task summary widget (WAL-63 phase 4) ===================
    (function () {
      var panel = document.getElementById("multi-agent-panel");
      var grid = document.getElementById("multi-agent-grid");
      var sub = document.getElementById("multi-agent-sub");
      var extras = document.getElementById("multi-agent-extras");
      var refresh = document.getElementById("multi-agent-refresh");
      if (!panel || !grid || !sub) return;

      function renderCell(name, counts) {
        var open = counts.open || 0;
        var waiting = counts.waiting || 0;
        var done = counts.done || 0;
        var failed = counts.failed || 0;
        var archived = counts.archived || 0;
        function countSpan(value, status, icon, label) {
          var clsBase = value > 0 ? "multi-agent-count-" + status : "multi-agent-count-zero";
          var clsLink = value > 0 ? " multi-agent-count-link" : "";
          var dataAttrs = value > 0
            ? ' data-agent="' + escapeHtml(name) + '" data-status="' + status + '" role="button" tabindex="0"'
            : "";
          return (
            '<span class="' + clsBase + clsLink + '" title="' + label + '"' + dataAttrs + '>' +
            icon + ' ' + value + '</span>'
          );
        }
        return (
          '<div class="multi-agent-cell">' +
          '<div class="multi-agent-cell-name">' + escapeHtml(name) + '</div>' +
          '<div class="multi-agent-cell-counts">' +
          countSpan(open, "open", "○", "open") +
          countSpan(waiting, "waiting", "⏳", "waiting") +
          countSpan(done, "done", "✓", "done") +
          countSpan(failed, "failed", "✗", "failed") +
          countSpan(archived, "archived", "📦", "archived") +
          '</div></div>'
        );
      }

      function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
      }

      async function fetchSummary() {
        try {
          var res = await fetch("/api/multi-agent/summary", { cache: "no-store" });
          var data = await res.json();
          if (!data.ok || !data.summary) {
            sub.textContent = "Unavailable";
            grid.innerHTML = "";
            extras.innerHTML = "";
            panel.removeAttribute("hidden");
            return;
          }
          var s = data.summary;
          if (!s.enabled) {
            // No agents/ directory — keep widget hidden so upstream users don't see clutter.
            panel.setAttribute("hidden", "");
            return;
          }
          panel.removeAttribute("hidden");
          var totalOpen = s.totals && s.totals.open || 0;
          var totalWaiting = s.totals && s.totals.waiting || 0;
          var totalDone = s.totals && s.totals.done || 0;
          var totalFailed = s.totals && s.totals.failed || 0;
          var totalArchived = s.totals && s.totals.archived || 0;
          sub.textContent =
            totalOpen + " open · " +
            totalWaiting + " waiting · " +
            totalDone + " done · " +
            totalFailed + " failed · " +
            totalArchived + " archived";

          var rows = [];
          var byAgent = s.byAgent || {};
          var names = Object.keys(byAgent).sort();
          for (var i = 0; i < names.length; i++) {
            rows.push(renderCell(names[i], byAgent[names[i]]));
          }
          grid.innerHTML = rows.join("");

          var extraLines = [];
          var waiting = s.waitingUser || [];
          for (var w = 0; w < waiting.length; w++) {
            var item = waiting[w];
            extraLines.push(
              '<div class="multi-agent-extras-line">⏳ ' + escapeHtml(item.agent) + ': ' + escapeHtml(item.summary || item.file) + '</div>'
            );
          }
          var esc = s.escalated || [];
          for (var e = 0; e < esc.length; e++) {
            extraLines.push(
              '<div class="multi-agent-extras-line escalated">↑ ' + escapeHtml(esc[e].agent) + ': ' + escapeHtml(esc[e].file) + '</div>'
            );
          }
          extras.innerHTML = extraLines.join("");
        } catch (err) {
          sub.textContent = "Error: " + (err && err.message || err);
        }
      }

      if (refresh) refresh.addEventListener("click", fetchSummary);
      fetchSummary();
      setInterval(fetchSummary, 30000);

      // Click a count badge → switch to files tab and open
      // agents/<agent>/tasks/<status>/. Status `open` and `waiting` map to
      // the same-named directories; `done`/`failed`/`archived` likewise.
      function navigateToTasksDir(agent, status) {
        if (!agent || !status) return;
        var dir = "agents/" + agent + "/tasks/" + status;
        try {
          if (typeof setActiveTab === "function") setActiveTab("files");
          if (typeof loadDirectory === "function") loadDirectory(dir);
        } catch (_) {}
      }
      if (grid) {
        grid.addEventListener("click", function (ev) {
          var link = ev.target.closest(".multi-agent-count-link");
          if (!link) return;
          ev.preventDefault();
          navigateToTasksDir(link.getAttribute("data-agent"), link.getAttribute("data-status"));
        });
        grid.addEventListener("keydown", function (ev) {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          var link = ev.target.closest(".multi-agent-count-link");
          if (!link) return;
          ev.preventDefault();
          navigateToTasksDir(link.getAttribute("data-agent"), link.getAttribute("data-status"));
        });
      }

      // === Phase 5/6: task tree, chain expansion, new-task form ============
      // Dashboard summary "Open Tasks" button — switch to the Tasks tab.
      var openTasksBtn = document.getElementById("multi-agent-open-tasks-btn");
      if (openTasksBtn) {
        openTasksBtn.addEventListener("click", function () {
          if (typeof setActiveTab === "function") setActiveTab("tasks");
        });
      }

      // Tasks-panel DOM refs.
      var tasksTree = document.getElementById("tasks-tree");
      var tasksFilterChips = document.getElementById("tasks-filter-chips");
      var tasksViewTabs = document.getElementById("tasks-view-tabs");
      var tasksRefreshBtn = document.getElementById("tasks-refresh");
      var tasksNewBtn = document.getElementById("tasks-new-btn");
      var tasksPickerToggle = document.getElementById("tasks-picker-toggle");
      var tasksPickerToggleLabel = document.getElementById("tasks-picker-toggle-label");
      var tasksSidebar = document.getElementById("tasks-sidebar");
      var tasksContent = document.getElementById("tasks-content");
      var tasksViewer = document.getElementById("tasks-viewer");
      var tasksEmpty = document.getElementById("tasks-empty");
      var newForm = document.getElementById("multi-agent-new");
      var newCancelBtn = document.getElementById("multi-agent-new-cancel");
      var newStatus = document.getElementById("multi-agent-new-status");

      var tasksFilter = "all";
      // WAL-63 Phase 2: view selector — "current" (active leaves grouped by
      // project, default landing), "projects" (Phase 4 placeholder), "all"
      // (legacy flat picker with status filters). Status filter chips only
      // apply to the "all" view.
      var tasksView = "current";
      // Tracks the right-pane mode ("empty"|"view"|"new"|"project") so
      // navigation can reason about where we came from (see taskFromProjectSlug).
      var currentRightPaneMode = "empty";
      // Per-project collapse state for the Current view. Default open; click
      // the group head to fold a project section away.
      var currentCollapsed = {};
      // Multi-select close: tracks selected task ids → {agent, defaultStatus}.
      // Persists across renderCurrentView() calls within the page lifetime.
      var currentSelected = {};
      // Mobile long-press multi-select mode — true while checkboxes are visible
      // on touch devices. Activated by long-press (~500 ms); deactivated by
      // the "Done" button or clearing all selections on mobile.
      var currentMultiSelectActive = false;
      var tasksLoaded = false;
      var tasksCache = [];
      // Set of parent task IDs whose children are expanded in the picker.
      // Collapsed by default — top-level parents show first; click the
      // chevron on a parent to reveal its children. Persists across
      // re-renders within the page lifetime (no localStorage).
      var tasksExpanded = {};

      function timeAgo(iso) {
        if (!iso) return "";
        var t = Date.parse(iso);
        if (!Number.isFinite(t)) return "";
        var diff = Math.max(0, Date.now() - t);
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return mins + "m ago";
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + "h ago";
        var days = Math.floor(hrs / 24);
        return days + "d ago";
      }

      function statusClass(status) {
        if (!status) return "is-open";
        if (status === "open" || status === "claimed") return "is-open";
        if (status.indexOf("waiting:") === 0) return "is-waiting";
        if (status === "done") return "is-done";
        if (status.indexOf("failed:") === 0 || status === "escalated") return "is-failed";
        return "is-open";
      }

      function shorten(s, n) {
        s = String(s || "");
        if (s.length <= n) return s;
        return s.slice(0, n - 1) + "…";
      }

      // Tasks tree refresh — used by callbacks (unblock, revisit, dispatch)
      // that previously refreshed the dashboard list.
      function fetchTasks() {
        if (typeof loadTasksTree === "function") loadTasksTree();
      }

      // WAL-63 Phase 1: count active (closed: null) descendants of a task
      // by walking the in-memory tasksCache. Used by the Close form to label
      // the cascade prompt — the actual cascade walk happens server-side in
      // closeTask() which uses fs-side BFS for authoritative counts. The UI
      // figure can undercount if the cache is stale; the server number is
      // truth. If tasksCache hasn't loaded yet (initial paint race), the
      // function returns 0 and the prompt is skipped — Kelly can still
      // cascade by re-opening the picker after the cache is populated.
      function countActiveDescendants(taskId) {
        if (!taskId || !Array.isArray(tasksCache) || tasksCache.length === 0) return 0;
        var byParent = {};
        for (var i = 0; i < tasksCache.length; i++) {
          var t = tasksCache[i];
          var p = (t.parent && t.parent !== "null") ? t.parent : null;
          if (!p) continue;
          (byParent[p] = byParent[p] || []).push(t);
        }
        var queue = [taskId];
        var seen = {};
        seen[taskId] = true;
        var count = 0;
        while (queue.length > 0) {
          var cur = queue.shift();
          var kids = byParent[cur] || [];
          for (var k = 0; k < kids.length; k++) {
            var kid = kids[k];
            if (seen[kid.id]) continue;
            seen[kid.id] = true;
            if (!kid.closed || !kid.closed.status) count++;
            queue.push(kid.id);
          }
        }
        return count;
      }

      // === Multi-select close bulk bar ======================================
      // A sticky bar above the task list, shown only in the Current view when
      // ≥1 task is selected. Persists across renderCurrentView() calls.
      var currentBulkBar = null;
      function getOrCreateBulkBar() {
        if (currentBulkBar) return currentBulkBar;
        currentBulkBar = document.createElement("div");
        currentBulkBar.className = "tasks-bulk-bar";
        currentBulkBar.hidden = true;
        currentBulkBar.innerHTML =
          '<span class="bulk-bar-count"></span>' +
          '<input type="text" class="bulk-bar-reason" placeholder="Shared reason (optional)…">' +
          '<button type="button" class="bulk-bar-close is-primary"></button>' +
          '<button type="button" class="bulk-bar-clear">Clear</button>' +
          '<button type="button" class="bulk-bar-done">Done</button>' +
          '<span class="bulk-bar-status"></span>';
        var bulkCloseBtn = currentBulkBar.querySelector(".bulk-bar-close");
        if (bulkCloseBtn) bulkCloseBtn.addEventListener("click", submitBulkClose);
        var bulkClearBtn = currentBulkBar.querySelector(".bulk-bar-clear");
        if (bulkClearBtn) {
          bulkClearBtn.addEventListener("click", function () {
            currentSelected = {};
            updateBulkBar();
            renderTaskPicker();
          });
        }
        var bulkDoneBtn = currentBulkBar.querySelector(".bulk-bar-done");
        if (bulkDoneBtn) {
          bulkDoneBtn.addEventListener("click", function () {
            currentMultiSelectActive = false;
            currentSelected = {};
            if (tasksTree) tasksTree.classList.remove("is-multiselect-active");
            updateBulkBar();
            renderTaskPicker();
          });
        }
        if (tasksTree && tasksTree.parentNode) {
          tasksTree.parentNode.insertBefore(currentBulkBar, tasksTree);
        }
        return currentBulkBar;
      }

      function updateBulkBar() {
        var bar = getOrCreateBulkBar();
        if (!bar) return;
        var ids = Object.keys(currentSelected);
        // On mobile (touch), show the bar while multi-select mode is active
        // so the Done button is always reachable. On desktop, hide when empty.
        if (tasksView !== "current" || (ids.length === 0 && !currentMultiSelectActive)) {
          bar.hidden = true;
          return;
        }
        bar.hidden = false;
        var countEl = bar.querySelector(".bulk-bar-count");
        if (countEl) countEl.textContent = ids.length > 0 ? ids.length + " selected" : "Select tasks";
        var closeBtn = bar.querySelector(".bulk-bar-close");
        if (closeBtn) {
          closeBtn.textContent = ids.length > 0 ? "Close selected (" + ids.length + ")" : "";
          closeBtn.hidden = ids.length === 0;
        }
        var clearBtn = bar.querySelector(".bulk-bar-clear");
        if (clearBtn) clearBtn.hidden = ids.length === 0;
        var statusEl = bar.querySelector(".bulk-bar-status");
        if (statusEl) statusEl.textContent = "";
      }

      async function submitBulkClose() {
        var bar = currentBulkBar;
        if (!bar) return;
        var ids = Object.keys(currentSelected);
        if (ids.length === 0) return;
        var reasonEl = bar.querySelector(".bulk-bar-reason");
        var reason = reasonEl ? (reasonEl.value || "").trim() : "";
        var statusEl = bar.querySelector(".bulk-bar-status");
        var closeBtn = bar.querySelector(".bulk-bar-close");
        if (closeBtn) closeBtn.disabled = true;
        if (statusEl) { statusEl.textContent = "Closing…"; statusEl.className = "bulk-bar-status"; }
        var closed = 0, failed = 0;
        for (var bi = 0; bi < ids.length; bi++) {
          var sel = currentSelected[ids[bi]];
          if (!sel) continue;
          try {
            var bres = await fetch("/api/tasks/" + encodeURIComponent(ids[bi]) + "/close", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agent: sel.agent, reason: reason, status: sel.defaultStatus }),
            });
            var bdata = await bres.json();
            if (bdata && bdata.ok) closed++;
            else { failed++; if (typeof console !== "undefined") console.warn("bulk close failed:", ids[bi], bdata && bdata.error); }
          } catch (err) {
            failed++;
            if (typeof console !== "undefined") console.warn("bulk close error:", ids[bi], err);
          }
        }
        currentSelected = {};
        if (statusEl) {
          statusEl.textContent = failed > 0
            ? "Closed " + closed + " · " + failed + " failed."
            : "Closed " + closed + ".";
          statusEl.className = "bulk-bar-status is-ok";
        }
        if (closeBtn) closeBtn.disabled = false;
        fetchTasks();
        fetchSummary();
      }

      function updateGroupSelectAll(groupEl) {
        if (!groupEl) return;
        var allCb = groupEl.querySelector(".current-group-select-all");
        if (!allCb) return;
        var rowCbs = groupEl.querySelectorAll(".current-row-select");
        if (rowCbs.length === 0) return;
        var checkedCount = 0;
        for (var i = 0; i < rowCbs.length; i++) {
          if (rowCbs[i].checked) checkedCount++;
        }
        if (checkedCount === 0) {
          allCb.checked = false;
          allCb.indeterminate = false;
        } else if (checkedCount === rowCbs.length) {
          allCb.checked = true;
          allCb.indeterminate = false;
        } else {
          allCb.checked = false;
          allCb.indeterminate = true;
        }
      }

      // === Tasks panel right-pane viewer ====================================
      var taskPanelBody = document.getElementById("tasks-viewer-body");
      var taskPanelHeadline = document.getElementById("tasks-viewer-headline");
      var taskPanelId = document.getElementById("tasks-viewer-id");
      var taskPanelStatus = document.getElementById("tasks-viewer-status");
      var currentTaskId = null;
      var currentTaskChain = null;
      var currentViewMode = "task"; // "task" | "report"

      // Click-to-edit on the task viewer headline. Swaps in an inline input
      // pre-populated with the current text; commits to /api/tasks/<id>/rename
      // on blur or Enter, reverts on Esc. Refuses when the headline is
      // marked locked (status: claimed — set in the renderer above).
      if (taskPanelHeadline) {
        taskPanelHeadline.addEventListener("click", function () {
          if (taskPanelHeadline.dataset.locked === "true") return;
          if (taskPanelHeadline.querySelector("input")) return; // already editing
          var taskIdAttr = taskPanelHeadline.dataset.taskId || "";
          var agentAttr = taskPanelHeadline.dataset.agent || "";
          if (!taskIdAttr || !agentAttr) return;
          var original = taskPanelHeadline.textContent || "";
          taskPanelHeadline.textContent = "";
          var input = document.createElement("input");
          input.type = "text";
          input.className = "tasks-viewer-headline-input";
          input.value = original;
          input.maxLength = 200;
          input.autocomplete = "off";
          taskPanelHeadline.appendChild(input);
          input.focus();
          input.select();
          var done = false;
          var finish = function (commit) {
            if (done) return;
            done = true;
            var newValue = (input.value || "").trim();
            if (!commit || !newValue || newValue === original) {
              taskPanelHeadline.removeChild(input);
              taskPanelHeadline.textContent = original;
              return;
            }
            taskPanelHeadline.textContent = newValue + " …";
            fetch("/api/tasks/" + encodeURIComponent(taskIdAttr) + "/rename", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agent: agentAttr, headline: newValue }),
            })
              .then(function (r) { return r.json(); })
              .then(function (data) {
                if (!data || !data.ok) {
                  taskPanelHeadline.textContent = original;
                  if (typeof console !== "undefined") console.warn("rename failed:", data && data.error);
                  return;
                }
                taskPanelHeadline.textContent = newValue;
                // Refresh the picker so the renamed task shows the new
                // headline in the tree without a full reload.
                if (typeof fetchTasks === "function") fetchTasks();
              })
              .catch(function (err) {
                taskPanelHeadline.textContent = original;
                if (typeof console !== "undefined") console.warn("rename error:", err);
              });
          };
          input.addEventListener("blur", function () { finish(true); });
          input.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
            else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
          });
        });
      }

      function renderSection(title, bodyHtml, openByDefault) {
        if (!bodyHtml) return "";
        var openAttr = openByDefault ? ' open' : '';
        return (
          '<details class="task-panel-section"' + openAttr + '>' +
          '<summary class="task-panel-section-summary">' + escapeHtml(title) + '</summary>' +
          '<div class="task-panel-section-body">' + bodyHtml + '</div>' +
          '</details>'
        );
      }

      function renderPanelCard(card, label, isCurrent) {
        if (!card) return "";
        var brief = (card.brief || "").trim();
        var summaryResponse = card.summary && card.summary.response ? String(card.summary.response).trim() : "";
        var ctx = card.context || [];
        var ctxLines = ctx.map(function (c) {
          var safe = escapeHtml(c);
          if (/^(https?:)/.test(c)) {
            return '<div class="task-panel-context-item">↗ <a href="' + safe + '" target="_blank" rel="noopener">' + safe + '</a></div>';
          }
          if (/^jira:/i.test(c)) {
            return '<div class="task-panel-context-item">' + safe + '</div>';
          }
          return '<div class="task-panel-context-item">📄 <button data-open-file="' + safe + '" data-from-task="' + escapeHtml(currentTaskId || "") + '" type="button">' + safe + '</button></div>';
        }).join("");

        var statusLower = (card.status || "").toLowerCase();
        var isTerminal = statusLower.indexOf("done") === 0 || statusLower.indexOf("failed") === 0 || statusLower === "escalated";
        var isClaimed = card.status === "claimed";
        var isWaitingUser = card.status === "waiting:on:user";
        var isClosed = !!(card.closed && card.closed.status);
        var envelopePath = card.envelopePath || ("agents/" + card.agent + "/tasks/" + card.bucket + "/" + card.id + ".yaml");

        // Meta line: from → to · kind · priority · project · time-ago
        var metaParts = [];
        metaParts.push(escapeHtml(card.from || "?") + " <span class=\"task-panel-meta-arrow\">→</span> " + escapeHtml(card.to || "?"));
        if (card.kind) metaParts.push(escapeHtml(card.kind));
        if (card.priority) metaParts.push(escapeHtml(card.priority));
        // Project chip — click to edit. Always rendered (even unassigned)
        // so the affordance is discoverable.
        var projectLabel = card.project ? card.project : "Unassigned";
        var projectChip =
          '<span class="task-panel-project-chip' + (card.project ? "" : " is-unassigned") + '" ' +
          'data-project-edit="' + escapeHtml(card.id) + '" ' +
          'data-project-agent="' + escapeHtml(card.agent || card.to || "") + '" ' +
          'data-project-current="' + escapeHtml(card.project || "") + '" ' +
          'title="Click to change project">📁 ' + escapeHtml(projectLabel) + '</span>';
        metaParts.push(projectChip);
        if (card.updated) metaParts.push(escapeHtml(timeAgo(card.updated)));
        var metaHtml = '<div class="task-panel-meta">' + metaParts.join(' <span class="task-panel-meta-sep">·</span> ') + '</div>';

        var sections = "";

        // 1. Unblock — top priority when worker is parked on user input.
        //    Submits via /next with source=unblock, which spawns a child
        //    task carrying Kelly's answer. The parent stays in
        //    waiting:on:user; the runner auto-closes it to `done` when the
        //    child lands successfully.
        if (isCurrent && isWaitingUser) {
          var unblockTargetPicker = renderNextTargetPicker(card.agent || "");
          var unblockHeadlineSuggest = suggestChildHeadline(card.headline || card.id, "unblock");
          var unblockHtml =
            '<div class="task-panel-unblock task-panel-next" data-next-agent="' + escapeHtml(card.agent || "") + '" data-next-id="' + escapeHtml(card.id) + '" data-next-source="unblock">' +
            '<div class="task-panel-unblock-hint">The worker is parked waiting for your input. Type your response; a child task will pick up on the same session and continue from where the worker stopped. When the child completes, this task auto-closes as done.</div>' +
            '<input type="text" class="task-panel-next-headline-input" placeholder="Child task title" value="' + escapeHtml(unblockHeadlineSuggest) + '" />' +
            '<textarea class="task-panel-unblock-input task-panel-next-input" rows="4" placeholder="Your response (the agent will continue with your answer)…"></textarea>' +
            '<div class="task-panel-unblock-actions">' +
            unblockTargetPicker +
            '<button type="button" class="is-primary task-panel-next-submit">↳ Continue</button>' +
            '<span class="task-panel-unblock-status task-panel-next-status"></span>' +
            '</div>' +
            '</div>';
          sections += renderSection("⏳ Continue — your response", unblockHtml, true);
        }

        // 2. Brief (always open if non-empty).
        if (brief) {
          sections += renderSection("Brief", '<div class="task-panel-card-summary">' + escapeHtml(brief) + '</div>', true);
        }

        // 3. Result (open if there's a worker response).
        if (summaryResponse) {
          sections += renderSection("Result", '<div class="task-panel-card-summary">' + escapeHtml(summaryResponse) + '</div>', true);
        }

        // 3b. Closed banner — when the user-attention overlay is set, surface
        //     who closed it and when so the viewer doesn't look stale. Reopen
        //     is offered as the primary action below.
        if (isCurrent && isClosed) {
          var closedAtTxt = card.closed.at ? timeAgo(card.closed.at) : "";
          var closedByTxt = card.closed.by ? escapeHtml(card.closed.by) : "?";
          var closedReasonTxt = card.closed.reason ? escapeHtml(card.closed.reason) : "";
          var closedStatusTxt = escapeHtml(card.closed.status);
          sections +=
            '<div class="task-panel-closed-banner">' +
            '<span class="task-panel-closed-pill">' + closedStatusTxt + '</span>' +
            '<span class="task-panel-closed-meta">by ' + closedByTxt + (closedAtTxt ? ' · ' + escapeHtml(closedAtTxt) : '') + '</span>' +
            (closedReasonTxt ? '<div class="task-panel-closed-reason">' + closedReasonTxt + '</div>' : '') +
            '</div>';
        }

        // 4. Action buttons row — Next, Chat, Close/Abort/Reopen, Open.
        //    Next opens the new-task form pre-seeded with parent + context so
        //    Kelly can customise before dispatching (follow-on behaviour).
        //    For waiting:on:user the inline "⏳ Continue" form is the
        //    equivalent affordance, so Next is suppressed there.
        var actions = [];
        if (isCurrent && !isClosed) {
          actions.push('<button class="task-panel-action" data-followon-task="' + escapeHtml(card.id) + '" data-followon-agent="' + escapeHtml(card.agent || card.to || "") + '" type="button">↳ Next</button>');
        }
        // Chat is always present for current tasks; render before Close/Abort.
        actions.push('<button class="task-panel-action" data-toggle-chat="' + escapeHtml(card.id) + '" type="button">💬 Chat</button>');
        if (isCurrent && !isClaimed && !isClosed) {
          // "Close" reads clean on done tasks; non-done closures are really
          // cancellations — surface that in the label so Kelly doesn't think
          // she's marking a stuck task as resolved.
          var closeLabel = (statusLower === "done") ? "✓ Close" : "✕ Close";
          actions.push('<button class="task-panel-action" data-toggle-close="' + escapeHtml(card.id) + '" type="button">' + closeLabel + '</button>');
        }
        // Claimed = worker mid-flight. Close refuses these; Abort kills the
        // live worker process (behind a confirm step) and lands the task as
        // cancelled.
        if (isCurrent && isClaimed && !isClosed) {
          actions.push('<button class="task-panel-action task-panel-action-danger" data-toggle-abort="' + escapeHtml(card.id) + '" type="button">✕ Abort</button>');
        }
        if (isCurrent && isClosed) {
          actions.push('<button class="task-panel-action is-primary" data-reopen-agent="' + escapeHtml(card.agent || "") + '" data-reopen-task="' + escapeHtml(card.id) + '" type="button">↻ Reopen</button>');
        }
        if (!isCurrent) {
          actions.push('<button class="task-panel-action" data-open-task="' + escapeHtml(card.id) + '" type="button">Open</button>');
        }
        sections += '<div class="task-panel-card-actions">' + actions.join("") + '</div>';

        // 4b'. Chat-from-task form — hidden until the 💬 Chat button toggles
        //      it. Same pattern as Next: optional title + agent select +
        //      initial message. Submitting either switches to an existing
        //      chat for this task family (when one exists at the shared
        //      threadId) or seeds a fresh chat with the picked agent.
        //      Initial message is staged into the chat input — Kelly hits
        //      send when ready, not on submit, so the same review-before-
        //      send rhythm carries through.
        if (isCurrent) {
          var chatAgentPicker = renderNextTargetPicker(card.agent || "");
          var chatTitleSuggest = card.headline ? String(card.headline).slice(0, 56) : "";
          sections +=
            '<div class="task-panel-rework task-panel-chat-form" data-chat-task-id="' + escapeHtml(card.id) + '" data-chat-parent-agent="' + escapeHtml(card.agent || "") + '" hidden>' +
            '<details class="task-panel-rework-warn"><summary>Continues on the worker\'s session thread.</summary><p>Chat opens on the same thread as the task worker, so the agent\'s prior context is in cache. Pick a different agent below to start a fresh thread for that role.</p></details>' +
            '<input type="text" class="task-panel-chat-title-input" placeholder="Chat title (auto if blank)" value="' + escapeHtml(chatTitleSuggest) + '" />' +
            '<textarea class="task-panel-chat-msg-input task-panel-unblock-input" rows="3" placeholder="Initial message (optional — staged into the chat input, send when ready)…"></textarea>' +
            '<div class="task-panel-unblock-actions">' +
            chatAgentPicker +
            '<button type="button" class="is-primary task-panel-chat-submit">↳ Start chat</button>' +
            '<span class="task-panel-unblock-status task-panel-chat-status"></span>' +
            '</div>' +
            '</div>';
        }

        // 4c. Close form — hidden until the Close button toggles it. Optional
        //     reason textarea + cascade checkbox (only shown when active
        //     descendants exist). Posts to /api/tasks/<id>/close.
        if (isCurrent && !isClaimed && !isClosed) {
          var defaultCloseStatus = (statusLower === "done") ? "closed" : "cancelled";
          var activeDescendantCount = (typeof countActiveDescendants === "function") ? countActiveDescendants(card.id) : 0;
          sections +=
            '<div class="task-panel-close-form task-panel-rework" data-close-agent="' + escapeHtml(card.agent || "") + '" data-close-id="' + escapeHtml(card.id) + '" data-close-default-status="' + defaultCloseStatus + '" hidden>' +
            '<details class="task-panel-rework-warn"><summary>Marks <strong>' + defaultCloseStatus + '</strong> — reversible, runner state kept.</summary><p>Close marks this task <strong>' + defaultCloseStatus + '</strong> from your perspective. The runner state (' + escapeHtml(card.status || "?") + ') is preserved. You can <strong>↻ Reopen</strong> later — closure is reversible.</p></details>' +
            '<textarea class="task-panel-close-input task-panel-unblock-input" rows="2" placeholder="Optional reason (e.g. \'rolled into TSK-X\', \'no longer needed\')…"></textarea>' +
            (activeDescendantCount > 0
              ? '<label class="task-panel-close-cascade"><input type="checkbox" class="task-panel-close-cascade-checkbox" />' +
                '<span>Close family — cancel ' + activeDescendantCount + ' active descendant' + (activeDescendantCount === 1 ? '' : 's') + ' too</span></label>'
              : '') +
            '<div class="task-panel-unblock-actions">' +
            '<button type="button" class="is-primary task-panel-close-submit">Confirm close</button>' +
            '<button type="button" class="task-panel-close-cancel">Dismiss</button>' +
            '<span class="task-panel-close-status task-panel-unblock-status"></span>' +
            '</div>' +
            '</div>';
        }

        // 4c'. Abort form — the confirmation step for killing a claimed
        //      (mid-flight) worker. Hidden until ✕ Abort toggles it. Posts
        //      to /api/tasks/<id>/abort, which kills the live process and
        //      lands the task as cancelled.
        if (isCurrent && isClaimed && !isClosed) {
          sections +=
            '<div class="task-panel-close-form task-panel-abort-form task-panel-rework" data-abort-agent="' + escapeHtml(card.agent || "") + '" data-abort-id="' + escapeHtml(card.id) + '" hidden>' +
            '<details class="task-panel-rework-warn task-panel-abort-warn"><summary><strong>⚠ Kills the live process. Not reversible.</strong></summary><p><strong>⚠ Aborts a running worker.</strong> This kills the live process for this task immediately — any in-progress work is lost. The task lands as <strong>cancelled</strong> (failed:aborted). Files the worker already wrote to disk are kept. This is <em>not</em> reversible like Close — to resume, spawn a fresh task.</p></details>' +
            '<textarea class="task-panel-close-input task-panel-abort-input task-panel-unblock-input" rows="2" placeholder="Optional reason (e.g. \'wrong project\', \'no longer needed\')…"></textarea>' +
            '<div class="task-panel-unblock-actions">' +
            '<button type="button" class="is-primary task-panel-action-danger task-panel-abort-submit">Kill worker &amp; cancel</button>' +
            '<button type="button" class="task-panel-abort-cancel">Dismiss</button>' +
            '<span class="task-panel-abort-status task-panel-unblock-status"></span>' +
            '</div>' +
            '</div>';
        }

        // 5. Files section — collapsed dropdown with envelope + report
        //    file-style links. Replaces the old Envelope / Open report
        //    action buttons.
        var fileLinks = "";
        fileLinks += '<div class="task-panel-context-item">📄 <button data-open-file="' + escapeHtml(envelopePath) + '" data-from-task="' + escapeHtml(currentTaskId || "") + '" type="button">' + escapeHtml(envelopePath) + '</button></div>';
        if (card.reportPath) {
          fileLinks += '<div class="task-panel-context-item">📄 <button data-open-file="' + escapeHtml(card.reportPath) + '" data-from-task="' + escapeHtml(currentTaskId || "") + '" type="button">' + escapeHtml(card.reportPath) + '</button></div>';
        }
        sections += renderSection("Files", '<div class="task-panel-context-list">' + fileLinks + '</div>', false);

        // 6. Context / links at the bottom.
        if (ctxLines) {
          sections += renderSection("Context (" + ctx.length + ")", '<div class="task-panel-context-list">' + ctxLines + '</div>', false);
        }

        // Card head: just the headline is in the viewer-head above; we don't
        // repeat id/agent/status here. The meta line carries the from→to.
        return (
          '<div class="task-panel-card' + (isCurrent ? " is-current" : "") + '">' +
          metaHtml +
          sections +
          '</div>'
        );
      }

      // Report pane — renders the rendezvous report inline. After it
      // loads, we scan its rendered markdown for links to additional
      // deliverable docs the task produced (Notes/…, repos/dev/features/…,
      // etc.) and surface them as pill-style switcher buttons at the top.
      // Only one doc is shown at a time. The pill row is hidden until
      // extras are detected — single-report tasks render unchanged.
      function renderReportPane(card) {
        if (!card || !card.reportPath) return "";
        var safeTaskId = escapeHtml(card.id || "");

        // Always-present primary doc = the task's own <id>.md rendezvous file
        // (service guarantees this when it exists; falls back to the YAML
        // `report:` path if not). YAML-declared external deliverables
        // (e.g. FDP in repos/dev/) flow through `card.deliverables` and
        // get mounted as hidden siblings so the pill switcher exposes
        // them as secondary tabs.
        var allPaths = [card.reportPath];
        var declaredDeliverables = Array.isArray(card.deliverables) ? card.deliverables : [];
        for (var d = 0; d < declaredDeliverables.length; d++) {
          if (declaredDeliverables[d] && allPaths.indexOf(declaredDeliverables[d]) === -1) {
            allPaths.push(declaredDeliverables[d]);
          }
        }

        function docNode(path, isActive, scanExtras) {
          var filename = path.split("/").pop();
          var folderPath = path.indexOf("/") >= 0 ? path.substring(0, path.lastIndexOf("/")) : ".";
          var sp = escapeHtml(path);
          var sFolder = escapeHtml(folderPath);
          var sf = escapeHtml(filename);
          var activeAttr = isActive ? " is-active" : "";
          var hiddenAttr = isActive ? "" : " hidden";
          var scanAttr = scanExtras ? ' data-scan-extras="true"' : "";
          return (
            '<div class="task-panel-report-doc' + activeAttr + '" data-doc-path="' + sp + '"' + hiddenAttr + '>' +
            '<div class="task-panel-report-doc-head">' +
            '<span class="task-panel-report-doc-title">' + sf + '</span>' +
            '<button class="task-panel-folder-btn" data-open-folder="' + sFolder + '" data-from-task="' + safeTaskId + '" type="button" title="Open containing folder" aria-label="Open containing folder">📁</button>' +
            '</div>' +
            '<div class="task-panel-report" data-report-path="' + sp + '" data-loaded="false"' + scanAttr + '>' +
            '<div class="task-panel-report-loading">Loading report…</div>' +
            '</div>' +
            '</div>'
          );
        }

        var docsHtml = "";
        for (var i = 0; i < allPaths.length; i++) {
          docsHtml += docNode(allPaths[i], i === 0, i === 0);
        }

        var pillsHidden = allPaths.length <= 1;
        var pillsHtml = "";
        if (!pillsHidden) {
          for (var j = 0; j < allPaths.length; j++) {
            var pname = allPaths[j].split("/").pop();
            pillsHtml +=
              '<button class="task-panel-doc-pill' + (j === 0 ? ' is-active' : '') + '" ' +
              'data-doc-pill="' + escapeHtml(allPaths[j]) + '" type="button">' +
              escapeHtml(pname) + '</button>';
          }
        }

        return (
          '<div class="task-panel-report-pane" data-task-id="' + safeTaskId + '">' +
          '<div class="task-panel-doc-pills"' + (pillsHidden ? " hidden" : "") + '>' + pillsHtml + '</div>' +
          '<div class="task-panel-report-docs">' +
          docsHtml +
          '</div>' +
          '</div>'
        );
      }

      // Resolve a markdown link's href to a project-relative path the
      // /api/files/read endpoint can serve. Reports live in
      // agents/<a>/tasks/<bucket>/ and the agents' relative ../ counts
      // are often slightly off, so we pattern-match a known top-level
      // project dir (Notes/, agents/, repos/, etc.) anywhere in the
      // path and use that suffix verbatim. "../../../Notes/X/Y.md" and
      // "../../../../Notes/X/Y.md" both resolve to "Notes/X/Y.md".
      // Falls back to literal relative-to-report resolution only when no
      // known top-level dir appears in the path.
      var KNOWN_TOP_DIRS = ["Notes", "agents", "repos", "setup", "memory", ".claude", "src", "scripts", "plugin-cache"];
      function resolveReportPath(primaryPath, href) {
        if (!href) return null;
        var clean = href.split("#")[0].split("?")[0];
        if (!clean) return null;
        if (/^https?:/i.test(clean) || clean.indexOf("mailto:") === 0) return null;
        // Strip leading slash — treat as project-root absolute.
        if (clean.charAt(0) === "/") clean = clean.replace(/^\/+/, "");

        // Pattern A: scan for the LAST occurrence of a known top-level
        // dir followed by /, take everything from there. Catches both
        // already-project-relative paths ("Notes/X/Y.md") and any number
        // of leading "../" segments ("../../../Notes/X/Y.md").
        var parts = clean.split("/");
        for (var k = parts.length - 1; k >= 0; k--) {
          if (KNOWN_TOP_DIRS.indexOf(parts[k]) !== -1 && k < parts.length - 1) {
            return parts.slice(k).join("/");
          }
        }

        // Pattern B: literal relative resolution against the report's
        // directory. Only used for paths that don't look like they're
        // pointing at a top-level project dir (rare — typically same-dir
        // siblings without any ../).
        var lead = clean.replace(/^\.\//, "");
        var primaryDir = primaryPath.indexOf("/") >= 0
          ? primaryPath.substring(0, primaryPath.lastIndexOf("/"))
          : "";
        var baseParts = primaryDir.split("/").filter(Boolean);
        var relParts = lead.split("/");
        for (var i = 0; i < relParts.length; i++) {
          var p = relParts[i];
          if (p === "" || p === ".") continue;
          if (p === "..") {
            if (baseParts.length === 0) return null;
            baseParts.pop();
            continue;
          }
          baseParts.push(p);
        }
        return baseParts.length > 0 ? baseParts.join("/") : null;
      }

      // After the primary report's markdown has rendered, scan it for
      // links to additional deliverable docs. Build (or rebuild) the pill
      // switcher row, mount each extra doc as a hidden sibling, and
      // pre-load its markdown so switching pills is instant.
      function appendReportExtras(primaryNode) {
        if (!primaryNode) return;
        var primaryPath = primaryNode.getAttribute("data-report-path") || "";
        var doc = primaryNode.closest(".task-panel-report-doc");
        if (!doc) return;
        var pane = doc.closest(".task-panel-report-pane");
        if (!pane) return;
        var docsHost = pane.querySelector(".task-panel-report-docs");
        var pills = pane.querySelector(".task-panel-doc-pills");
        if (!docsHost || !pills) return;

        var seen = {};
        seen[primaryPath] = true;
        var anchors = primaryNode.querySelectorAll(".task-panel-report-md a[href]");
        var paths = [];
        for (var i = 0; i < anchors.length; i++) {
          var href = anchors[i].getAttribute("href") || "";
          if (!href || href.charAt(0) === "#") continue;
          var resolved = resolveReportPath(primaryPath, href);
          if (!resolved) continue;
          // Only worthwhile docs — markdown, pdf, docx, csv, txt, yaml, json.
          if (!/\.(md|markdown|pdf|docx|csv|txt|ya?ml|json)$/i.test(resolved)) continue;
          // Rewrite the anchor href so clicking the inline link in the
          // rendered markdown also goes through the Files panel via the
          // delegated data-open-file handler instead of attempting an
          // unresolved nav.
          anchors[i].setAttribute("href", "#" + resolved);
          anchors[i].setAttribute("data-open-file", resolved);
          if (seen[resolved]) continue;
          seen[resolved] = true;
          paths.push(resolved);
        }
        if (paths.length === 0) return;

        // Mount each extra doc as a hidden sibling of the primary.
        for (var p = 0; p < paths.length; p++) {
          var path = paths[p];
          var fname = path.split("/").pop();
          var folder = path.indexOf("/") >= 0
            ? path.substring(0, path.lastIndexOf("/"))
            : ".";
          var sp = escapeHtml(path);
          var sFolder = escapeHtml(folder);
          var sf = escapeHtml(fname);
          var node = document.createElement("div");
          node.className = "task-panel-report-doc";
          node.setAttribute("data-doc-path", path);
          node.hidden = true;
          node.innerHTML =
            '<div class="task-panel-report-doc-head">' +
            '<span class="task-panel-report-doc-title">' + sf + '</span>' +
            '<button class="task-panel-folder-btn" data-open-folder="' + sFolder + '" type="button" title="Open containing folder" aria-label="Open containing folder">📁</button>' +
            '</div>' +
            '<div class="task-panel-report" data-report-path="' + sp + '" data-loaded="false">' +
            '<div class="task-panel-report-loading">Loading…</div>' +
            '</div>';
          docsHost.appendChild(node);
        }

        // Build the pill row — primary first, then extras in scan order.
        var allPaths = [primaryPath].concat(paths);
        var pillsHtml = "";
        for (var q = 0; q < allPaths.length; q++) {
          var pp = allPaths[q];
          var pname = pp.split("/").pop();
          pillsHtml +=
            '<button class="task-panel-doc-pill' + (q === 0 ? ' is-active' : '') + '" ' +
            'data-doc-pill="' + escapeHtml(pp) + '" type="button">' +
            escapeHtml(pname) + '</button>';
        }
        pills.innerHTML = pillsHtml;
        pills.hidden = false;

        // Pre-load all extras so pill switches are instant.
        var newNodes = docsHost.querySelectorAll('.task-panel-report-doc:not(.is-active) .task-panel-report');
        for (var n = 0; n < newNodes.length; n++) {
          loadReportNode(newNodes[n]);
        }
      }

      // Switch which doc is visible in a report pane and toggle the
      // matching pill. Idempotent — clicking the active pill is a no-op.
      function setActiveReportDoc(pane, path) {
        if (!pane || !path) return;
        var docs = pane.querySelectorAll(".task-panel-report-doc");
        for (var i = 0; i < docs.length; i++) {
          var match = docs[i].getAttribute("data-doc-path") === path;
          docs[i].classList.toggle("is-active", match);
          docs[i].hidden = !match;
        }
        var pills = pane.querySelectorAll(".task-panel-doc-pill");
        for (var j = 0; j < pills.length; j++) {
          pills[j].classList.toggle("is-active", pills[j].getAttribute("data-doc-pill") === path);
        }
      }

      function renderTreeNode(node, depth, marker, isCurrent) {
        if (!node) return "";
        var pad = depth * 14;
        var indent = '<span class="task-tree-indent" style="width:' + pad + 'px"></span>';
        var dot = '<span class="task-tree-marker">' + marker + '</span>';
        var id = '<span class="task-tree-id">' + escapeHtml(node.id) + '</span>';
        var agent = '<span class="task-tree-agent">' + escapeHtml(node.agent || node.to || "?") + '</span>';
        var status = '<span class="task-tree-status ' + statusClass(node.status) + '">' + escapeHtml(node.status || "?") + '</span>';
        var headline = node.headline || node.brief || "";
        var headlineHtml = '<span class="task-tree-headline">' + escapeHtml(shorten(headline, 120)) + '</span>';
        var attr = isCurrent ? '' : ' data-open-task="' + escapeHtml(node.id) + '"';
        return '<div class="task-tree-node' + (isCurrent ? ' is-current' : '') + '"' + attr + '>' +
          indent + dot + id + agent + status + headlineHtml + '</div>';
      }

      function renderTaskTree(chain) {
        var ancestors = chain.ancestors || [];
        var children = chain.children || [];
        var task = chain.task;
        var rows = [];
        for (var i = 0; i < ancestors.length; i++) {
          var marker = i === 0 ? '◆' : '└';
          rows.push(renderTreeNode(ancestors[i], i, marker, false));
        }
        var curDepth = ancestors.length;
        if (task) {
          var curMarker = curDepth === 0 ? '●' : '└';
          rows.push(renderTreeNode(task, curDepth, curMarker, true));
        }
        for (var j = 0; j < children.length; j++) {
          var cmark = j === children.length - 1 ? '└' : '├';
          rows.push(renderTreeNode(children[j], curDepth + 1, cmark, false));
        }
        if (rows.length === 0) return '';
        return '<div class="task-tree">' + rows.join("") + '</div>';
      }

      // Lazy-load a `.task-panel-report` placeholder. Idempotent — won't
      // re-fetch a node that's already loaded or in-flight. Used by both the
      // standalone report card (eager-load on render) and any other inline
      // dropdowns that lazy-load on first toggle.
      function loadReportNode(node) {
        if (!node) return;
        if (node.getAttribute("data-loaded") !== "false") return;
        node.setAttribute("data-loaded", "loading");
        node.innerHTML = '<div class="task-panel-report-loading">Loading report…</div>';
        var path = node.getAttribute("data-report-path");
        fetch("/api/files/read?path=" + encodeURIComponent(path), { cache: "no-store" })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (!data.ok) throw new Error(data.error || "failed");
            node.setAttribute("data-loaded", "true");
            if (data.markdown) {
              var raw = data.content || "";
              var fmHtml = "";
              var body = raw;
              var fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
              if (fmMatch) {
                fmHtml = '<pre class="task-panel-report-frontmatter">' + escapeHtml(fmMatch[1]) + '</pre>';
                body = raw.slice(fmMatch[0].length);
              }
              node.innerHTML = fmHtml + '<div class="task-panel-report-md files-md">' + renderMarkdown(body) + '</div>';
            } else {
              var pre = document.createElement("pre");
              pre.className = "task-panel-report-raw";
              pre.textContent = data.content;
              node.innerHTML = "";
              node.appendChild(pre);
            }
            if (node.getAttribute("data-scan-extras") === "true" && typeof appendReportExtras === "function") {
              appendReportExtras(node);
            }
          })
          .catch(function (err) {
            node.setAttribute("data-loaded", "false");
            node.innerHTML = '<div class="task-panel-report-loading is-error">Error: ' + escapeHtml(String(err && err.message || err)) + '</div>';
          });
      }

      function setRightPaneMode(mode) {
        // mode: "empty" | "view" | "new" | "project"
        currentRightPaneMode = mode;
        if (tasksEmpty) tasksEmpty.hidden = mode !== "empty";
        if (tasksViewer) tasksViewer.hidden = mode !== "view";
        var projectPane = document.getElementById("tasks-project-pane");
        if (projectPane) projectPane.hidden = mode !== "project";
        if (newForm) {
          if (mode === "new") newForm.removeAttribute("hidden");
          else newForm.setAttribute("hidden", "");
        }
        // When the tasks panel is narrow (container-query threshold,
        // not viewport), switching the right pane to view/new/project
        // means the user wants to see the right pane — collapse the
        // picker so it's actually visible. "empty" goes back to the
        // list (sidebar expanded).
        if (isPanelNarrow("tasks-panel", 1199)) {
          if (typeof setTasksPickerCollapsed === "function") {
            setTasksPickerCollapsed(mode !== "empty");
          }
        }
      }

      function setViewMode(mode) {
        currentViewMode = mode === "report" ? "report" : "task";
        if (!taskPanelBody) return;
        var panes = taskPanelBody.querySelectorAll(".tasks-viewer-pane");
        for (var i = 0; i < panes.length; i++) {
          panes[i].hidden = panes[i].getAttribute("data-pane") !== currentViewMode;
        }
        var tabs = document.querySelectorAll(".tasks-viewer-tab");
        for (var j = 0; j < tabs.length; j++) {
          var isActive = tabs[j].getAttribute("data-view") === currentViewMode;
          tabs[j].classList.toggle("is-active", isActive);
          tabs[j].setAttribute("aria-selected", isActive ? "true" : "false");
        }
      }

      async function openTaskPanel(taskId) {
        if (!taskId || !taskPanelBody) return;
        // Back-stack bookkeeping (before currentTaskId is reassigned):
        //  - opened while a project panel was showing → remember the project.
        //  - re-opening the SAME task (a post-action refresh) → preserve it.
        //  - opening a DIFFERENT task from elsewhere → clear it.
        var prevPaneMode = currentRightPaneMode;
        var sameTask = (taskId === currentTaskId);
        if (prevPaneMode === "project") taskFromProjectSlug = currentProjectSlug;
        else if (!sameTask) taskFromProjectSlug = null;
        currentTaskId = taskId;
        if (typeof setActiveTab === "function") setActiveTab("tasks");
        setRightPaneMode("view");
        if (taskPanelId) taskPanelId.textContent = taskId;
        if (taskPanelHeadline) taskPanelHeadline.textContent = "Loading…";
        if (taskPanelStatus) { taskPanelStatus.textContent = ""; taskPanelStatus.className = "tasks-viewer-status"; }
        taskPanelBody.innerHTML = '<div class="task-panel-loading">Loading task…</div>';
        // Auto-expand ancestors so the active row stays visible in the
        // collapsed-by-default picker, then re-render so the chain is
        // open before we paint the active class.
        if (typeof expandAncestors === "function") {
          expandAncestors(taskId);
          if (typeof renderTaskPicker === "function") renderTaskPicker();
        }
        // Update active row in picker (both legacy tree rows and the new
        // Current-view rows).
        if (tasksTree) {
          var rows = tasksTree.querySelectorAll(".tasks-tree-row, .tasks-current-row");
          for (var r = 0; r < rows.length; r++) {
            rows[r].classList.toggle("is-active", rows[r].getAttribute("data-task-id") === taskId);
          }
        }
        try {
          var res = await fetch("/api/tasks/" + encodeURIComponent(taskId), { cache: "no-store" });
          var data = await res.json();
          if (!data.ok || !data.chain) {
            taskPanelBody.innerHTML = '<div class="task-panel-loading">Unable to load task.</div>';
            return;
          }
          var c = data.chain;
          currentTaskChain = c;
          var task = c.task;
          if (task) {
            if (taskPanelHeadline) {
              taskPanelHeadline.textContent = task.headline || task.brief || "Task " + taskId;
              // Stash the task's agent + id on the headline so the
              // click-to-edit handler (wired once below) has enough
              // context to PATCH /api/tasks/<id>/rename. Disabled when
              // a worker is mid-turn so renames can't race the run.
              taskPanelHeadline.dataset.taskId = task.id || "";
              taskPanelHeadline.dataset.agent = task.agent || task.to || "";
              taskPanelHeadline.dataset.locked = (task.status === "claimed") ? "true" : "false";
              taskPanelHeadline.title = (task.status === "claimed")
                ? "Cannot rename while the worker is claimed"
                : "Click to rename — Enter to save, Esc to cancel";
              taskPanelHeadline.classList.toggle("is-editable", task.status !== "claimed");
            }
            if (taskPanelStatus) {
              taskPanelStatus.textContent = task.status || "?";
              taskPanelStatus.className = "tasks-viewer-status " + statusClass(task.status);
            }
          }

          var taskParts = [];
          if (task) taskParts.push(renderPanelCard(task, "Current task", true));

          var reportParts = [];
          if (task && task.reportPath) {
            reportParts.push(renderReportPane(task));
          } else {
            reportParts.push('<div class="task-panel-loading">No report yet for this task.</div>');
          }

          taskPanelBody.innerHTML =
            '<div class="tasks-viewer-pane" data-pane="task"' + (currentViewMode === "task" ? '' : ' hidden') + '>' +
            (taskParts.length > 0 ? taskParts.join("") : '<div class="task-panel-loading">No chain data.</div>') +
            '</div>' +
            '<div class="tasks-viewer-pane" data-pane="report"' + (currentViewMode === "report" ? '' : ' hidden') + '>' +
            reportParts.join("") +
            '</div>';

          if (typeof window.__updateSpeakerDisabled === "function") window.__updateSpeakerDisabled();

          // Eagerly load every report node — the pane shows them inline by
          // default now (no <details> wrap), so flipping to the Report tab
          // should be instant. Extras (additional documents linked from
          // the primary report) are loaded by appendReportExtras after
          // the primary finishes parsing.
          var reportNodes = taskPanelBody.querySelectorAll(".task-panel-report");
          for (var rn = 0; rn < reportNodes.length; rn++) {
            loadReportNode(reportNodes[rn]);
          }
        } catch (err) {
          taskPanelBody.innerHTML = '<div class="task-panel-loading">Error: ' + escapeHtml(String(err && err.message || err)) + '</div>';
        }
      }

      // Tab switching between Task view and Report view.
      var viewerTabs = document.querySelectorAll(".tasks-viewer-tab");
      for (var vt = 0; vt < viewerTabs.length; vt++) {
        viewerTabs[vt].addEventListener("click", function (ev) {
          var mode = ev.currentTarget.getAttribute("data-view");
          setViewMode(mode);
        });
      }

      // === Tasks panel picker ==============================================
      // Filter logic: an "open" filter includes both `open` and `claimed`;
      // "waiting" includes any `waiting:*`; "failed" includes any `failed:*`
      // and `escalated`; "done" is exact.
      function passesFilter(t) {
        if (tasksFilter === "all") return true;
        var s = (t.status || "").toLowerCase();
        if (tasksFilter === "open") return s === "open" || s === "claimed";
        if (tasksFilter === "waiting") return s.indexOf("waiting:") === 0;
        if (tasksFilter === "done") return s === "done";
        if (tasksFilter === "failed") return s.indexOf("failed:") === 0 || s === "escalated";
        return true;
      }

      // Build a parent→child tree from the flat task list. Tasks whose parent
      // isn't in the working set become roots themselves so nothing is lost.
      // Self-parent links (legacy data quirk) and any chain that would loop
      // back on itself are flattened to root to avoid infinite recursion.
      function buildTaskTree(tasks) {
        var byId = {};
        for (var i = 0; i < tasks.length; i++) byId[tasks[i].id] = tasks[i];
        // Walk up the dotted-suffix ID hierarchy until we find a known
        // ancestor in the cache. Defends against parents being temporarily
        // absent from the API result (parser failures, transitions in flight).
        // Example: "TSK-2026-05-07-0001.5.1" → "TSK-2026-05-07-0001.5" →
        // "TSK-2026-05-07-0001". Returns null if no known ancestor exists.
        function idDerivedAncestor(id) {
          if (!id) return null;
          var cur = id;
          while (true) {
            var m = /^(.+)\.[0-9]+$/.exec(cur);
            if (!m) return null;
            cur = m[1];
            if (byId[cur]) return cur;
          }
        }
        // Resolve each task's effective parent — null if missing/self/cyclic.
        // Primary: explicit `parent` field (when in cache, no cycle, and
        // not deeper than the task's own ID hierarchy — see below).
        // Fallback: ID-derived ancestor (handles dropped tasks AND keeps
        // flat-IDed continuations rendering flat instead of buried under
        // their dispatch-chain parent).
        function dotDepth(id) { return (String(id).match(/\./g) || []).length; }
        function effectiveParent(t) {
          var pid = t.parent && t.parent !== "null" ? t.parent : null;
          // If the explicit parent lives deeper in the ID hierarchy than
          // this task's own ID, honoring it would bury a flat-IDed task
          // (e.g. ".06") under a deeply nested dispatch-chain ancestor
          // (e.g. ".5.1.7"). Prefer the ID-derived ancestor so the picker
          // tree mirrors the ID hierarchy.
          if (pid && pid !== t.id && byId[pid] && dotDepth(pid) >= dotDepth(t.id)) {
            var idAncestor = idDerivedAncestor(t.id);
            if (idAncestor) return idAncestor;
          }
          if (pid && pid !== t.id && byId[pid]) {
            // Walk up; bail if we ever come back to t.
            var seen = {};
            seen[t.id] = true;
            var cur = byId[pid];
            var cyclic = false;
            while (cur) {
              if (seen[cur.id]) { cyclic = true; break; }
              seen[cur.id] = true;
              var nextId = cur.parent && cur.parent !== "null" ? cur.parent : null;
              if (!nextId || nextId === cur.id || !byId[nextId]) break;
              cur = byId[nextId];
            }
            if (!cyclic) return pid;
          }
          // Fallback to ID-derived ancestor.
          return idDerivedAncestor(t.id);
        }
        var roots = [];
        var childrenOf = {};
        for (var j = 0; j < tasks.length; j++) {
          var t = tasks[j];
          var parentId = effectiveParent(t);
          if (parentId) {
            (childrenOf[parentId] = childrenOf[parentId] || []).push(t);
          } else {
            roots.push(t);
          }
        }
        // Sort children oldest→newest within a parent (kid-1, kid-2…); roots
        // by `updated` desc so the most-recently-touched tasks float up.
        function byUpdatedDesc(a, b) {
          return (Date.parse(b.updated || 0) || 0) - (Date.parse(a.updated || 0) || 0);
        }
        function byIdAsc(a, b) {
          return String(a.id).localeCompare(String(b.id));
        }
        roots.sort(byUpdatedDesc);
        Object.keys(childrenOf).forEach(function (k) { childrenOf[k].sort(byIdAsc); });
        return { roots: roots, childrenOf: childrenOf };
      }

      function renderTreeRow(t, depth, hasChildren, expanded) {
        var status = statusClass(t.status);
        var marker = depth === 0 ? "●" : "└";
        var headline = t.headline || (t.summary && t.summary.brief) || t.brief || "(no headline)";
        var rowClass = "tasks-tree-row";
        if (t.id === currentTaskId) rowClass += " is-active";
        if (t.status === "waiting:on:user") rowClass += " is-waiting-user";
        // WAL-63 Phase 1: greyed-out cue for closed tasks. Phase 4 will add
        // a per-project "Hide closed" toggle; for now closed rows still
        // render in the tree but visibly recede.
        if (t.closed && t.closed.status) rowClass += " is-closed";
        // Kelly 2026-05-20: top-level parent rows read with a lighter
        // background so the family hierarchy is easier to scan.
        if (depth === 0) rowClass += " is-root";
        var indent = '<span class="tasks-tree-indent" style="width:' + (depth * 14) + 'px"></span>';
        var chevron = hasChildren
          ? '<button class="tasks-tree-chevron' + (expanded ? ' is-expanded' : '') + '" data-toggle-expand="' + escapeHtml(t.id) + '" type="button" aria-label="' + (expanded ? 'Collapse' : 'Expand') + '">' + (expanded ? '▾' : '▸') + '</button>'
          : '<span class="tasks-tree-chevron-spacer"></span>';
        var rawStatus = t.status || "?";
        var shortStatus = shortenStatusLabel(rawStatus);
        return (
          '<div class="' + rowClass + '" data-task-id="' + escapeHtml(t.id) + '" role="button" tabindex="0">' +
          indent +
          chevron +
          '<span class="tasks-tree-marker">' + marker + '</span>' +
          '<div class="tasks-tree-titlecol">' +
          '<span class="tasks-tree-headline">' + escapeHtml(shorten(headline, 80)) + '</span>' +
          '<div class="tasks-tree-meta">' +
          '<span class="tasks-tree-id">' + escapeHtml(t.id) + '</span>' +
          '<span class="tasks-tree-agent">' + escapeHtml(t.agent || t.to || "?") + '</span>' +
          '<span class="tasks-tree-status ' + status + '" title="' + escapeHtml(rawStatus) + '">' + escapeHtml(shortStatus) + '</span>' +
          '</div>' +
          '</div>' +
          '</div>'
        );
      }

      // Compact status label for the picker pill. Full status surfaces via
      // the tooltip (title=). Keeps the row readable when there's a status
      // like `waiting:on:task` that would otherwise crowd out the headline.
      function shortenStatusLabel(s) {
        if (!s) return "?";
        s = String(s);
        if (s.indexOf("waiting:on:") === 0) return "wait " + s.slice("waiting:on:".length);
        if (s.indexOf("failed:") === 0) {
          var rest = s.slice("failed:".length);
          return rest === "other" ? "failed" : "fail " + rest;
        }
        return s;
      }

      // Mirror of spawnNextTask's headline rule (multiAgentDispatch.ts) — used
      // to pre-fill the editable headline input on the Next form. The user
      // can edit before submitting; if they leave the suggestion, the result
      // matches what the service would have generated.
      function suggestChildHeadline(parentHeadline, source) {
        var base = String(parentHeadline || "").slice(0, 56);
        if (source === "unblock") return base + " — continue with response";
        return base + " — rework";
      }

      // Render the agent picker shown next to the Next button. Defaults to
      // the parent's agent (same as current behaviour); picking a different
      // option routes the spawned child to that agent's queue. The picker is
      // rendered on every Next form (unblock + revisit) — submitNext reads
      // its value when posting to /api/tasks/<id>/next.
      function renderNextTargetPicker(currentAgent) {
        var options = "";
        var agents = Array.isArray(agentsCache) ? agentsCache : [];
        for (var i = 0; i < agents.length; i++) {
          var a = agents[i];
          if (!a || !a.name) continue;
          var label = (a.emoji ? a.emoji + " " : "") + (a.displayName || a.name);
          var selected = (a.name === currentAgent) ? " selected" : "";
          options += '<option value="' + escapeHtml(a.name) + '"' + selected + '>' + escapeHtml(label) + '</option>';
        }
        // Fallback when agentsCache hasn't loaded — emit just the parent's
        // agent so the form still submits sensibly.
        if (!options && currentAgent) {
          options = '<option value="' + escapeHtml(currentAgent) + '" selected>' + escapeHtml(currentAgent) + '</option>';
        }
        return (
          '<label class="task-panel-next-target" title="Pick a different agent to take over from here">' +
          '<span class="task-panel-next-target-label">→</span>' +
          '<select class="task-panel-next-target-select">' + options + '</select>' +
          '</label>'
        );
      }

      function renderTreeBranch(tree, node, depth, out, seen) {
        seen = seen || {};
        if (seen[node.id] || depth > 32) {
          // Defensive — buildTaskTree already breaks cycles, but guard
          // against pathological depth too.
          return;
        }
        seen[node.id] = true;
        var kids = tree.childrenOf[node.id] || [];
        var hasChildren = kids.length > 0;
        var expanded = !!tasksExpanded[node.id];
        out.push(renderTreeRow(node, depth, hasChildren, expanded));
        if (!hasChildren || !expanded) return;
        for (var i = 0; i < kids.length; i++) {
          renderTreeBranch(tree, kids[i], depth + 1, out, seen);
        }
      }

      // Walk up the task chain (using explicit parent + ID-derived
      // fallback) and mark every ancestor as expanded so the active
      // row stays visible after re-render.
      function expandAncestors(taskId) {
        if (!taskId) return;
        var byId = {};
        for (var i = 0; i < tasksCache.length; i++) byId[tasksCache[i].id] = tasksCache[i];
        function depth(id) { return (String(id).match(/\./g) || []).length; }
        function idDerived(id) {
          var cur = id;
          while (true) {
            var m = /^(.+)\.[0-9]+$/.exec(cur);
            if (!m) return null;
            cur = m[1];
            if (byId[cur]) return cur;
          }
        }
        function ancestorOf(id) {
          var t = byId[id];
          if (t) {
            var p = t.parent && t.parent !== "null" && t.parent !== id ? t.parent : null;
            // Same flat-vs-deep guard as buildTaskTree.effectiveParent.
            if (p && byId[p] && depth(p) >= depth(id)) {
              var derived = idDerived(id);
              if (derived) return derived;
            }
            if (p && byId[p]) return p;
          }
          return idDerived(id);
        }
        var seen = {};
        var cur = ancestorOf(taskId);
        while (cur && !seen[cur]) {
          seen[cur] = true;
          tasksExpanded[cur] = true;
          cur = ancestorOf(cur);
        }
      }

      function renderTaskPicker() {
        if (!tasksTree) return;
        // WAL-63 Phase 2: dispatch by view. Filter chips only render results
        // in the "all" view; current and projects compose their own lists.
        if (tasksFilterChips) tasksFilterChips.hidden = (tasksView !== "all");
        if (tasksView === "current") return renderCurrentView();
        if (tasksView === "projects") return renderProjectsView();
        return renderAllTasksView();
      }

      function renderAllTasksView() {
        var filtered = tasksCache.filter(passesFilter);
        if (filtered.length === 0) {
          tasksTree.innerHTML = '<div class="tasks-tree-empty">No tasks match this filter.</div>';
          return;
        }
        // Surface waiting:on:user as a jump-list at the top so Kelly sees
        // parked tasks before scrolling. Kelly's 2026-05-20 note: same
        // tasks should ALSO appear in the project tree below so it's clear
        // where they sit in the workstream. So the top section is a
        // shortcut, not a filter — `rest` is the full filtered set, not
        // `filtered minus blocked`.
        var blocked = filtered.filter(function (t) { return t.status === "waiting:on:user"; });

        var html = "";
        if (blocked.length > 0 && tasksFilter !== "waiting") {
          html += '<div class="tasks-tree-section">⏳ Waiting on you (' + blocked.length + ')</div>';
          var blockedTree = buildTaskTree(blocked);
          var blockedOut = [];
          for (var b = 0; b < blockedTree.roots.length; b++) {
            renderTreeBranch(blockedTree, blockedTree.roots[b], 0, blockedOut);
          }
          html += blockedOut.join("");
        }

        // Group by project for the main tree. Same shape as the Current
        // view's grouping: collapsible header per project, "Unassigned"
        // sinks to the bottom, projects sorted by most-recently-touched
        // task within them.
        var groups = {};
        for (var i = 0; i < filtered.length; i++) {
          var key = filtered[i].project || "__unassigned";
          if (!groups[key]) groups[key] = [];
          groups[key].push(filtered[i]);
        }
        var projectKeys = Object.keys(groups);
        projectKeys.sort(function (a, b) {
          if (a === "__unassigned" && b !== "__unassigned") return 1;
          if (b === "__unassigned" && a !== "__unassigned") return -1;
          var aLatest = groups[a].reduce(function (m, t) { return Math.max(m, Date.parse(t.updated || 0) || 0); }, 0);
          var bLatest = groups[b].reduce(function (m, t) { return Math.max(m, Date.parse(t.updated || 0) || 0); }, 0);
          return bLatest - aLatest;
        });

        if (blocked.length > 0 && tasksFilter !== "waiting") {
          html += '<div class="tasks-tree-section">All tasks (' + filtered.length + ')</div>';
        }

        for (var pk = 0; pk < projectKeys.length; pk++) {
          var groupKey = projectKeys[pk];
          var rows = groups[groupKey];
          var displayName = (groupKey === "__unassigned") ? "Unassigned" : groupKey;
          var collapsed = !!currentCollapsed[groupKey];
          html += '<div class="tasks-current-group' + (collapsed ? ' is-collapsed' : '') + '" data-project-key="' + escapeHtml(groupKey) + '">';
          html += '<div class="tasks-current-group-head" data-toggle-group="' + escapeHtml(groupKey) + '">';
          html += '<span class="tasks-current-group-chevron"></span>';
          html += '<span class="tasks-current-group-name">' + escapeHtml(displayName) + '</span>';
          html += '<span class="tasks-current-group-count">' + rows.length + '</span>';
          html += '</div>';
          html += '<div class="tasks-current-group-body">';
          var tree = buildTaskTree(rows);
          var out = [];
          for (var k = 0; k < tree.roots.length; k++) {
            renderTreeBranch(tree, tree.roots[k], 0, out);
          }
          html += out.join("");
          html += '</div></div>';
        }

        tasksTree.innerHTML = html;
      }

      // WAL-63 Phase 2: Current view — active leaves only, grouped by project.
      //
      // Active leaf definition (per the lifecycle plan):
      //   - closed: null (not closed)
      //   - AND no descendant where closed: null (the leaf of every workstream)
      //
      // Sort: within each project, by `updated` desc. Projects sorted by
      // most-recently-touched leaf first. "Unassigned" (project: null) sinks
      // to the bottom so tagged workstreams take prominence.
      function renderCurrentView() {
        if (!tasksCache.length) {
          tasksTree.innerHTML = '<div class="tasks-current-empty">No tasks yet. Click <strong>+ New</strong> to create one.</div>';
          return;
        }
        // Build parent → children index so we can detect active descendants.
        var byParent = {};
        for (var i = 0; i < tasksCache.length; i++) {
          var t = tasksCache[i];
          var p = (t.parent && t.parent !== "null") ? t.parent : null;
          if (!p) continue;
          (byParent[p] = byParent[p] || []).push(t);
        }
        function isActive(task) { return !(task && task.closed && task.closed.status); }
        function hasActiveDescendant(id, seen) {
          seen = seen || {};
          if (seen[id]) return false;
          seen[id] = true;
          var kids = byParent[id] || [];
          for (var k = 0; k < kids.length; k++) {
            if (isActive(kids[k])) return true;
            if (hasActiveDescendant(kids[k].id, seen)) return true;
          }
          return false;
        }
        var leaves = [];
        for (var j = 0; j < tasksCache.length; j++) {
          var task = tasksCache[j];
          if (!isActive(task)) continue;
          if (hasActiveDescendant(task.id)) continue;
          leaves.push(task);
        }
        if (leaves.length === 0) {
          tasksTree.innerHTML = '<div class="tasks-current-empty">No active leaves. Inbox zero. ✨</div>';
          return;
        }

        // Sort all leaves by updated desc — strict recency, no project grouping.
        leaves.sort(function (a, b) {
          return (Date.parse(b.updated || 0) || 0) - (Date.parse(a.updated || 0) || 0);
        });

        var html = '<div class="tasks-current">';
        for (var l2 = 0; l2 < leaves.length; l2++) {
          html += renderCurrentRow(leaves[l2]);
        }
        html += '</div>';
        tasksTree.innerHTML = html;
        if (currentMultiSelectActive) tasksTree.classList.add("is-multiselect-active");
        else tasksTree.classList.remove("is-multiselect-active");
        updateBulkBar();
      }

      // Map status string → a CSS class that drives the row's status dot
      // colour. Mirrors the legend in the Phase 2 plan (1. Current view).
      function currentStatusClass(status) {
        var s = (status || "").toLowerCase();
        if (s === "done") return "status-done";
        if (s.indexOf("failed") === 0 || s === "escalated") return "status-failed";
        if (s === "waiting:on:user") return "status-waiting-user";
        if (s.indexOf("waiting:on:task") === 0) return "status-waiting-task";
        if (s === "waiting:on:limits") return "status-waiting-limits";
        if (s.indexOf("waiting:") === 0) return "status-waiting-other";
        if (s === "claimed") return "status-claimed";
        return "status-open";
      }

      function renderCurrentRow(task) {
        var statusClass = currentStatusClass(task.status);
        var isClaimed = task.status === "claimed";
        var headline = task.headline || (task.summary && task.summary.brief) || task.brief || "(no headline)";
        var meta = [];
        meta.push(escapeHtml(task.agent || task.to || "?"));
        meta.push(escapeHtml(shortenStatusLabel(task.status || "?")));
        if (task.updated) meta.push(escapeHtml(timeAgo(task.updated)));
        var rowClass = "tasks-current-row " + statusClass;
        if (task.id === currentTaskId) rowClass += " is-active";
        // Checkbox for multi-select close. Not shown for claimed tasks (those
        // require Abort, not Close) since the close endpoint refuses claimed tasks.
        var defaultCloseStatus = (task.status === "done") ? "closed" : "cancelled";
        var checkbox = isClaimed ? "" :
          '<input type="checkbox" class="current-row-select" ' +
          'data-task-id="' + escapeHtml(task.id) + '" ' +
          'data-task-agent="' + escapeHtml(task.agent || task.to || "") + '" ' +
          'data-task-default-status="' + escapeHtml(defaultCloseStatus) + '"' +
          (currentSelected[task.id] ? " checked" : "") + '>';
        // Two-line shape (Kelly 2026-05-20):
        //   row 1: status dot + headline
        //   row 2: task id (left) · agent | status | when (right)
        // The dot stays in the gutter so colour-coding tracks at a glance.
        return (
          '<div class="' + rowClass + '" data-task-id="' + escapeHtml(task.id) + '" role="button" tabindex="0">' +
          checkbox +
          '<span class="tasks-current-row-dot" aria-hidden="true"></span>' +
          '<div class="tasks-current-row-body">' +
          '<div class="tasks-current-row-title" title="' + escapeHtml(task.id) + '">' + escapeHtml(shorten(headline, 96)) + '</div>' +
          '<div class="tasks-current-row-sub">' +
          '<span class="tasks-current-row-id">' + escapeHtml(task.id) + '</span>' +
          '<span class="tasks-current-row-meta">' + meta.join(' · ') + '</span>' +
          '</div>' +
          '</div>' +
          '</div>'
        );
      }

      // WAL-63 Phase 4: Projects card grid. One card per project folder
      // (plus an Unassigned card when un-tagged tasks exist). Each card
      // shows the title (or slug), jira/status pill if known, the rollup
      // counts (active · done-not-closed · stuck · closed), and the last-
      // touched timestamp. Cards sort by most-recently-touched, with
      // Unassigned last.
      var projectsOverviewCache = null;
      var currentProjectSlug = null;
      // Back-stack: when a task detail is opened from a project panel, remember
      // the project so "back" (the picker-toggle on narrow screens) returns to
      // that project panel — one level up — instead of jumping to the full
      // projects list. Cleared once we navigate elsewhere.
      var taskFromProjectSlug = null;
      function renderProjectsView() {
        // Show a quick spinner while we fetch the counts payload — the
        // first paint is cheap (cards from cache) but the cold path can
        // take a beat when there are many envelopes.
        tasksTree.innerHTML = '<div class="tasks-current-empty">Loading projects…</div>';
        loadProjectsOverview().then(function (cards) {
          if (!cards.length) {
            tasksTree.innerHTML = '<div class="tasks-current-empty">No projects yet. Tag a task with <code>project: &lt;slug&gt;</code> or create a <code>Notes/Projects/&lt;slug&gt;/</code> folder.</div>';
            return;
          }
          cards.sort(function (a, b) {
            if (a.slug === "" && b.slug !== "") return 1;
            if (b.slug === "" && a.slug !== "") return -1;
            var ta = a.lastTouched ? Date.parse(a.lastTouched) || 0 : 0;
            var tb = b.lastTouched ? Date.parse(b.lastTouched) || 0 : 0;
            if (tb !== ta) return tb - ta;
            return a.slug.localeCompare(b.slug);
          });
          var html = '<div class="tasks-projects-grid">';
          for (var i = 0; i < cards.length; i++) html += renderProjectCard(cards[i]);
          html += '</div>';
          tasksTree.innerHTML = html;
        }).catch(function (err) {
          tasksTree.innerHTML = '<div class="tasks-current-empty">Error loading projects: ' + escapeHtml(String(err && err.message || err)) + '</div>';
        });
      }

      async function loadProjectsOverview() {
        if (projectsOverviewCache !== null) return projectsOverviewCache;
        try {
          var res = await fetch("/api/projects?counts=1", { cache: "no-store" });
          var data = await res.json();
          projectsOverviewCache = (data && data.ok && Array.isArray(data.projects)) ? data.projects : [];
        } catch (_) {
          projectsOverviewCache = [];
        }
        return projectsOverviewCache;
      }

      function renderProjectCard(card) {
        var displayName = card.title || (card.slug === "" ? "(Unassigned)" : card.slug);
        var slugLine = (card.slug && card.slug !== "" && card.title) ? card.slug : "";
        var jiraPill = card.jira ? '<span class="tasks-project-card-jira">' + escapeHtml(card.jira) + '</span>' : "";
        var statusPill = card.status ? '<span class="tasks-project-card-status">' + escapeHtml(card.status) + '</span>' : "";
        var counts = card.counts || { active: 0, doneNotClosed: 0, stuck: 0, closed: 0 };
        var touched = card.lastTouched ? timeAgo(card.lastTouched) : "no activity";
        var isActiveCard = currentProjectSlug !== null && currentProjectSlug === card.slug;
        return (
          '<div class="tasks-project-card' + (isActiveCard ? ' is-active' : '') + '" data-project-slug="' + escapeHtml(card.slug || "") + '" role="button" tabindex="0">' +
            '<div class="tasks-project-card-head">' +
              '<div class="tasks-project-card-name">' + escapeHtml(displayName) + '</div>' +
              jiraPill + statusPill +
            '</div>' +
            (slugLine ? '<div class="tasks-project-card-slug">' + escapeHtml(slugLine) + '</div>' : '') +
            '<div class="tasks-project-card-counts">' +
              '<span class="count count-active" title="Active">' + counts.active + ' active</span>' +
              '<span class="count count-done" title="Done, not yet closed">' + counts.doneNotClosed + ' done</span>' +
              '<span class="count count-stuck" title="Failed or waiting on dependency">' + counts.stuck + ' stuck</span>' +
              '<span class="count count-closed" title="Closed">' + counts.closed + ' closed</span>' +
            '</div>' +
            '<div class="tasks-project-card-foot">' +
              '<span class="tasks-project-card-touched">' + escapeHtml(touched) + '</span>' +
            '</div>' +
          '</div>'
        );
      }

      // WAL-63 Phase 4 + 4a: project page renderer. Fetches the per-project
      // summary endpoint and renders header / docs shelf / leaves / family
      // trees / closed section into the project pane. Hide-closed toggle
      // state persists per project via localStorage.
      var projectPaneEl = document.getElementById("tasks-project-pane");
      async function openProjectPanel(slug) {
        if (!projectPaneEl) return;
        currentProjectSlug = slug;
        setRightPaneMode("project");
        projectPaneEl.innerHTML = '<div class="task-panel-loading">Loading project…</div>';
        // Refresh card-active highlight in the sidebar.
        if (tasksTree) {
          var cards = tasksTree.querySelectorAll(".tasks-project-card");
          for (var c = 0; c < cards.length; c++) {
            cards[c].classList.toggle("is-active", cards[c].getAttribute("data-project-slug") === slug);
          }
        }
        try {
          var res = await fetch("/api/projects/" + encodeURIComponent(slug || ""), { cache: "no-store" });
          var data = await res.json();
          if (!data.ok || !data.summary) {
            projectPaneEl.innerHTML = '<div class="task-panel-loading">Unable to load project.</div>';
            return;
          }
          renderProjectPage(data.summary);
        } catch (err) {
          projectPaneEl.innerHTML = '<div class="task-panel-loading">Error: ' + escapeHtml(String(err && err.message || err)) + '</div>';
        }
      }

      function projectHideClosedKey(slug) { return "caravel.project.hideClosed." + (slug || "__unassigned__"); }
      function getProjectHideClosed(slug) {
        try {
          return window.localStorage && window.localStorage.getItem(projectHideClosedKey(slug)) === "1";
        } catch (_) { return false; }
      }
      function setProjectHideClosed(slug, hide) {
        try {
          if (!window.localStorage) return;
          if (hide) window.localStorage.setItem(projectHideClosedKey(slug), "1");
          else window.localStorage.removeItem(projectHideClosedKey(slug));
        } catch (_) {}
      }

      function fmtDaysHours(ms) {
        if (!Number.isFinite(ms) || ms < 0) return "—";
        var seconds = Math.floor(ms / 1000);
        var days = Math.floor(seconds / 86400);
        var hours = Math.floor((seconds % 86400) / 3600);
        if (days > 0) return days + "d " + hours + "h";
        var mins = Math.floor((seconds % 3600) / 60);
        return hours + "h " + mins + "m";
      }

      function renderProjectPage(summary) {
        var slug = summary.slug;
        var displayName = summary.title || (slug === "" ? "(Unassigned)" : slug);
        var hideClosed = getProjectHideClosed(slug);

        var headParts = '';
        headParts += '<div class="tasks-project-head">';
        headParts +=   '<div class="tasks-project-head-row">';
        headParts +=     '<div class="tasks-project-title">' + escapeHtml(displayName) + '</div>';
        if (summary.jira) headParts += '<span class="tasks-project-jira">' + escapeHtml(summary.jira) + '</span>';
        if (summary.status) headParts += '<span class="tasks-project-status">' + escapeHtml(summary.status) + '</span>';
        headParts +=   '</div>';
        if (summary.title && slug && slug !== "") {
          headParts += '<div class="tasks-project-slug">' + escapeHtml(slug) + '</div>';
        }
        // Metrics row.
        var medClose = fmtDaysHours(summary.metrics && summary.metrics.medianCloseTimeMs);
        var medAge = fmtDaysHours(summary.metrics && summary.metrics.medianActiveAgeMs);
        headParts += '<div class="tasks-project-metrics">';
        headParts +=   '<span class="metric"><span class="metric-label">Median close time</span><span class="metric-value">' + escapeHtml(medClose) + '</span></span>';
        headParts +=   '<span class="metric"><span class="metric-label">Median active age</span><span class="metric-value">' + escapeHtml(medAge) + '</span></span>';
        headParts +=   '<span class="metric"><span class="metric-label">Active leaves</span><span class="metric-value">' + summary.leaves.length + '</span></span>';
        headParts += '</div>';
        // Actions row.
        headParts += '<div class="tasks-project-actions">';
        if (slug && slug !== "") headParts += '<button type="button" class="task-panel-action is-primary" data-project-new-task="' + escapeHtml(slug) + '">+ New task here</button>';
        headParts += '<label class="task-panel-action task-panel-close-cascade tasks-project-hide-toggle">' +
          '<input type="checkbox" data-project-hide-closed="' + escapeHtml(slug) + '"' + (hideClosed ? ' checked' : '') + ' />' +
          '<span>Hide closed</span></label>';
        headParts += '</div>';
        headParts += '</div>';

        // Docs shelf.
        var docs = summary.docs || { primary: [], fdps: [], other: [] };
        var docsHtml = '';
        if (docs.primary.length || docs.fdps.length || docs.other.length) {
          docsHtml += '<div class="tasks-project-docs">';
          docsHtml += '<div class="tasks-project-docs-head">Documents</div>';
          docsHtml += '<div class="tasks-project-docs-grid">';
          for (var i = 0; i < docs.primary.length; i++) docsHtml += renderDocCard(docs.primary[i], "primary");
          for (var f = 0; f < docs.fdps.length; f++) docsHtml += renderDocCard(docs.fdps[f], "fdp");
          docsHtml += '</div>';
          if (docs.other.length) {
            docsHtml += '<details class="tasks-project-docs-other"><summary>Other docs (' + docs.other.length + ')</summary>';
            docsHtml += '<div class="tasks-project-docs-grid">';
            for (var o = 0; o < docs.other.length; o++) docsHtml += renderDocCard(docs.other[o], "other");
            docsHtml += '</div></details>';
          }
          docsHtml += '</div>';
        }

        // Active leaves section.
        var leavesHtml = '<div class="tasks-project-section">';
        leavesHtml += '<div class="tasks-project-section-head">Active leaves (' + summary.leaves.length + ')</div>';
        if (summary.leaves.length === 0) {
          leavesHtml += '<div class="tasks-current-empty">No active leaves — inbox zero for this project. ✨</div>';
        } else {
          leavesHtml += '<div class="tasks-current">';
          var sortedLeaves = summary.leaves.slice().sort(function (a, b) {
            return (Date.parse(b.updated || 0) || 0) - (Date.parse(a.updated || 0) || 0);
          });
          for (var l = 0; l < sortedLeaves.length; l++) leavesHtml += renderCurrentRow(sortedLeaves[l]);
          leavesHtml += '</div>';
        }
        leavesHtml += '</div>';

        // Family trees — every top-level task with descendants, rendered via
        // the existing tree primitives. Closed rows respect the hide-closed
        // toggle; otherwise they show greyed out via the existing styling.
        var familiesScoped = hideClosed
          ? summary.families.filter(function (t) { return !(t.closed && t.closed.status); })
          : summary.families;
        var familiesHtml = '';
        if (familiesScoped.length > 0) {
          familiesHtml += '<div class="tasks-project-section">';
          familiesHtml += '<div class="tasks-project-section-head">Family trees</div>';
          familiesHtml += '<div class="tasks-project-trees">';
          var tree = buildTaskTree(familiesScoped);
          // Auto-expand top-level roots so the trees aren't collapsed.
          for (var r = 0; r < tree.roots.length; r++) tasksExpanded[tree.roots[r].id] = true;
          var out = [];
          for (var k = 0; k < tree.roots.length; k++) renderTreeBranch(tree, tree.roots[k], 0, out);
          familiesHtml += out.join("");
          familiesHtml += '</div></div>';
        }

        // Closed section.
        var closedHtml = '';
        if (summary.closedTasks.length > 0 && !hideClosed) {
          closedHtml += '<details class="tasks-project-section tasks-project-closed">';
          closedHtml += '<summary class="tasks-project-section-head">Closed (' + summary.closedTasks.length + ')</summary>';
          closedHtml += '<div class="tasks-current">';
          for (var cIdx = 0; cIdx < summary.closedTasks.length; cIdx++) {
            closedHtml += renderCurrentRow(summary.closedTasks[cIdx]);
          }
          closedHtml += '</div></details>';
        }

        projectPaneEl.innerHTML = headParts + docsHtml + leavesHtml + familiesHtml + closedHtml;
      }

      function renderDocCard(doc, kind) {
        var title = doc.title || doc.filename;
        var desc = doc.description ? escapeHtml(shorten(doc.description, 140)) : '';
        var meta = [];
        if (doc.doc_type) meta.push(escapeHtml(doc.doc_type));
        if (doc.last_updated) meta.push(escapeHtml(doc.last_updated));
        return (
          '<button type="button" class="tasks-project-doc-card kind-' + escapeHtml(kind || 'other') + '" data-open-file="' + escapeHtml(doc.path) + '">' +
            '<div class="tasks-project-doc-card-title">' + escapeHtml(title) + '</div>' +
            (desc ? '<div class="tasks-project-doc-card-desc">' + desc + '</div>' : '') +
            (meta.length ? '<div class="tasks-project-doc-card-meta">' + meta.join(' · ') + '</div>' : '') +
          '</button>'
        );
      }

      async function loadTasksTree() {
        if (!tasksTree) return;
        tasksTree.innerHTML = '<div class="tasks-loading">Loading…</div>';
        try {
          var res = await fetch("/api/tasks?limit=120", { cache: "no-store" });
          var data = await res.json();
          if (!data.ok || !Array.isArray(data.tasks)) {
            tasksTree.innerHTML = '<div class="tasks-tree-empty">Unable to load tasks.</div>';
            return;
          }
          tasksCache = data.tasks;
          renderTaskPicker();
        } catch (err) {
          tasksTree.innerHTML = '<div class="tasks-tree-empty">Error: ' + escapeHtml(String(err && err.message || err)) + '</div>';
        }
      }

      // Picker click handlers.
      if (tasksTree) {
        // Multi-select: handle checkbox state changes before the click handler
        // so selecting a task row doesn't also open the task panel.
        tasksTree.addEventListener("change", function (ev) {
          var cb = ev.target;
          if (!cb || cb.type !== "checkbox") return;

          if (cb.classList.contains("current-row-select")) {
            var cbTaskId = cb.getAttribute("data-task-id");
            var cbAgent = cb.getAttribute("data-task-agent") || "";
            var cbStatus = cb.getAttribute("data-task-default-status") || "cancelled";
            if (cb.checked) currentSelected[cbTaskId] = { agent: cbAgent, defaultStatus: cbStatus };
            else delete currentSelected[cbTaskId];
            updateBulkBar();
            updateGroupSelectAll(cb.closest("[data-project-key]"));
            return;
          }

          if (cb.classList.contains("current-group-select-all")) {
            var groupEl = cb.closest("[data-project-key]");
            var rowCbs = groupEl ? groupEl.querySelectorAll(".current-row-select") : [];
            for (var i = 0; i < rowCbs.length; i++) {
              var rCb = rowCbs[i];
              var rId = rCb.getAttribute("data-task-id");
              var rAgent = rCb.getAttribute("data-task-agent") || "";
              var rStatus = rCb.getAttribute("data-task-default-status") || "cancelled";
              if (cb.checked) {
                currentSelected[rId] = { agent: rAgent, defaultStatus: rStatus };
                rCb.checked = true;
              } else {
                delete currentSelected[rId];
                rCb.checked = false;
              }
            }
            updateBulkBar();
            return;
          }
        });

        tasksTree.addEventListener("click", function (ev) {
          // Checkbox clicks are handled by the change event above — stop them
          // from bubbling into the row/group-head handlers below.
          if (ev.target && ev.target.type === "checkbox") {
            ev.stopPropagation();
            return;
          }
          // WAL-63 Phase 2: project-group head toggles collapsed state in
          // the Current view. Handled before the row hit-test so clicking
          // the head doesn't open a task.
          var groupHead = ev.target.closest("[data-toggle-group]");
          if (groupHead) {
            ev.preventDefault();
            var gk = groupHead.getAttribute("data-toggle-group");
            if (gk) {
              if (currentCollapsed[gk]) delete currentCollapsed[gk];
              else currentCollapsed[gk] = true;
              renderTaskPicker();
            }
            return;
          }
          // WAL-63 Phase 4: project card in the Projects view sidebar.
          var projectCardEl = ev.target.closest(".tasks-project-card");
          if (projectCardEl) {
            ev.preventDefault();
            var slug = projectCardEl.getAttribute("data-project-slug");
            if (slug !== null) openProjectPanel(slug);
            return;
          }
          // Chevron toggles parent expansion without opening the row.
          var chevron = ev.target.closest("[data-toggle-expand]");
          if (chevron) {
            ev.preventDefault();
            ev.stopPropagation();
            var pid = chevron.getAttribute("data-toggle-expand");
            if (pid) {
              if (tasksExpanded[pid]) delete tasksExpanded[pid];
              else tasksExpanded[pid] = true;
              renderTaskPicker();
            }
            return;
          }
          var row = ev.target.closest(".tasks-tree-row, .tasks-current-row");
          if (!row) return;
          var taskId = row.getAttribute("data-task-id");
          if (taskId) {
            openTaskPanel(taskId);
            // setRightPaneMode("view") inside openTaskPanel handles the
            // mobile picker collapse — no extra wiring needed here.
          }
        });
        tasksTree.addEventListener("keydown", function (ev) {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          // Space on a checkbox lets the browser toggle it natively (change
          // event handles state update) — don't also open the task panel.
          if (ev.target && ev.target.type === "checkbox") return;
          var row = ev.target.closest(".tasks-tree-row, .tasks-current-row");
          if (!row) return;
          ev.preventDefault();
          var taskId = row.getAttribute("data-task-id");
          if (taskId) openTaskPanel(taskId);
        });

        // Mobile long-press: ~500 ms hold on a task row enters multi-select
        // mode (checkboxes become visible). Moving more than ~8 px or lifting
        // early cancels the timer so normal scrolling is unaffected.
        var lpTimer = null;
        var lpStartX = 0, lpStartY = 0;
        tasksTree.addEventListener("pointerdown", function (ev) {
          if (ev.pointerType !== "touch") return;
          if (ev.target && ev.target.type === "checkbox") return;
          var row = ev.target.closest(".tasks-current-row");
          if (!row) return;
          lpStartX = ev.clientX;
          lpStartY = ev.clientY;
          lpTimer = setTimeout(function () {
            lpTimer = null;
            currentMultiSelectActive = true;
            if (tasksTree) tasksTree.classList.add("is-multiselect-active");
            updateBulkBar();
            // Vibrate briefly as haptic confirmation (no-op where unavailable).
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(40);
          }, 500);
        });
        tasksTree.addEventListener("pointermove", function (ev) {
          if (!lpTimer) return;
          var dx = ev.clientX - lpStartX, dy = ev.clientY - lpStartY;
          if (dx * dx + dy * dy > 64) { clearTimeout(lpTimer); lpTimer = null; }
        });
        tasksTree.addEventListener("pointerup", function () {
          if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
        });
        tasksTree.addEventListener("pointercancel", function () {
          if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
        });
      }

      // WAL-63 Phase 2: view-tabs (Current / Projects / All tasks).
      if (tasksViewTabs) {
        tasksViewTabs.addEventListener("click", function (ev) {
          var btn = ev.target.closest(".tasks-view-tab");
          if (!btn) return;
          var v = btn.getAttribute("data-view");
          if (!v || v === tasksView) return;
          tasksView = v;
          // Explicit view switch = leaving any project drill-down; drop the
          // back-to-project target so a later picker-toggle behaves normally.
          taskFromProjectSlug = null;
          var tabs = tasksViewTabs.querySelectorAll(".tasks-view-tab");
          for (var i = 0; i < tabs.length; i++) {
            var isActive = tabs[i] === btn;
            tabs[i].classList.toggle("is-active", isActive);
            tabs[i].setAttribute("aria-selected", isActive ? "true" : "false");
          }
          // WAL-63 Phase 4: switching INTO Projects refreshes the counts
          // cache so cards reflect what's actually on disk. Switching OUT
          // returns the right pane to empty so the project page doesn't
          // linger over a non-Projects view.
          if (v === "projects") {
            projectsOverviewCache = null;
          } else {
            var projPane = document.getElementById("tasks-project-pane");
            if (projPane && projPane.hidden === false && typeof setRightPaneMode === "function") {
              setRightPaneMode(currentTaskId ? "view" : "empty");
            }
          }
          // Kelly 2026-05-24: on mobile, tapping a top tab should close
          // the task detail and expose the list. CSS hides .tasks-content
          // when .tasks-sidebar is uncollapsed on small viewports, so
          // uncollapsing the sidebar is enough — no need to toggle the
          // right pane separately.
          if (typeof isMobileFiles === "function" && isMobileFiles()) {
            setPickerCollapsed(false);
          }
          renderTaskPicker();
        });
      }

      // Filter chips.
      if (tasksFilterChips) {
        tasksFilterChips.addEventListener("click", function (ev) {
          var chip = ev.target.closest(".tasks-filter-chip");
          if (!chip) return;
          var f = chip.getAttribute("data-filter");
          if (!f) return;
          tasksFilter = f;
          var chips = tasksFilterChips.querySelectorAll(".tasks-filter-chip");
          for (var i = 0; i < chips.length; i++) {
            chips[i].classList.toggle("is-active", chips[i] === chip);
          }
          renderTaskPicker();
        });
      }

      if (tasksRefreshBtn) {
        tasksRefreshBtn.addEventListener("click", function () {
          // WAL-63 Phase 4: invalidate the projects cache on explicit
          // refresh so the card-grid counts catch up with newly-landed
          // tasks. (The task list itself is re-fetched by loadTasksTree.)
          projectsOverviewCache = null;
          loadTasksTree();
        });
      }

      // Mobile picker toggle: tap "Tasks" toolbar button to flip between
      // the list and the viewer/form pane.
      function setTasksPickerCollapsed(collapsed) {
        if (!tasksSidebar || !tasksPickerToggle) return;
        tasksSidebar.classList.toggle("tasks-sidebar-collapsed", collapsed);
        tasksPickerToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        // Mark the panel as "list hidden" so CSS can hide the filter chips
        // — filters are only relevant when looking at the list.
        var panel = document.getElementById("tasks-panel");
        if (panel) panel.classList.toggle("tasks-list-hidden", collapsed);
      }
      if (tasksPickerToggle) {
        tasksPickerToggle.addEventListener("click", function () {
          if (!tasksSidebar) return;
          var collapsed = tasksSidebar.classList.contains("tasks-sidebar-collapsed");
          // Expanding out of a task detail that was reached via a project
          // panel → pop ONE level back to that project panel rather than
          // exposing the full projects list. (To then reach the list, use
          // the Projects view-tab.)
          if (collapsed && currentRightPaneMode === "view" && taskFromProjectSlug !== null) {
            var slug = taskFromProjectSlug;
            taskFromProjectSlug = null;
            openProjectPanel(slug);
            return;
          }
          setTasksPickerCollapsed(!collapsed);
        });
      }

      // WAL-63 Phase 3: project dropdown population. Cached for the page
      // session — Notes/Projects/ rarely changes mid-day, and the dropdown
      // refresh-on-every-open felt sluggish on slow file systems. Forced
      // refresh via the loader call when needed (right now only on first
      // open; can be re-triggered by reloading the page).
      var projectsCache = null;
      async function ensureProjectsLoaded(select) {
        if (!select) return;
        if (projectsCache !== null) return populateProjectSelect(select, projectsCache);
        try {
          var res = await fetch("/api/projects", { cache: "no-store" });
          var data = await res.json();
          projectsCache = (data && data.ok && Array.isArray(data.projects)) ? data.projects : [];
        } catch (_) {
          projectsCache = [];
        }
        populateProjectSelect(select, projectsCache);
      }
      function populateProjectSelect(select, projects) {
        // Preserve current selection if it's still in the new list.
        var current = select.value;
        // Two pinned options at the top: (auto) and (none).
        var html = '<option value="">(auto from context)</option><option value="__none__">(none / unassigned)</option>';
        for (var i = 0; i < projects.length; i++) {
          var p = projects[i];
          var label = p.title ? (p.slug + ' — ' + p.title) : p.slug;
          html += '<option value="' + escapeHtml(p.slug) + '">' + escapeHtml(label) + '</option>';
        }
        select.innerHTML = html;
        // Restore selection when possible.
        if (current && Array.prototype.some.call(select.options, function (o) { return o.value === current; })) {
          select.value = current;
        }
      }

      // "+ New" button — open the new-task form in the right pane.
      if (tasksNewBtn && newForm) {
        tasksNewBtn.addEventListener("click", function () {
          // Single-shot dispatch — clear any leftover parent so a fresh task
          // doesn't accidentally inherit from the previously-viewed one.
          newForm.removeAttribute("data-parent");
          var chip = document.getElementById("multi-agent-new-parent-chip");
          var chipId = document.getElementById("multi-agent-new-parent-id");
          if (chip) chip.setAttribute("hidden", "");
          if (chipId) chipId.textContent = "";
          if (newStatus) { newStatus.textContent = ""; newStatus.classList.remove("is-error"); }
          // Populate the project dropdown on first open (and refresh entries
          // if the cache is set).
          var projectSelect = document.getElementById("multi-agent-new-project");
          if (projectSelect) ensureProjectsLoaded(projectSelect);
          setRightPaneMode("new");
          var headlineEl = document.getElementById("multi-agent-new-headline");
          if (headlineEl) headlineEl.focus();
        });
      }

      // Lazy-load on first activation, then refresh on every subsequent
      // activation so the picker stays current.
      window.__ensureTasksLoaded = function () {
        if (!tasksLoaded) {
          tasksLoaded = true;
          loadTasksTree();
          setRightPaneMode("empty");
        } else {
          loadTasksTree();
        }
      };

      // Unified Next-task submitter. Replaces the prior submitUnblock /
      // submitRevisit pair. Reads source from `data-next-source` ("revisit"
      // for done/failed parents, "unblock" for waiting:on:user parents)
      // and posts to /api/tasks/<id>/next. Server-side, both branches call
      // spawnNextTask() — the parent envelope is left in place and a fresh
      // child is created with parent pointer + Kelly's instruction.
      // Submit the chat-from-task mini-form. Replaces the pre-2026-05-19
      // insta-switch behaviour (which got Kelly stuck mid-handoff when she
      // wanted to switch agents). The form gives a moment to name the chat,
      // pick the right agent, and stage an initial message before the chat
      // tab opens.
      async function submitChatFromTask(wrapper) {
        if (!wrapper) return;
        var taskId = wrapper.getAttribute("data-chat-task-id") || "";
        var parentAgent = wrapper.getAttribute("data-chat-parent-agent") || "";
        var titleEl = wrapper.querySelector(".task-panel-chat-title-input");
        var msgEl = wrapper.querySelector(".task-panel-chat-msg-input");
        var targetSel = wrapper.querySelector(".task-panel-next-target-select");
        var statusEl = wrapper.querySelector(".task-panel-chat-status");
        var btn = wrapper.querySelector(".task-panel-chat-submit");
        var title = (titleEl && titleEl.value) ? String(titleEl.value).trim() : "";
        var initialMsg = (msgEl && msgEl.value) ? String(msgEl.value) : "";
        var pickedAgent = (targetSel && targetSel.value) ? String(targetSel.value).trim() : parentAgent;
        if (!taskId || !pickedAgent) {
          if (statusEl) {
            statusEl.textContent = "Missing task id or agent.";
            statusEl.className = "task-panel-unblock-status task-panel-chat-status is-error";
          }
          return;
        }
        if (btn) btn.disabled = true;
        try {
          // Compute the threadId for the picked agent. Shares with the
          // task worker only when the picked agent === parent's agent.
          // For a different agent the threadId is task-<root>-<other>,
          // which starts a fresh session for that role.
          var taskRoot = String(taskId).split(".")[0];
          var sharedThreadId = "task-" + taskRoot + "-" + pickedAgent;
          var existing = Array.isArray(chatListCache)
            ? chatListCache.find(function (c) { return c.id === sharedThreadId; })
            : null;
          if (existing) {
            await switchToChat(sharedThreadId);
          } else {
            chatSessionId = sharedThreadId;
            try { localStorage.setItem(CHAT_ID_KEY, sharedThreadId); } catch (_) {}
            chatHistory = [];
            chatServerUpdatedAt = null;
            chatAgentLocked = null;
            pendingAgentId = pickedAgent;
            updateAgentBadge();
            updateSendDisabled();
            renderChatHistory();
            schedulePoll();
            loadChatList();
          }
          // Rename if a title was supplied (or if the user kept the
          // pre-filled headline — that's still better than auto).
          if (title) {
            try { await submitChatRename(sharedThreadId, title); } catch (_) {}
          }
          if (typeof setActiveTab === "function") setActiveTab("chat");
          if (chatInput) {
            chatInput.value = initialMsg || "";
            chatInput.focus();
          }
          if (statusEl) {
            statusEl.textContent = existing ? "Switched to existing chat." : "New chat ready — send when you're set.";
            statusEl.className = "task-panel-unblock-status task-panel-chat-status is-ok";
          }
          // Collapse the form back so it's tidy if Kelly returns to the task.
          wrapper.hidden = true;
          if (msgEl) msgEl.value = "";
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = "Error: " + (err && err.message || err);
            statusEl.className = "task-panel-unblock-status task-panel-chat-status is-error";
          }
        } finally {
          if (btn) btn.disabled = false;
        }
      }

      async function submitNext(wrapper) {
        if (!wrapper) return;
        var agent = wrapper.getAttribute("data-next-agent");
        var taskId = wrapper.getAttribute("data-next-id");
        var source = wrapper.getAttribute("data-next-source") || "revisit";
        var input = wrapper.querySelector(".task-panel-next-input");
        var btn = wrapper.querySelector(".task-panel-next-submit");
        var statusEl = wrapper.querySelector(".task-panel-next-status");
        var targetSel = wrapper.querySelector(".task-panel-next-target-select");
        var target = (targetSel && targetSel.value) ? String(targetSel.value).trim() : "";
        var headlineEl = wrapper.querySelector(".task-panel-next-headline-input");
        var headline = (headlineEl && headlineEl.value) ? String(headlineEl.value).trim() : "";
        if (!agent || !taskId || !input) return;
        var instruction = (input.value || "").trim();
        if (!instruction) {
          if (statusEl) {
            statusEl.textContent = source === "unblock" ? "Type a response first." : "Type a next instruction first.";
            statusEl.className = "task-panel-unblock-status task-panel-next-status is-error";
          }
          return;
        }
        if (btn) btn.disabled = true;
        if (statusEl) {
          statusEl.textContent = "Spawning child…";
          statusEl.className = "task-panel-unblock-status task-panel-next-status";
        }
        try {
          var payload = { agent: agent, instruction: instruction, source: source };
          if (target && target !== agent) payload.target = target;
          if (headline) payload.headline = headline;
          var res = await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/next", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          var data = await res.json();
          if (!data.ok) {
            if (statusEl) {
              statusEl.textContent = "Error: " + (data.error || "unknown");
              statusEl.className = "task-panel-unblock-status task-panel-next-status is-error";
            }
            if (btn) btn.disabled = false;
            return;
          }
          if (statusEl) {
            statusEl.textContent = "Child " + (data.id || "?") + " queued.";
            statusEl.className = "task-panel-unblock-status task-panel-next-status is-ok";
          }
          input.value = "";
          // Jump the user to the freshly-spawned child so they can see it
          // pick up. Also refresh tree + summary.
          if (data.id) openTaskPanel(data.id);
          fetchTasks();
          fetchSummary();
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = "Error: " + (err && err.message || err);
            statusEl.className = "task-panel-unblock-status task-panel-next-status is-error";
          }
          if (btn) btn.disabled = false;
        }
      }

      // WAL-63 Phase 1: submit a Close request. Reads the optional reason
      // textarea and cascade checkbox from the inline close form, posts to
      // /api/tasks/<id>/close, refreshes the picker + viewer on success.
      async function submitClose(wrapper) {
        if (!wrapper) return;
        var agent = wrapper.getAttribute("data-close-agent");
        var taskId = wrapper.getAttribute("data-close-id");
        var defaultStatus = wrapper.getAttribute("data-close-default-status") || "closed";
        var input = wrapper.querySelector(".task-panel-close-input");
        var cascadeBox = wrapper.querySelector(".task-panel-close-cascade-checkbox");
        var btn = wrapper.querySelector(".task-panel-close-submit");
        var statusEl = wrapper.querySelector(".task-panel-close-status");
        if (!agent || !taskId) return;
        var reason = input ? (input.value || "").trim() : "";
        var cascade = !!(cascadeBox && cascadeBox.checked);
        if (btn) btn.disabled = true;
        if (statusEl) {
          statusEl.textContent = "Closing…";
          statusEl.className = "task-panel-close-status task-panel-unblock-status";
        }
        try {
          var res = await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/close", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: agent, reason: reason, status: defaultStatus, cascade: cascade }),
          });
          var data = await res.json();
          if (!data.ok) {
            if (statusEl) {
              statusEl.textContent = "Error: " + (data.error || "unknown");
              statusEl.className = "task-panel-close-status task-panel-unblock-status is-error";
            }
            if (btn) btn.disabled = false;
            return;
          }
          var cascadedCount = (data.cascaded && data.cascaded.length) || 0;
          if (statusEl) {
            statusEl.textContent = cascadedCount > 0
              ? "Closed (cascade: " + cascadedCount + " task" + (cascadedCount === 1 ? "" : "s") + ")."
              : "Closed.";
            statusEl.className = "task-panel-close-status task-panel-unblock-status is-ok";
          }
          openTaskPanel(taskId); // refresh viewer with new closed state
          fetchTasks();
          fetchSummary();
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = "Error: " + (err && err.message || err);
            statusEl.className = "task-panel-close-status task-panel-unblock-status is-error";
          }
          if (btn) btn.disabled = false;
        }
      }

      // Open the new-task form pre-populated for a follow-on task. Sets the
      // parent, seeds context with the source report + child review paths,
      // and pre-fills a headline and brief referencing the source task.
      function openFollowOnForm(sourceTaskId, sourceAgent) {
        if (!newForm || !sourceTaskId) return;

        // Find the source card from the currently loaded chain.
        var sourceCard = null;
        var childReviewPaths = [];
        if (currentTaskChain) {
          if (currentTaskChain.task && currentTaskChain.task.id === sourceTaskId) {
            sourceCard = currentTaskChain.task;
            var children = currentTaskChain.children || [];
            for (var ci = 0; ci < children.length; ci++) {
              var ch = children[ci];
              if (ch.reportPath) childReviewPaths.push(ch.reportPath);
            }
          } else {
            // Source may be an ancestor or sibling in the chain.
            var all = (currentTaskChain.ancestors || []).concat(currentTaskChain.children || []);
            for (var ai = 0; ai < all.length; ai++) {
              if (all[ai].id === sourceTaskId) { sourceCard = all[ai]; break; }
            }
          }
        }

        // Build context list: source report first, then child deliverables.
        var contextLines = [];
        if (sourceCard && sourceCard.reportPath) {
          contextLines.push(sourceCard.reportPath);
          var delivs = sourceCard.deliverables || [];
          for (var di = 0; di < delivs.length; di++) contextLines.push(delivs[di]);
        }
        for (var ri = 0; ri < childReviewPaths.length; ri++) {
          if (childReviewPaths[ri] && contextLines.indexOf(childReviewPaths[ri]) === -1) {
            contextLines.push(childReviewPaths[ri]);
          }
        }

        // Headline: "Follow-on: <first N words of source headline>" ≤10 words.
        var sourceHeadline = sourceCard ? (sourceCard.headline || sourceTaskId) : sourceTaskId;
        var srcWords = String(sourceHeadline).split(/\s+/).filter(Boolean);
        var headlineSuggest = ("Follow-on: " + srcWords.slice(0, 8).join(" ")).trim();

        // Brief: short reference block Kelly can extend.
        var briefSuggest = "Follow-on from " + sourceTaskId + " — " + String(sourceHeadline).slice(0, 120) + ".\n\n";

        // Stamp the parent and reveal the parent chip.
        newForm.setAttribute("data-parent", sourceTaskId);
        var parentChipEl = document.getElementById("multi-agent-new-parent-chip");
        var parentChipIdEl = document.getElementById("multi-agent-new-parent-id");
        if (parentChipEl) parentChipEl.removeAttribute("hidden");
        if (parentChipIdEl) parentChipIdEl.textContent = sourceTaskId;

        // Fill fields.
        var headlineEl = document.getElementById("multi-agent-new-headline");
        if (headlineEl) headlineEl.value = headlineSuggest;

        var briefEl = document.getElementById("multi-agent-new-brief");
        if (briefEl) briefEl.value = briefSuggest;

        var ctxEl = document.getElementById("multi-agent-new-context");
        if (ctxEl) ctxEl.value = contextLines.join("\n");

        // Suggest a target agent: cliff → bob (hand review result to builder),
        // otherwise keep the same agent so Kelly can override.
        var toEl = document.getElementById("multi-agent-new-to");
        if (toEl && sourceAgent) {
          var suggestedAgent = sourceAgent === "cliff" ? "bob" : sourceAgent;
          for (var oi = 0; oi < toEl.options.length; oi++) {
            if (toEl.options[oi].value === suggestedAgent) { toEl.value = suggestedAgent; break; }
          }
        }

        // Pre-select the source task's project if available.
        if (sourceCard && sourceCard.project) {
          var projEl = document.getElementById("multi-agent-new-project");
          if (projEl) {
            var srcProject = sourceCard.project;
            ensureProjectsLoaded(projEl).then(function () {
              for (var pi = 0; pi < projEl.options.length; pi++) {
                if (projEl.options[pi].value === srcProject) { projEl.value = srcProject; break; }
              }
            }).catch(function () {});
          }
        }

        if (newStatus) { newStatus.textContent = ""; newStatus.classList.remove("is-error"); }
        updateHeadlineCount();
        setRightPaneMode("new");
        var focusEl = document.getElementById("multi-agent-new-headline");
        if (focusEl) focusEl.focus();
      }

      // Submit an Abort request — kills the live worker for a claimed task.
      // Reads the optional reason from the inline abort form, posts to
      // /api/tasks/<id>/abort, refreshes the picker + viewer on success.
      async function submitAbort(wrapper) {
        if (!wrapper) return;
        var agent = wrapper.getAttribute("data-abort-agent");
        var taskId = wrapper.getAttribute("data-abort-id");
        var input = wrapper.querySelector(".task-panel-abort-input");
        var btn = wrapper.querySelector(".task-panel-abort-submit");
        var statusEl = wrapper.querySelector(".task-panel-abort-status");
        if (!agent || !taskId) return;
        var reason = input ? (input.value || "").trim() : "";
        if (btn) btn.disabled = true;
        if (statusEl) {
          statusEl.textContent = "Killing worker…";
          statusEl.className = "task-panel-abort-status task-panel-unblock-status";
        }
        try {
          var res = await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/abort", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: agent, reason: reason }),
          });
          var data = await res.json();
          if (!data.ok) {
            if (statusEl) {
              statusEl.textContent = "Error: " + (data.error || "unknown");
              statusEl.className = "task-panel-abort-status task-panel-unblock-status is-error";
            }
            if (btn) btn.disabled = false;
            return;
          }
          if (statusEl) {
            statusEl.textContent = data.mode === "stale"
              ? "Cancelled (no live worker — stale claim cleared)."
              : "Worker killed — finalising as cancelled…";
            statusEl.className = "task-panel-abort-status task-panel-unblock-status is-ok";
          }
          // The runner finalises the envelope a beat after the kill; give it
          // a moment, then refresh so the cancelled state shows.
          setTimeout(function () { openTaskPanel(taskId); fetchTasks(); fetchSummary(); }, data.mode === "stale" ? 0 : 1200);
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = "Error: " + (err && err.message || err);
            statusEl.className = "task-panel-abort-status task-panel-unblock-status is-error";
          }
          if (btn) btn.disabled = false;
        }
      }

      // WAL-63 Phase 1: reopen — drops the closed block back to null. No
      // confirmation; the action is fully reversible. The viewer refresh
      // re-renders without the banner, and the Next button becomes available.
      async function submitReopen(btn) {
        if (!btn) return;
        var agent = btn.getAttribute("data-reopen-agent");
        var taskId = btn.getAttribute("data-reopen-task");
        if (!agent || !taskId) return;
        btn.disabled = true;
        try {
          var res = await fetch("/api/tasks/" + encodeURIComponent(taskId) + "/reopen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: agent }),
          });
          var data = await res.json();
          if (!data.ok) {
            console.warn("Reopen failed:", data.error);
            btn.disabled = false;
            return;
          }
          openTaskPanel(taskId);
          fetchTasks();
          fetchSummary();
        } catch (err) {
          console.warn("Reopen error:", err);
          btn.disabled = false;
        }
      }

      // (Removed: spawnFollowUp() — the old "↳ Next" button that opened the
      // full new-task form. Replaced by the unified "↳ Next" affordance on
      // the task card itself, which spawns a child via /api/tasks/<id>/next
      // without a separate form. See submitNext above.)

      // Delegate clicks inside the task panel for action buttons.
      // WAL-63 Phase 4: project pane click delegate. Handles task rows
      // (open the task viewer), tree-chevron toggles (expand/collapse a
      // sub-tree in the Family Trees section), doc-card opens (route to the
      // Files panel), hide-closed toggle, and "+ New task here" button.
      if (projectPaneEl) {
        projectPaneEl.addEventListener("click", function (ev) {
          // Doc card opens the file in the Files tab.
          var docBtn = ev.target.closest("[data-open-file]");
          if (docBtn) {
            ev.preventDefault();
            var path = docBtn.getAttribute("data-open-file");
            try {
              if (typeof setActiveTab === "function") setActiveTab("files");
              if (typeof loadFile === "function" && path) loadFile(path);
            } catch (_) {}
            return;
          }
          // Hide-closed toggle is a label-wrapped checkbox; let the checkbox
          // emit the change event itself — handled below.
          var newHere = ev.target.closest("[data-project-new-task]");
          if (newHere) {
            ev.preventDefault();
            var newSlug = newHere.getAttribute("data-project-new-task");
            openNewTaskFormForProject(newSlug);
            return;
          }
          // Tree-chevron in the Family Trees section.
          var chevron = ev.target.closest("[data-toggle-expand]");
          if (chevron) {
            ev.preventDefault();
            ev.stopPropagation();
            var pid = chevron.getAttribute("data-toggle-expand");
            if (pid && currentProjectSlug !== null) {
              if (tasksExpanded[pid]) delete tasksExpanded[pid];
              else tasksExpanded[pid] = true;
              openProjectPanel(currentProjectSlug);
            }
            return;
          }
          // Task row → open viewer (replaces the project page in the right
          // pane until Kelly clicks the card again).
          var row = ev.target.closest(".tasks-tree-row, .tasks-current-row");
          if (row) {
            var taskId = row.getAttribute("data-task-id");
            if (taskId) openTaskPanel(taskId);
            return;
          }
        });
        projectPaneEl.addEventListener("change", function (ev) {
          var toggle = ev.target.closest("[data-project-hide-closed]");
          if (toggle) {
            var s = toggle.getAttribute("data-project-hide-closed");
            setProjectHideClosed(s, toggle.checked);
            if (currentProjectSlug !== null) openProjectPanel(currentProjectSlug);
            return;
          }
        });
      }

      // Click the "+ New task here" button on the project page → open the
      // existing new-task form with the project dropdown pre-selected and
      // a tag indicating the source.
      async function openNewTaskFormForProject(slug) {
        if (!newForm) return;
        newForm.removeAttribute("data-parent");
        var chip = document.getElementById("multi-agent-new-parent-chip");
        var chipId = document.getElementById("multi-agent-new-parent-id");
        if (chip) chip.setAttribute("hidden", "");
        if (chipId) chipId.textContent = "";
        if (newStatus) { newStatus.textContent = ""; newStatus.classList.remove("is-error"); }
        var projectSelect = document.getElementById("multi-agent-new-project");
        if (projectSelect) {
          await ensureProjectsLoaded(projectSelect);
          // Force-select the requested slug if it's in the list; otherwise
          // leave on (auto) — the form's auto-infer will pick it up via
          // context paths if the user adds the right file references.
          var found = Array.prototype.some.call(projectSelect.options, function (o) { return o.value === slug; });
          projectSelect.value = found ? slug : "";
        }
        setRightPaneMode("new");
        var headlineEl = document.getElementById("multi-agent-new-headline");
        if (headlineEl) headlineEl.focus();
      }

      if (taskPanelBody) {
        taskPanelBody.addEventListener("click", function (ev) {
          var nextBtn = ev.target.closest(".task-panel-next-submit");
          if (nextBtn) {
            ev.preventDefault();
            submitNext(nextBtn.closest(".task-panel-next"));
            return;
          }
          var pillBtn = ev.target.closest("[data-doc-pill]");
          if (pillBtn) {
            ev.preventDefault();
            var pane = pillBtn.closest(".task-panel-report-pane");
            setActiveReportDoc(pane, pillBtn.getAttribute("data-doc-pill"));
            return;
          }
          // Project chip click — swap to dropdown of known projects + Unassigned.
          var projChip = ev.target.closest("[data-project-edit]");
          if (projChip && !projChip.querySelector("select")) {
            ev.preventDefault();
            var projTaskId = projChip.getAttribute("data-project-edit") || "";
            var projAgent = projChip.getAttribute("data-project-agent") || "";
            var projCurrent = projChip.getAttribute("data-project-current") || "";
            if (!projTaskId || !projAgent) return;
            // Distinct project values from tasksCache.
            var seenProj = {};
            var projOptions = [];
            for (var pi = 0; pi < (tasksCache || []).length; pi++) {
              var pp = tasksCache[pi] && tasksCache[pi].project;
              if (pp && !seenProj[pp]) { seenProj[pp] = true; projOptions.push(pp); }
            }
            projOptions.sort();
            var prevLabel = projChip.textContent;
            projChip.textContent = "";
            var sel = document.createElement("select");
            sel.className = "task-panel-project-select";
            var optNone = document.createElement("option");
            optNone.value = "__none__";
            optNone.textContent = "— Unassigned —";
            if (!projCurrent) optNone.selected = true;
            sel.appendChild(optNone);
            for (var pj = 0; pj < projOptions.length; pj++) {
              var opt = document.createElement("option");
              opt.value = projOptions[pj];
              opt.textContent = projOptions[pj];
              if (projOptions[pj] === projCurrent) opt.selected = true;
              sel.appendChild(opt);
            }
            // "+ New…" option triggers a prompt for an ad-hoc slug.
            var optNew = document.createElement("option");
            optNew.value = "__new__";
            optNew.textContent = "+ New project…";
            sel.appendChild(optNew);
            projChip.appendChild(sel);
            sel.focus();
            var revert = function () {
              projChip.textContent = prevLabel;
            };
            var commit = async function () {
              var val = sel.value;
              var isNew = false;
              if (val === "__new__") {
                var typed = (window.prompt("New project slug (folder under Notes/Projects/, e.g. TPD-300_my-project):", "") || "").trim();
                if (!typed) { revert(); return; }
                isNew = true;
                val = typed;
              }
              var payload = (val === "__none__")
                ? { agent: projAgent, project: null }
                : { agent: projAgent, project: val };
              projChip.textContent = "📁 saving…";
              try {
                // Create the project folder when the user typed a new slug.
                if (isNew) {
                  var createRes = await fetch("/api/projects", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ slug: val }),
                  });
                  var createData = await createRes.json();
                  if (!createData || !createData.ok) {
                    revert();
                    if (typeof console !== "undefined") console.warn("createProject failed:", createData && createData.error);
                    return;
                  }
                  // Invalidate the projects cache so the new-task form
                  // dropdown picks up the new folder on next open.
                  projectsCache = null;
                }
                var r = await fetch("/api/tasks/" + encodeURIComponent(projTaskId) + "/project", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                var data = await r.json();
                if (!data || !data.ok) {
                  revert();
                  if (typeof console !== "undefined") console.warn("setTaskProject failed:", data && data.error);
                  return;
                }
                // Refresh the panel so the chip shows the new value and
                // tasksCache repopulates (so other chips know about the
                // new slug if it was a fresh "+ New" entry).
                if (typeof openTaskPanel === "function") openTaskPanel(projTaskId);
                if (typeof fetchTasks === "function") fetchTasks();
              } catch (err) {
                revert();
                if (typeof console !== "undefined") console.warn("setTaskProject error:", err);
              }
            };
            sel.addEventListener("change", commit);
            sel.addEventListener("blur", function () {
              // If user blurred without picking anything, revert.
              if (projChip.contains(sel)) revert();
            });
            return;
          }
          // WAL-63 Phase 1: Close / Reopen handlers.
          var toggleCloseBtn = ev.target.closest("[data-toggle-close]");
          if (toggleCloseBtn) {
            ev.preventDefault();
            var closeCard = toggleCloseBtn.closest(".task-panel-card");
            if (closeCard) {
              var closeForm = closeCard.querySelector(".task-panel-close-form");
              if (closeForm) {
                closeForm.hidden = false;
                var closeInput = closeForm.querySelector(".task-panel-close-input");
                if (closeInput) closeInput.focus();
                closeForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            }
            return;
          }
          var closeSubmitBtn = ev.target.closest(".task-panel-close-submit");
          if (closeSubmitBtn) {
            ev.preventDefault();
            submitClose(closeSubmitBtn.closest(".task-panel-close-form"));
            return;
          }
          var closeCancelBtn = ev.target.closest(".task-panel-close-cancel");
          if (closeCancelBtn) {
            ev.preventDefault();
            var dismissForm = closeCancelBtn.closest(".task-panel-close-form");
            if (dismissForm) dismissForm.hidden = true;
            return;
          }
          // Abort (claimed mid-flight) — toggle / submit / dismiss.
          var toggleAbortBtn = ev.target.closest("[data-toggle-abort]");
          if (toggleAbortBtn) {
            ev.preventDefault();
            var abortCard = toggleAbortBtn.closest(".task-panel-card");
            if (abortCard) {
              var abortForm = abortCard.querySelector(".task-panel-abort-form");
              if (abortForm) {
                abortForm.hidden = false;
                var abortInput = abortForm.querySelector(".task-panel-abort-input");
                if (abortInput) abortInput.focus();
                abortForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            }
            return;
          }
          var abortSubmitBtn = ev.target.closest(".task-panel-abort-submit");
          if (abortSubmitBtn) {
            ev.preventDefault();
            submitAbort(abortSubmitBtn.closest(".task-panel-abort-form"));
            return;
          }
          var abortCancelBtn = ev.target.closest(".task-panel-abort-cancel");
          if (abortCancelBtn) {
            ev.preventDefault();
            var dismissAbort = abortCancelBtn.closest(".task-panel-abort-form");
            if (dismissAbort) dismissAbort.hidden = true;
            return;
          }
          var reopenBtn = ev.target.closest("[data-reopen-task]");
          if (reopenBtn) {
            ev.preventDefault();
            submitReopen(reopenBtn);
            return;
          }
          var followonBtn = ev.target.closest("[data-followon-task]");
          if (followonBtn) {
            ev.preventDefault();
            openFollowOnForm(
              followonBtn.getAttribute("data-followon-task"),
              followonBtn.getAttribute("data-followon-agent") || ""
            );
            return;
          }
          var openTaskBtn = ev.target.closest("[data-open-task]");
          if (openTaskBtn) {
            ev.preventDefault();
            openTaskPanel(openTaskBtn.getAttribute("data-open-task"));
            return;
          }
          var openFileBtn = ev.target.closest("[data-open-file]");
          if (openFileBtn) {
            ev.preventDefault();
            var filePath = openFileBtn.getAttribute("data-open-file");
            var fromTask = openFileBtn.getAttribute("data-from-task") || currentTaskId;
            try {
              if (typeof setActiveTab === "function") setActiveTab("files");
              if (typeof loadFile === "function" && filePath) loadFile(filePath);
              if (fromTask) window.__taskBackContext = fromTask;
              renderFilesBackButton();
            } catch (_) {}
            return;
          }
          var openFolderBtn = ev.target.closest("[data-open-folder]");
          if (openFolderBtn) {
            ev.preventDefault();
            var folderPath = openFolderBtn.getAttribute("data-open-folder") || ".";
            var fromTaskF = openFolderBtn.getAttribute("data-from-task") || currentTaskId;
            try {
              if (typeof setActiveTab === "function") setActiveTab("files");
              if (typeof loadDirectory === "function") loadDirectory(folderPath);
              if (fromTaskF) window.__taskBackContext = fromTaskF;
              renderFilesBackButton();
            } catch (_) {}
            return;
          }
          var toggleChatBtn = ev.target.closest("[data-toggle-chat]");
          if (toggleChatBtn) {
            ev.preventDefault();
            var chatCard = toggleChatBtn.closest(".task-panel-card");
            if (chatCard) {
              var chatForm = chatCard.querySelector(".task-panel-chat-form");
              if (chatForm) {
                chatForm.hidden = false;
                var chatTa = chatForm.querySelector(".task-panel-chat-msg-input");
                if (chatTa) chatTa.focus();
                chatForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            }
            return;
          }
          var chatSubmitBtn = ev.target.closest(".task-panel-chat-submit");
          if (chatSubmitBtn) {
            ev.preventDefault();
            submitChatFromTask(chatSubmitBtn.closest(".task-panel-chat-form"));
            return;
          }
          // (Legacy: spawn-agent was instant chat-switch; now superseded by
          // the toggle-chat form above. Kept the placeholder so any cached
          // markup with the old attribute still no-ops gracefully.)
          var spawnBtn = ev.target.closest("[data-spawn-agent]");
          if (spawnBtn) {
            ev.preventDefault();
            var agentName = spawnBtn.getAttribute("data-spawn-agent");
            var taskId2 = spawnBtn.getAttribute("data-spawn-task");
            try {
              // Share the worker's Claude session so the agent doesn't have
              // to reload its CLAUDE.md, brief context or project README.
              // The runner threads workers on `task-<root>-<agent>`; Claude
              // SDK sessions are keyed purely on the threadId, so when the
              // chat's chatId matches the worker's threadId the first chat
              // message resumes the worker's hot session.
              var taskRoot = taskId2 ? String(taskId2).split(".")[0] : "";
              var sharedThreadId = (taskRoot && agentName) ? ("task-" + taskRoot + "-" + agentName) : null;
              var existing = null;
              if (sharedThreadId && Array.isArray(chatListCache)) {
                existing = chatListCache.find(function (c) { return c.id === sharedThreadId; });
              }
              if (existing) {
                switchToChat(sharedThreadId);
              } else if (sharedThreadId) {
                chatSessionId = sharedThreadId;
                try { localStorage.setItem(CHAT_ID_KEY, sharedThreadId); } catch (_) {}
                chatHistory = [];
                chatServerUpdatedAt = null;
                chatAgentLocked = null;
                pendingAgentId = agentName || null;
                updateAgentBadge();
                updateSendDisabled();
                renderChatHistory();
                schedulePoll();
                loadChatList();
              } else {
                // Defensive fallback: no task id or agent — behave like the
                // pre-Item-6 path (fresh chat, no session sharing).
                if (typeof startNewChat === "function") startNewChat();
                if (agentName && Array.isArray(agentsCache)) {
                  var match = agentsCache.find(function (a) { return a.name === agentName; });
                  if (match) pendingAgentId = match.name;
                }
              }
              if (typeof setActiveTab === "function") setActiveTab("chat");
              if (chatInput) {
                // No "read the envelope" pre-fill — when we share the worker's
                // session the agent already has full context. Let Kelly type
                // her first message naturally.
                chatInput.value = "";
                chatInput.focus();
              }
            } catch (_) {}
          }
        });
      }

      // Render a "← Back to TSK-…" button inside the files toolbar when the
      // user navigated to a file from a task. Clicking it returns to that task.
      function renderFilesBackButton() {
        var fromTask = window.__taskBackContext;
        var navGroup = document.querySelector(".files-nav-group");
        var existing = document.getElementById("files-back-to-task");
        if (!fromTask) {
          if (existing) existing.remove();
          return;
        }
        if (!navGroup) return;
        if (existing) existing.remove();
        var btn = document.createElement("button");
        btn.id = "files-back-to-task";
        btn.type = "button";
        btn.className = "files-nav-btn files-back-to-task";
        btn.title = "Back to " + fromTask;
        btn.textContent = "← " + fromTask;
        btn.addEventListener("click", function () {
          var t = window.__taskBackContext;
          window.__taskBackContext = null;
          renderFilesBackButton();
          if (t) openTaskPanel(t);
        });
        navGroup.appendChild(btn);
      }
      // Expose so other modules can clear it when navigating away from files.
      window.__renderFilesBackButton = renderFilesBackButton;

      // Live word counter for the headline field — flips red over 10 words.
      var headlineInput = document.getElementById("multi-agent-new-headline");
      var headlineCounter = document.getElementById("multi-agent-new-headline-count");
      function updateHeadlineCount() {
        if (!headlineInput || !headlineCounter) return;
        var v = (headlineInput.value || "").trim();
        var words = v ? v.split(/\s+/).filter(Boolean).length : 0;
        headlineCounter.textContent = words + " / 10 words";
        headlineCounter.classList.toggle("is-over", words > 10);
      }
      if (headlineInput) headlineInput.addEventListener("input", updateHeadlineCount);
      updateHeadlineCount();

      function clearParentChip() {
        if (!newForm) return;
        newForm.removeAttribute("data-parent");
        var chipEl = document.getElementById("multi-agent-new-parent-chip");
        var chipIdEl = document.getElementById("multi-agent-new-parent-id");
        if (chipEl) chipEl.setAttribute("hidden", "");
        if (chipIdEl) chipIdEl.textContent = "";
      }

      if (newCancelBtn && newForm) {
        newCancelBtn.addEventListener("click", function () {
          // Cancel always clears any pending parent — Spawn Follow-up is a
          // single-shot intent, not a sticky form mode.
          clearParentChip();
          if (newStatus) newStatus.textContent = "";
          // Drop back to the empty-state placeholder (or current task view if
          // we still have one selected).
          if (typeof setRightPaneMode === "function") {
            setRightPaneMode(currentTaskId ? "view" : "empty");
          }
        });
      }

      var parentClearBtn = document.getElementById("multi-agent-new-parent-clear");
      if (parentClearBtn) {
        parentClearBtn.addEventListener("click", clearParentChip);
      }

      if (newForm) {
        newForm.addEventListener("submit", async function (ev) {
          ev.preventDefault();
          var headline = ((document.getElementById("multi-agent-new-headline") || {}).value || "").trim();
          var to = (document.getElementById("multi-agent-new-to") || {}).value || "";
          var kind = (document.getElementById("multi-agent-new-kind") || {}).value || "";
          var priority = (document.getElementById("multi-agent-new-priority") || {}).value || "";
          var from = ((document.getElementById("multi-agent-new-from") || {}).value || "user").trim() || "user";
          var brief = ((document.getElementById("multi-agent-new-brief") || {}).value || "").trim();
          var output = ((document.getElementById("multi-agent-new-output") || {}).value || "").trim();
          var contextRaw = ((document.getElementById("multi-agent-new-context") || {}).value || "").trim();
          var context = contextRaw ? contextRaw.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean) : [];

          var headlineWords = headline ? headline.split(/\s+/).filter(Boolean).length : 0;
          if (!headline) {
            if (newStatus) { newStatus.textContent = "Headline is required (≤10 words)."; newStatus.classList.add("is-error"); }
            return;
          }
          if (headlineWords > 10) {
            if (newStatus) { newStatus.textContent = "Headline too long (" + headlineWords + " words; max 10)."; newStatus.classList.add("is-error"); }
            return;
          }
          if (!brief) {
            if (newStatus) { newStatus.textContent = "Brief is required."; newStatus.classList.add("is-error"); }
            return;
          }
          if (newStatus) { newStatus.textContent = "Dispatching…"; newStatus.classList.remove("is-error"); }
          try {
            var payload = { headline: headline, to: to, from: from, kind: kind, priority: priority, brief: brief, output_format: output, context: context };
            // WAL-63 Phase 3: forward the project dropdown selection. Empty
            // string = "(auto from context)" — omit so the service infers.
            // "__none__" = explicit no-project — send null so the service
            // skips the inference fallback.
            var projectEl = document.getElementById("multi-agent-new-project");
            if (projectEl) {
              var projVal = (projectEl.value || "").trim();
              if (projVal === "__none__") payload.project = null;
              else if (projVal) payload.project = projVal;
              // else: leave payload.project undefined → service auto-infers.
            }
            // Spawn Follow-up stamps the parent on the form's data attribute;
            // forwarding it tells the service to allocate a decimal sub-task
            // id (`<parent>.N`).
            var parentAttr = newForm.getAttribute("data-parent");
            if (parentAttr) payload.parent = parentAttr;
            var res = await fetch("/api/tasks/new", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            var data = await res.json();
            if (!data.ok) {
              if (newStatus) { newStatus.textContent = "Error: " + (data.error || "unknown"); newStatus.classList.add("is-error"); }
              return;
            }
            if (newStatus) { newStatus.textContent = "Dispatched " + data.id; newStatus.classList.remove("is-error"); }
            // Reset form fields. Keep kind/target so the user can fire another
            // quickly. Parent is single-shot — clear it.
            var headlineEl = document.getElementById("multi-agent-new-headline");
            var briefEl = document.getElementById("multi-agent-new-brief");
            var outputEl = document.getElementById("multi-agent-new-output");
            var ctxEl = document.getElementById("multi-agent-new-context");
            if (headlineEl) headlineEl.value = "";
            if (briefEl) briefEl.value = "";
            if (outputEl) outputEl.value = "";
            if (ctxEl) ctxEl.value = "";
            clearParentChip();
            updateHeadlineCount();
            // Refresh the picker and surface the freshly dispatched task in
            // the right pane.
            try {
              await loadTasksTree();
              if (data.id) {
                openTaskPanel(data.id);
              } else {
                setRightPaneMode("empty");
              }
            } catch (_) {
              setRightPaneMode("empty");
            }
            fetchSummary();
          } catch (err) {
            if (newStatus) newStatus.textContent = "Error: " + (err && err.message || err);
          }
        });
      }
    })();