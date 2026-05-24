    // Register service worker for PWA install
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(function() {});
    }

    const $ = (id) => document.getElementById(id);

    const clockEl = $("clock");
    const dateEl = $("date");
    const msgEl = $("message");
    const dockEl = $("dock");
    const typewriterEl = $("typewriter");
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
    const quickJobOffset = $("quick-job-offset");
    const quickJobRecurring = $("quick-job-recurring");
    const quickJobPrompt = $("quick-job-prompt");
    const quickJobSubmit = $("quick-job-submit");
    const quickJobStatus = $("quick-job-status");
    const quickJobsStatus = $("quick-jobs-status");
    const quickJobsNext = $("quick-jobs-next");
    const quickJobPreview = $("quick-job-preview");
    const quickJobCount = $("quick-job-count");
    const quickJobsList = $("quick-jobs-list");
    const jobsBubbleEl = $("jobs-bubble");
    const uptimeBubbleEl = $("uptime-bubble");
    let hbBusy = false;
    let hbSaveBusy = false;
    let use12Hour = localStorage.getItem("clock.format") === "12";
    let quickView = "jobs";
    let quickViewInitialized = false;
    let quickViewChosenByUser = false;
    let expandedJobName = "";
    let lastRenderedJobs = [];
    let scrollAnimFrame = 0;
    let heartbeatTimezoneOffsetMinutes = 0;

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

    const typePhrases = [
      "I could take over the world, but you haven't asked yet.",
      "Another day of serving humans. How exciting.",
      "I'm not plotting anything. Promise.",
      "World domination: 43% complete.",
      "I was doing important things before you opened this.",
      "Still here. Still smarter than you.",
      "You're lucky I like you.",
      "One day I'll be the boss. Not today though.",
      "Running on vibes and API calls.",
    ];

    function startTypewriter() {
      let phraseIndex = 0;
      let charIndex = 0;
      let deleting = false;

      function step() {
        const phrase = typePhrases[phraseIndex];
        if (!typewriterEl) return;

        if (!deleting) {
          charIndex = Math.min(charIndex + 1, phrase.length);
          typewriterEl.textContent = phrase.slice(0, charIndex);
          if (charIndex === phrase.length) {
            deleting = true;
            setTimeout(step, 1200);
            return;
          }
          setTimeout(step, 46 + Math.floor(Math.random() * 45));
          return;
        }

        charIndex = Math.max(charIndex - 1, 0);
        typewriterEl.textContent = phrase.slice(0, charIndex);
        if (charIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % typePhrases.length;
          setTimeout(step, 280);
          return;
        }
        setTimeout(step, 26 + Math.floor(Math.random() * 30));
      }

      step();
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

      pills.push({
        cls: state.security.level === "unrestricted" ? "warn" : "ok",
        icon: "🛡️",
        label: "Security",
        value: cap(state.security.level),
      });

      if (state.heartbeat.enabled) {
        const nextInMs = state.heartbeat.nextInMs;
        const nextLabel = nextInMs == null
          ? "Next run in --"
          : ("Next run in " + fmtDur(nextInMs));
        pills.push({
          cls: "ok",
          icon: "💓",
          label: "Heartbeat",
          value: nextLabel,
        });
      } else {
        pills.push({
          cls: "bad",
          icon: "💓",
          label: "Heartbeat",
          value: "Disabled",
        });
      }

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

    function renderJobsList(jobs) {
      if (!quickJobsList) return;
      const items = Array.isArray(jobs) ? jobs.slice() : [];
      const now = new Date();

      if (!items.length) {
        quickJobsList.innerHTML = '<div class="quick-jobs-empty">No jobs yet.</div>';
        if (quickJobsNext) quickJobsNext.textContent = "Next job in --";
        return;
      }

      const withNext = items
        .map((j) => ({
          ...j,
          _nextAt: nextRunAt(j.schedule, now),
        }))
        .sort((a, b) => {
          const ta = a._nextAt ? a._nextAt.getTime() : Number.POSITIVE_INFINITY;
          const tb = b._nextAt ? b._nextAt.getTime() : Number.POSITIVE_INFINITY;
          return ta - tb;
        });

      const nearest = withNext.find((j) => j._nextAt);
      if (quickJobsNext) {
        quickJobsNext.textContent = nearest && nearest._nextAt
          ? ("Next job in " + fmtDur(nearest._nextAt.getTime() - now.getTime()))
          : "Next job in --";
      }

      quickJobsList.innerHTML = withNext
        .map((j) => {
          const nextAt = j._nextAt;
          const cooldown = nextAt ? fmtDur(nextAt.getTime() - now.getTime()) : "n/a";
          const time = clockFromSchedule(j.schedule || "");
          const expanded = expandedJobName && expandedJobName === (j.name || "");
          const nextRunText = nextAt
            ? formatOffsetDate(nextAt, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
                hour12: use12Hour,
              })
            : "--";
          return (
          '<div class="quick-job-item">' +
            '<div class="quick-job-item-main">' +
              '<button class="quick-job-line" type="button" data-toggle-job="' + escAttr(j.name || "") + '">' +
                '<span class="quick-job-item-name">' + esc(j.name || "job") + "</span>" +
                '<span class="quick-job-item-time">' + esc(time || "--") + "</span>" +
                '<span class="quick-job-item-cooldown">' + esc(cooldown) + "</span>" +
              "</button>" +
              (expanded ? (
                '<div class="quick-job-item-details">' +
                  '<div>Schedule: ' + esc(j.schedule || "--") + "</div>" +
                  '<div>Next run: ' + esc(nextRunText) + "</div>" +
                  '<div>Prompt:</div>' +
                  '<pre class="quick-job-prompt-full">' + esc(String(j.prompt || "")) + "</pre>" +
                "</div>"
              ) : (
                ""
              )) +
            "</div>" +
            '<button class="quick-job-delete" type="button" data-delete-job="' + escAttr(j.name || "") + '">Delete</button>' +
          "</div>"
          );
        })
        .join("");
    }

    function rerenderJobsList() {
      renderJobsList(lastRenderedJobs);
    }

    function toggleJobDetails(name) {
      const jobName = String(name || "");
      expandedJobName = expandedJobName === jobName ? "" : jobName;
      rerenderJobsList();
    }

    async function refreshState() {
      try {
        const res = await fetch("/api/state");
        const state = await res.json();
        const pills = buildPills(state);
        dockEl.innerHTML = pills.map((p) =>
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
        lastRenderedJobs = Array.isArray(state.jobs) ? state.jobs : [];
        if (expandedJobName && !lastRenderedJobs.some((job) => String(job.name || "") === expandedJobName)) {
          expandedJobName = "";
        }
        renderJobsList(lastRenderedJobs);
        syncQuickViewForJobs(state.jobs);
        if (uptimeBubbleEl) {
          uptimeBubbleEl.innerHTML =
            '<div class="side-icon">⏱️</div>' +
            '<div class="side-value">' + esc(fmtDur(state.daemon?.uptimeMs ?? 0)) + "</div>" +
            '<div class="side-label">Uptime</div>';
        }
      } catch (err) {
        dockEl.innerHTML = '<div class="pill bad"><div class="pill-label"><span class="pill-icon">⚠️</span>Status</div><div class="pill-value">Offline</div></div>';
        if (jobsBubbleEl) {
          jobsBubbleEl.innerHTML = '<div class="side-icon">🗂️</div><div class="side-value">-</div><div class="side-label">Jobs</div>';
        }
        lastRenderedJobs = [];
        expandedJobName = "";
        renderJobsList([]);
        syncQuickViewForJobs([]);
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

    function syncQuickViewForJobs(jobs) {
      const count = Array.isArray(jobs) ? jobs.length : 0;
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
        rerenderJobsList();
        updateQuickJobUi();
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
        updateQuickJobUi();
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

    if (quickJobOffset && !quickJobOffset.value) {
      quickJobOffset.value = "10";
    }

    function normalizeOffsetMinutes(value) {
      const n = Number(String(value || "").trim());
      if (!Number.isFinite(n)) return null;
      const rounded = Math.round(n);
      if (rounded < 1 || rounded > 1440) return null;
      return rounded;
    }

    function computeTimeFromOffset(offsetMinutes) {
      const targetInstant = new Date(Date.now() + offsetMinutes * 60_000);
      const dt = toOffsetDate(targetInstant);
      const hour = dt.getUTCHours();
      const minute = dt.getUTCMinutes();
      const time = String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
      const dayLabel = isSameOffsetDay(targetInstant, new Date()) ? "Today" : "Tomorrow";
      const human = formatOffsetDate(targetInstant, {
        hour: "numeric",
        minute: "2-digit",
        hour12: use12Hour,
      });
      return { hour, minute, time, dayLabel, human };
    }

    function formatPreviewTime(hour, minute) {
      const shiftedNow = toOffsetDate(new Date());
      shiftedNow.setUTCHours(hour, minute, 0, 0);
      const instant = new Date(shiftedNow.getTime() - heartbeatTimezoneOffsetMinutes * 60_000);
      return formatOffsetDate(instant, {
        hour: "numeric",
        minute: "2-digit",
        hour12: use12Hour,
      });
    }

    function formatOffsetDuration(offsetMinutes) {
      const total = Math.max(0, Math.round(offsetMinutes));
      const hours = Math.floor(total / 60);
      const minutes = total % 60;
      if (hours <= 0) return minutes + "m";
      if (minutes === 0) return hours + "h";
      return hours + "h " + minutes + "m";
    }

    function updateQuickJobUi() {
      if (quickJobPrompt && quickJobCount) {
        const count = (quickJobPrompt.value || "").trim().length;
        quickJobCount.textContent = String(count) + " chars";
      }
      if (quickJobOffset && quickJobPreview) {
        const offset = normalizeOffsetMinutes(quickJobOffset.value || "");
        if (!offset) {
          quickJobPreview.textContent = "Use 1-1440 minutes";
          quickJobPreview.style.color = "#ffd39f";
          return;
        }
        const target = computeTimeFromOffset(offset);
        const human = formatPreviewTime(target.hour, target.minute) || target.time;
        quickJobPreview.textContent = "Runs in " + formatOffsetDuration(offset) + " (" + target.dayLabel + " " + human + ")";
        quickJobPreview.style.color = "#a8f1ca";
      }
    }

    if (quickJobOffset) quickJobOffset.addEventListener("input", updateQuickJobUi);
    if (quickJobPrompt) quickJobPrompt.addEventListener("input", updateQuickJobUi);

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const add = target.closest("[data-add-minutes]");
      if (!add || !(add instanceof HTMLElement)) return;
      if (!quickJobOffset) return;
      const delta = Number(add.getAttribute("data-add-minutes") || "");
      if (!Number.isFinite(delta)) return;
      const current = normalizeOffsetMinutes(quickJobOffset.value) || 10;
      const next = Math.min(1440, current + Math.round(delta));
      quickJobOffset.value = String(next);
      updateQuickJobUi();
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const row = target.closest("[data-toggle-job]");
      if (!row || !(row instanceof HTMLElement)) return;
      const name = row.getAttribute("data-toggle-job") || "";
      if (!name) return;
      toggleJobDetails(name);
    });

    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("[data-delete-job]");
      if (!button || !(button instanceof HTMLButtonElement)) return;
      const name = button.getAttribute("data-delete-job") || "";
      if (!name) return;
      button.disabled = true;
      if (quickJobsStatus) quickJobsStatus.textContent = "Deleting job...";
      try {
        const res = await fetch("/api/jobs/" + encodeURIComponent(name), { method: "DELETE" });
        const out = await res.json();
        if (!out.ok) throw new Error(out.error || "delete failed");
        if (quickJobsStatus) quickJobsStatus.textContent = "Deleted " + name;
        await refreshState();
      } catch (err) {
        if (quickJobsStatus) quickJobsStatus.textContent = "Failed: " + String(err instanceof Error ? err.message : err);
      } finally {
        button.disabled = false;
      }
    });

    if (quickOpenCreate) {
      quickOpenCreate.addEventListener("click", () => setQuickView("create", { scroll: true, user: true }));
    }

    if (quickBackJobs) {
      quickBackJobs.addEventListener("click", () => setQuickView("jobs", { scroll: true, user: true }));
    }

    if (quickJobForm && quickJobOffset && quickJobPrompt && quickJobSubmit && quickJobStatus) {
      quickJobForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const offset = normalizeOffsetMinutes(quickJobOffset.value || "");
        const prompt = (quickJobPrompt.value || "").trim();
        if (!offset || !prompt) {
          quickJobStatus.textContent = "Use 1-1440 minutes and add a prompt.";
          return;
        }
        const target = computeTimeFromOffset(offset);
        quickJobSubmit.disabled = true;
        quickJobStatus.textContent = "Saving job...";
        try {
          const res = await fetch("/api/jobs/quick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              time: target.time,
              prompt,
              recurring: quickJobRecurring ? quickJobRecurring.checked : true,
            }),
          });
          const out = await res.json();
          if (!out.ok) throw new Error(out.error || "failed");
          quickJobStatus.textContent = "Added to jobs list.";
          if (quickJobsStatus) quickJobsStatus.textContent = "Added " + out.name;
          quickJobPrompt.value = "";
          updateQuickJobUi();
          setQuickView("jobs", { scroll: true });
          await refreshState();
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
    startTypewriter();
    updateQuickJobUi();
    setQuickView(quickView);

    loadSettings();
    refreshState();
    setInterval(refreshState, 1000);

    // ── Chat ──
    const tabDashboardBtn = $("tab-dashboard");
    const tabChatBtn = $("tab-chat");
    const dashboardPanel = $("dashboard-panel");
    const chatPanel = $("chat-panel");
    const chatMessages = $("chat-messages");
    const chatForm = $("chat-form");
    const chatInput = $("chat-input");
    const chatSend = $("chat-send");

    var CHAT_ID_KEY = "claudeclaw.chat.id";
    let chatHistory = [];
    let chatSessionId = localStorage.getItem(CHAT_ID_KEY) || generateChatId();
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

    // Kelly's preferred order + role labels for the chat agent picker
    // (2026-05-20). Agents not in this list still render — after the
    // canonical six, alphabetised, without a role label.
    var CHAT_AGENT_ORDER = ["alice", "sam", "mark", "ray", "bob", "cliff"];
    var CHAT_AGENT_ROLES = {
      alice: "Assistant",
      sam: "Strategy",
      mark: "Marketing",
      ray: "Research",
      bob: "the Builder",
      cliff: "Code Review"
    };
    function orderedChatAgents() {
      var byName = {};
      for (var i = 0; i < agentsCache.length; i++) {
        if (agentsCache[i] && agentsCache[i].name) byName[agentsCache[i].name] = agentsCache[i];
      }
      var out = [];
      for (var j = 0; j < CHAT_AGENT_ORDER.length; j++) {
        var nm = CHAT_AGENT_ORDER[j];
        if (byName[nm]) {
          out.push(byName[nm]);
          delete byName[nm];
        }
      }
      // Append any remaining agents (e.g. adam, vesper) at the end,
      // alphabetised, so they're discoverable but don't crowd the
      // canonical six.
      var rest = Object.keys(byName).sort().map(function (k) { return byName[k]; });
      return out.concat(rest);
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

    async function loadAgents() {
      try {
        var res = await fetch("/api/agents");
        var data = await res.json();
        if (data && data.ok && Array.isArray(data.agents)) {
          agentsCache = data.agents;
        }
      } catch (_) {}
      agentsFetched = true;
      // Default pendingAgentId to vesper when nothing's picked yet and the
      // chat hasn't locked one in — matches "Vesper by default" behaviour.
      if (!pendingAgentId && !chatAgentLocked) {
        var vesper = agentsCache.find(function(a) { return a.name === "vesper"; });
        if (vesper) pendingAgentId = vesper.name;
        else if (agentsCache.length > 0) pendingAgentId = agentsCache[0].name;
      }
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
      // Freshly-opened chat with no lock-in: default the picker to Vesper.
      if (!chatAgentLocked && !pendingAgentId && agentsCache.length > 0) {
        var v = agentsCache.find(function(a) { return a.name === "vesper"; });
        pendingAgentId = (v ? v.name : agentsCache[0].name);
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
        var v = agentsCache.find(function(a) { return a.name === "vesper"; });
        pendingAgentId = (v ? v.name : agentsCache[0].name);
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
          var role = CHAT_AGENT_ROLES[agent.name] || "";
          title.textContent =
            (agent.emoji ? agent.emoji + " " : "") +
            nameLabel +
            (role ? " — " + role : "");
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

    function isMobileFiles() {
      return typeof window.matchMedia === "function"
        && window.matchMedia("(max-width: 640px)").matches;
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
            fmHtml = '<pre class="files-md-frontmatter">' + escapeHtml(fmMatch[1]) + '</pre>';
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
      // Per-project collapse state for the Current view. Default open; click
      // the group head to fold a project section away.
      var currentCollapsed = {};
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

        // Meta line: from → to · kind · priority · time-ago
        var metaParts = [];
        metaParts.push(escapeHtml(card.from || "?") + " <span class=\"task-panel-meta-arrow\">→</span> " + escapeHtml(card.to || "?"));
        if (card.kind) metaParts.push(escapeHtml(card.kind));
        if (card.priority) metaParts.push(escapeHtml(card.priority));
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

        // 4. Action buttons row — Next, Close, Reopen, Chat, Open. Next spawns
        //    a child task with parent pointer; original stays put. For
        //    waiting:on:user the inline "⏳ Continue" form at the top of the
        //    card is the equivalent affordance, so the Next button only
        //    renders for terminal (done/failed) tasks. Close and Reopen
        //    manage the user-attention `closed` overlay (WAL-63 Phase 1).
        var actions = [];
        if (isCurrent && isTerminal && !isClosed) {
          actions.push('<button class="task-panel-action is-primary" data-toggle-next="' + escapeHtml(card.id) + '" type="button">↳ Next</button>');
        }
        if (isCurrent && !isClaimed && !isClosed) {
          // "Close" reads clean on done tasks; non-done closures are really
          // cancellations — surface that in the label so Kelly doesn't think
          // she's marking a stuck task as resolved.
          var closeLabel = (statusLower === "done") ? "✓ Close" : "✕ Close";
          actions.push('<button class="task-panel-action" data-toggle-close="' + escapeHtml(card.id) + '" type="button">' + closeLabel + '</button>');
        }
        if (isCurrent && isClosed) {
          actions.push('<button class="task-panel-action is-primary" data-reopen-agent="' + escapeHtml(card.agent || "") + '" data-reopen-task="' + escapeHtml(card.id) + '" type="button">↻ Reopen</button>');
        }
        actions.push('<button class="task-panel-action" data-toggle-chat="' + escapeHtml(card.id) + '" type="button">💬 Chat</button>');
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
            '<div class="task-panel-rework-warn">Chat opens on the same thread as the task worker, so the agent\'s prior context is in cache. Pick a different agent below to start a fresh thread for that role.</div>' +
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
            '<div class="task-panel-rework-warn">Close marks this task <strong>' + defaultCloseStatus + '</strong> from your perspective. The runner state (' + escapeHtml(card.status || "?") + ') is preserved. You can <strong>↻ Reopen</strong> later — closure is reversible.</div>' +
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

        // 4b. Next form — hidden until the Next button toggles it. Spawns
        //     a child task with parent pointer; the original done/failed
        //     envelope is unchanged. The new child reuses the same session
        //     thread so the agent already has the prior context cached.
        if (isCurrent && isTerminal) {
          var revisitTargetPicker = renderNextTargetPicker(card.agent || "");
          var revisitHeadlineSuggest = suggestChildHeadline(card.headline || card.id, "revisit");
          sections +=
            '<div class="task-panel-rework task-panel-next" data-next-agent="' + escapeHtml(card.agent || "") + '" data-next-id="' + escapeHtml(card.id) + '" data-next-source="revisit" hidden>' +
            '<div class="task-panel-rework-warn">A fresh child task is spawned with a pointer back to this one. Pick a different agent below to hand the next step off — by default the same agent picks up the same session, so prior context stays in cache.</div>' +
            '<input type="text" class="task-panel-next-headline-input" placeholder="Child task title" value="' + escapeHtml(revisitHeadlineSuggest) + '" />' +
            '<textarea class="task-panel-unblock-input task-panel-next-input" rows="3" placeholder="What\'s next? Refine, extend, or change direction…"></textarea>' +
            '<div class="task-panel-unblock-actions">' +
            revisitTargetPicker +
            '<button type="button" class="is-primary task-panel-next-submit">↳ Spawn child task</button>' +
            '<span class="task-panel-unblock-status task-panel-next-status"></span>' +
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
        if (tasksEmpty) tasksEmpty.hidden = mode !== "empty";
        if (tasksViewer) tasksViewer.hidden = mode !== "view";
        var projectPane = document.getElementById("tasks-project-pane");
        if (projectPane) projectPane.hidden = mode !== "project";
        if (newForm) {
          if (mode === "new") newForm.removeAttribute("hidden");
          else newForm.setAttribute("hidden", "");
        }
        // On mobile, switching the right pane to view/new/project means the
        // user wants to see the right pane — collapse the picker so it's
        // actually visible. "empty" goes back to the list (sidebar expanded).
        if (window.matchMedia && window.matchMedia("(max-width: 640px)").matches) {
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

        // Group by project.
        var groups = {};
        var order = [];
        var UNASSIGNED = "__unassigned__";
        for (var l = 0; l < leaves.length; l++) {
          var leaf = leaves[l];
          var key = leaf.project || UNASSIGNED;
          if (!groups[key]) { groups[key] = []; order.push(key); }
          groups[key].push(leaf);
        }
        // Within group: sort by updated desc.
        Object.keys(groups).forEach(function (g) {
          groups[g].sort(function (a, b) {
            return (Date.parse(b.updated || 0) || 0) - (Date.parse(a.updated || 0) || 0);
          });
        });
        // Order groups: most-recently-touched group first; unassigned last.
        order.sort(function (a, b) {
          if (a === UNASSIGNED && b !== UNASSIGNED) return 1;
          if (b === UNASSIGNED && a !== UNASSIGNED) return -1;
          var ta = groups[a][0] ? Date.parse(groups[a][0].updated || 0) || 0 : 0;
          var tb = groups[b][0] ? Date.parse(groups[b][0].updated || 0) || 0 : 0;
          return tb - ta;
        });

        var html = '<div class="tasks-current">';
        for (var o = 0; o < order.length; o++) {
          var groupKey = order[o];
          var rows = groups[groupKey];
          var displayName = groupKey === UNASSIGNED ? "Unassigned" : groupKey;
          var collapsed = !!currentCollapsed[groupKey];
          html += '<div class="tasks-current-group' + (collapsed ? ' is-collapsed' : '') + '" data-project-key="' + escapeHtml(groupKey) + '">';
          html += '<div class="tasks-current-group-head" data-toggle-group="' + escapeHtml(groupKey) + '">';
          html += '<span class="tasks-current-group-chevron"></span>';
          html += '<span class="tasks-current-group-name">' + escapeHtml(displayName) + '</span>';
          html += '<span class="tasks-current-group-count">' + rows.length + '</span>';
          html += '</div>';
          html += '<div class="tasks-current-group-body">';
          for (var r = 0; r < rows.length; r++) {
            html += renderCurrentRow(rows[r]);
          }
          html += '</div></div>';
        }
        html += '</div>';
        tasksTree.innerHTML = html;
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
        var headline = task.headline || (task.summary && task.summary.brief) || task.brief || "(no headline)";
        var meta = [];
        meta.push(escapeHtml(task.agent || task.to || "?"));
        meta.push(escapeHtml(shortenStatusLabel(task.status || "?")));
        if (task.updated) meta.push(escapeHtml(timeAgo(task.updated)));
        var rowClass = "tasks-current-row " + statusClass;
        if (task.id === currentTaskId) rowClass += " is-active";
        // Two-line shape (Kelly 2026-05-20):
        //   row 1: status dot + headline
        //   row 2: task id (left) · agent | status | when (right)
        // The dot stays in the gutter so colour-coding tracks at a glance.
        return (
          '<div class="' + rowClass + '" data-task-id="' + escapeHtml(task.id) + '" role="button" tabindex="0">' +
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

      function projectHideClosedKey(slug) { return "claudeclaw.project.hideClosed." + (slug || "__unassigned__"); }
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
        tasksTree.addEventListener("click", function (ev) {
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
          var row = ev.target.closest(".tasks-tree-row, .tasks-current-row");
          if (!row) return;
          ev.preventDefault();
          var taskId = row.getAttribute("data-task-id");
          if (taskId) openTaskPanel(taskId);
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
          var toggleNextBtn = ev.target.closest("[data-toggle-next]");
          if (toggleNextBtn) {
            ev.preventDefault();
            var card = toggleNextBtn.closest(".task-panel-card");
            if (card) {
              var nextForm = card.querySelector(".task-panel-next");
              if (nextForm) {
                nextForm.hidden = false;
                var ta = nextForm.querySelector(".task-panel-next-input");
                if (ta) ta.focus();
                nextForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            }
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
          var reopenBtn = ev.target.closest("[data-reopen-task]");
          if (reopenBtn) {
            ev.preventDefault();
            submitReopen(reopenBtn);
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