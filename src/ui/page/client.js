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
      if (!el) return;
      var id = effectiveAgentId();
      var agent = findAgent(id);
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
      try {
        var res = await fetch("/api/chats/" + encodeURIComponent(id));
        var data = await res.json();
        if (data.ok && data.chat) {
          chatHistory = cleanHistory(data.chat.messages);
          chatServerUpdatedAt = data.chat.updatedAt || null;
          chatAgentLocked = data.chat.agentId || null;
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
      updateSendDisabled();
      renderChatHistory();
      schedulePoll();
      var dropdown = $("chat-history-dropdown");
      if (dropdown) dropdown.hidden = true;
      loadChatList();
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
      if (filesBtn) allBtns.push(filesBtn);
      if (filesPnl) allPanels.push(filesPnl);
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
      }
    }

    if (tabDashboardBtn) tabDashboardBtn.addEventListener("click", () => setActiveTab("dashboard"));
    if (tabChatBtn) tabChatBtn.addEventListener("click", () => setActiveTab("chat"));

    renderChatHistory();

    function renderMarkdown(text) {
      if (!text) return "";
      var esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      esc = esc.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
        return '<pre><code>' + code.replace(/\n$/, '') + '</code></pre>';
      });
      esc = esc.replace(/`([^`]+)`/g, '<code>$1</code>');
      esc = esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      esc = esc.replace(/(?:^|\n)(#{1,3}) (.+)/g, function(_, hashes, content) {
        var level = Math.min(hashes.length + 2, 6);
        return '<h' + level + '>' + content + '</h' + level + '>';
      });
      var lines = esc.split("\n");
      var out = [];
      var inList = false;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var listMatch = line.match(/^(\s*)[\-\*] (.+)/);
        if (listMatch) {
          if (!inList) { out.push("<ul>"); inList = true; }
          out.push("<li>" + listMatch[2] + "</li>");
        } else {
          if (inList) { out.push("</ul>"); inList = false; }
          out.push(line);
        }
      }
      if (inList) out.push("</ul>");
      return out.join("\n").replace(/(?<!\/pre>)\n(?!<)/g, "<br>");
    }

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
      for (var i = 0; i < agentsCache.length; i++) {
        (function(agent) {
          var item = document.createElement("button");
          item.type = "button";
          item.className = "chat-picker-item";
          if (pendingAgentId === agent.name) item.classList.add("chat-picker-item-active");

          var title = document.createElement("div");
          title.className = "chat-picker-item-title";
          title.textContent = (agent.emoji ? agent.emoji + " " : "") + agent.displayName;
          item.appendChild(title);

          var desc = document.createElement("div");
          desc.className = "chat-picker-item-desc";
          desc.textContent = agent.description;
          item.appendChild(desc);

          item.addEventListener("click", function() {
            pendingAgentId = agent.name;
            updateAgentBadge();
            updateSendDisabled();
            // Re-render so only the picked item shows -active styling.
            renderChatHistory();
          });

          list.appendChild(item);
        })(agentsCache[i]);
      }
      empty.appendChild(list);

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
          var stopBtn = document.createElement("button");
          stopBtn.type = "button";
          stopBtn.className = "chat-msg-stop-inline";
          stopBtn.title = "Stop this response";
          stopBtn.setAttribute("aria-label", "Stop this response");
          stopBtn.textContent = "\u270b";
          stopBtn.addEventListener("click", function() {
            stopBtn.disabled = true;
            interruptCurrent({ sendAfter: true });
          });
          meta.appendChild(stopBtn);
          var labelSpan = document.createElement("span");
          labelSpan.className = "chat-msg-meta-label";
          labelSpan.textContent = metaLabel;
          meta.appendChild(labelSpan);
          msgEl.appendChild(meta);
        }

        var isActive =
          state === "thinking" || state === "streaming" || state === "background";
        msgEl.dataset.active = isActive ? "1" : "0";
      }
    }

    function renderChatHistory() {
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
          var div = document.createElement("div");
          div.className = "files-md";
          div.innerHTML = renderFullMarkdown(data.content);
          filesContent.appendChild(div);
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
      return "";
    }

    function escHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function highlightCode(src, lang) {
      if (lang === "json") return highlightJson(src);
      if (lang === "js") return highlightJs(src);
      if (lang === "py") return highlightPy(src);
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

    function renderFullMarkdown(src) {
      if (!src) return "";

      // Escape HTML
      var text = src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      // Fenced code blocks
      text = text.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
        return '<pre><code>' + code.replace(/\n$/, '') + '</code></pre>';
      });

      // Horizontal rules (before heading processing)
      text = text.replace(/^---+$/gm, '<hr>');

      // Headings
      text = text.replace(/^(#{1,6}) (.+)$/gm, function(_, hashes, content) {
        var level = hashes.length;
        return '<h' + level + '>' + content + '</h' + level + '>';
      });

      // Bold + italic
      text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

      // Inline code (after code blocks)
      text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

      // Links
      text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

      // Images
      text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

      // Blockquotes
      text = text.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
      // Merge adjacent blockquotes
      text = text.replace(/<\/blockquote>\n<blockquote>/g, '\n');

      // Task lists
      text = text.replace(/^(\s*)[-*] \[x\] (.+)$/gm, '$1<li><input type="checkbox" checked disabled> $2</li>');
      text = text.replace(/^(\s*)[-*] \[ \] (.+)$/gm, '$1<li><input type="checkbox" disabled> $2</li>');

      // Tables
      text = text.replace(/((?:^\|.+\|$\n?)+)/gm, function(tableBlock) {
        var rows = tableBlock.trim().split('\n');
        if (rows.length < 2) return tableBlock;

        var html = '<table>';
        // Header
        var headerCells = rows[0].split('|').filter(function(c) { return c.trim() !== ''; });
        html += '<tr>';
        for (var h = 0; h < headerCells.length; h++) {
          html += '<th>' + headerCells[h].trim() + '</th>';
        }
        html += '</tr>';

        // Skip separator row (row[1])
        for (var r = 2; r < rows.length; r++) {
          var cells = rows[r].split('|').filter(function(c) { return c.trim() !== ''; });
          if (!cells.length) continue;
          html += '<tr>';
          for (var c = 0; c < cells.length; c++) {
            html += '<td>' + cells[c].trim() + '</td>';
          }
          html += '</tr>';
        }
        html += '</table>';
        return html;
      });

      // Process lines for lists and paragraphs
      var lines = text.split('\n');
      var out = [];
      var inList = false;
      var listType = '';

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        // Skip if it's an HTML block element
        if (line.match(/^<(h[1-6]|pre|blockquote|table|hr|\/)/)) {
          if (inList) { out.push('</' + listType + '>'); inList = false; }
          out.push(line);
          continue;
        }

        // Unordered list
        var ulMatch = line.match(/^(\s*)[-*] (.+)/);
        if (ulMatch && !line.match(/^<li>/)) {
          if (!inList || listType !== 'ul') {
            if (inList) out.push('</' + listType + '>');
            out.push('<ul>');
            inList = true;
            listType = 'ul';
          }
          out.push('<li>' + ulMatch[2] + '</li>');
          continue;
        }

        // Ordered list
        var olMatch = line.match(/^(\s*)\d+\. (.+)/);
        if (olMatch) {
          if (!inList || listType !== 'ol') {
            if (inList) out.push('</' + listType + '>');
            out.push('<ol>');
            inList = true;
            listType = 'ol';
          }
          out.push('<li>' + olMatch[2] + '</li>');
          continue;
        }

        // Already a list item (from task list processing)
        if (line.match(/^<li>/)) {
          if (!inList) {
            out.push('<ul>');
            inList = true;
            listType = 'ul';
          }
          out.push(line);
          continue;
        }

        if (inList) { out.push('</' + listType + '>'); inList = false; }
        out.push(line);
      }
      if (inList) out.push('</' + listType + '>');

      // Join and convert remaining newlines to <br> (but not after block elements)
      var result = out.join('\n');
      result = result.replace(/(?<!\/(pre|blockquote|table|ul|ol|li|h[1-6]|hr)>)\n(?!<)/g, '<br>');

      // Clean up double <br>
      result = result.replace(/(<br>){3,}/g, '<br><br>');

      return result;
    }

    if (filesPickerToggle) {
      filesPickerToggle.addEventListener("click", function() {
        if (!filesSidebar) return;
        var collapsed = filesSidebar.classList.contains("files-sidebar-collapsed");
        setPickerCollapsed(!collapsed);
      });
    }