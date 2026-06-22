export const pageStyles = String.raw`    :root {
      --bg-top: #2a4262;
      --bg-bottom: #0d1828;
      --bg-spot-a: #7fb8ff3d;
      --bg-spot-b: #95d1ff38;
      --text: #f0f4fb;
      --muted: #a8b4c5;
      --panel: #0b1220aa;
      --border: #d8e4ff1f;
      --accent: #9be7ff;
      --good: #67f0b5;
      --bad: #ff7f7f;
      --warn: #ffc276;
    }

    * { box-sizing: border-box; }
    [hidden] { display: none !important; }

    html, body {
      width: 100%;
      min-height: 100%;
      margin: 0;
      padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    }

    body {
      font-family: "Space Grotesk", system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(1400px 700px at 15% -10%, var(--bg-spot-a), transparent 60%),
        radial-gradient(900px 500px at 85% 10%, var(--bg-spot-b), transparent 65%),
        linear-gradient(180deg, var(--bg-top) 0%, var(--bg-bottom) 100%);
      overflow-x: hidden;
      overflow-y: auto;
      position: relative;
      transition: background 320ms ease;
    }

    body.day-mode {
      --bg-top: #2a4262;
      --bg-bottom: #0d1828;
      --bg-spot-a: #7fb8ff3d;
      --bg-spot-b: #95d1ff38;
    }

    body.night-mode {
      --bg-top: #101b2a;
      --bg-bottom: #02040a;
      --bg-spot-a: #3557822b;
      --bg-spot-b: #4a7ab42a;
    }

    body.night-mode .message {
      color: #d2ddef;
      font-family: "JetBrains Mono", monospace;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .grain {
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.08;
      background-image: radial-gradient(#fff 0.5px, transparent 0.5px);
      background-size: 3px 3px;
      animation: drift 16s linear infinite;
    }

    @keyframes drift {
      from { transform: translateY(0); }
      to { transform: translateY(-12px); }
    }

    .stage {
      height: 100vh;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 42px 16px 90px;
      position: relative;
      z-index: 1;
      overflow: hidden;
      transition: width 180ms ease;
    }
    body.hide-header .repo-cta { display: none; }
    body.hide-header .stage { padding-top: 12px; }

    .split-pane {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 50vw;
      background: #0d1117;
      border-left: 1px solid #1f2630;
      box-shadow: -8px 0 24px #00000040;
      z-index: 5;
      display: none;
    }
    .split-iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: #0d1117;
      display: block;
    }
    .split-pane-close {
      position: absolute;
      top: 6px;
      right: 8px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 1px solid #2a3442;
      background: #11161e;
      color: #d7e3f5;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      z-index: 6;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .split-pane-close:hover { background: #1a232f; border-color: #3a4756; }
    body.split-mode .stage { width: 50vw; align-self: flex-start; }
    body.split-mode .split-pane { display: block; }
    /* In split mode the parent dock represents the whole app — anchor it
       over the left pane (where the parent stage lives) and hide the
       iframe's duplicate dock via body.embed. */
    body.split-mode .dock-shell {
      left: 25vw;
      width: min(calc(50vw - 24px), 1140px);
    }

    /* Embed mode = page rendered inside the split-pane iframe. Hide all
       global chrome so only the stage shows; the parent owns the dock,
       repo banner, settings, and split toggle. */
    body.embed .repo-cta,
    body.embed .dock-shell,
    body.embed #split-nav-toggle,
    body.embed #settings-btn { display: none !important; }
    body.embed .stage { padding-bottom: 16px; }

    @media (max-width: 1199px) {
      body.split-mode .stage { width: 100%; align-self: stretch; }
      body.split-mode .split-pane { display: none; }
      body.split-mode .dock-shell {
        left: 50%;
        width: min(calc(100% - 24px), 1140px);
      }
      #split-toggle-row,
      #split-nav-toggle { display: none; }
    }

    .hero {
      text-align: center;
      width: min(820px, 100%);
      animation: rise 700ms ease-out both;
    }

    .logo-art {
      width: 12ch;
      margin: 0 auto 18px;
      transform: translateX(-0.75ch);
      color: #dbe7ff;
      filter: drop-shadow(0 8px 20px #00000040);
    }
    .logo-top {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8ch;
      font-size: 18px;
      line-height: 1.1;
      margin-bottom: 2px;
      transform: translateX(1.35ch);
    }
    .logo-body {
      margin: 0;
      white-space: pre;
      font-family: "JetBrains Mono", monospace;
      font-size: 20px;
      letter-spacing: 0;
      line-height: 1.08;
      text-align: left;
    }
    .typewriter {
      margin: 6px 0 14px;
      min-height: 1.4em;
      font-family: "JetBrains Mono", monospace;
      font-size: clamp(0.9rem, 1.8vw, 1.05rem);
      color: #c8d6ec;
      letter-spacing: 0.02em;
    }
    .typewriter::after {
      content: "";
      display: inline-block;
      width: 0.62ch;
      height: 1.05em;
      margin-left: 0.18ch;
      vertical-align: -0.12em;
      background: #c8d6ec;
      animation: caret 1s step-end infinite;
    }

    @keyframes caret {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(18px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .time {
      display: block;
      width: 100%;
      font-family: serif;
      font-size: clamp(3rem, 10vw, 6rem);
      line-height: 0.95;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum";
      text-align: center;
      text-shadow: 0 10px 35px #00000055;
      transition: text-shadow 280ms ease;
    }

    .time.ms-pulse {
      text-shadow: 0 10px 40px #7dc5ff4d;
    }

    .date {
      margin-top: 14px;
      font-size: clamp(1rem, 2.4vw, 1.3rem);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 500;
    }

    .message {
      margin-top: 28px;
      font-size: clamp(1rem, 2.1vw, 1.35rem);
      color: #e4ecf8;
      font-weight: 500;
    }
    .quick-job {
      margin: 20px auto 0;
      width: min(720px, 100%);
      max-width: 100%;
      padding: 14px;
      border: 1px solid #ffffff22;
      border-radius: 16px;
      background:
        radial-gradient(120% 100% at 100% 0%, #7dc5ff1a, transparent 55%),
        linear-gradient(180deg, #0e1a2a88 0%, #0a1220a8 100%);
      backdrop-filter: blur(6px);
      box-shadow: 0 14px 34px #00000045;
      display: grid;
      gap: 12px;
      text-align: left;
    }
    .quick-job-head {
      display: grid;
      gap: 3px;
    }
    .quick-job-head-row {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 10px;
    }
    .quick-job-title {
      font-family: "Fraunces", serif;
      font-size: clamp(1.1rem, 2.2vw, 1.4rem);
      letter-spacing: 0.01em;
      color: #f4f8ff;
      line-height: 1.1;
    }
    .quick-job-sub {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #c9daef;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .quick-jobs-next {
      margin-top: 6px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #9fd6ff;
      letter-spacing: 0.03em;
    }
    .quick-job-grid {
      display: grid;
      grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
      gap: 10px;
      align-items: stretch;
    }
    .quick-field {
      border: 1px solid #ffffff1c;
      border-radius: 12px;
      background: #0c1624a6;
      padding: 10px;
      display: grid;
      gap: 8px;
    }
    .quick-label {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #bfd4ef;
    }
    .quick-input,
    .quick-prompt,
    .quick-submit {
      border: 0;
      font-family: "JetBrains Mono", monospace;
      font-size: 13px;
      color: #eef4ff;
      background: transparent;
    }
    .quick-input {
      height: 42px;
      width: 100%;
      padding: 0 11px;
      border-radius: 10px;
      border: 1px solid #ffffff2e;
      background: #ffffff09;
      appearance: textfield;
      -moz-appearance: textfield;
    }
    .quick-input::-webkit-outer-spin-button,
    .quick-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .quick-input-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 42px;
      padding: 0 6px 0 11px;
      border-radius: 10px;
      border: 1px solid #ffffff2e;
      background: #ffffff09;
    }
    .quick-input-wrap .quick-input {
      height: 100%;
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      padding: 0;
    }
    .quick-input:focus-visible,
    .quick-prompt:focus-visible {
      outline: 1px solid #7dc5ff88;
      outline-offset: 1px;
    }
    .quick-input-wrap:focus-within {
      outline: 1px solid #7dc5ff88;
      outline-offset: 1px;
    }
    .quick-input-wrap .quick-input:focus-visible {
      outline: none;
    }
    .quick-time-buttons {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .quick-add {
      height: 27px;
      padding: 0 10px;
      border: 1px solid #ffffff2c;
      border-radius: 999px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.03em;
      color: #daebff;
      background: #ffffff12;
      cursor: pointer;
      transition: background 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
    }
    .quick-add:hover {
      background: #ffffff22;
      border-color: #ffffff44;
      transform: translateY(-1px);
    }
    .quick-preview {
      min-height: 1.2em;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #a8f1ca;
    }
    .quick-check {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: fit-content;
      min-height: 29px;
      padding: 0 12px;
      border: 1px solid #ff7f7f55;
      border-radius: 999px;
      background: #34181855;
      color: #ff9b9b;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
      user-select: none;
    }
    .quick-check-inline {
      position: static;
      min-height: 28px;
      padding: 0 10px;
      flex: 0 0 auto;
    }
    .quick-check:hover {
      transform: translateY(-1px);
    }
    .quick-check-inline:hover {
      transform: none;
    }
    .quick-check:has(input:checked) {
      background: #11342455;
      border-color: #67f0b560;
      color: #67f0b5;
    }
    .quick-check input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .quick-check:focus-within {
      outline: 1px solid #7dc5ff88;
      outline-offset: 2px;
    }
    .quick-prompt {
      width: 100%;
      min-height: 106px;
      padding: 10px 11px;
      resize: vertical;
      border: 1px solid #ffffff2e;
      border-radius: 10px;
      background: #ffffff09;
      line-height: 1.4;
    }
    .quick-prompt-meta {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #c3d6ef;
    }
    .quick-job-actions {
      display: grid;
      grid-template-columns: 170px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
    }
    .quick-submit {
      height: 42px;
      width: 100%;
      cursor: pointer;
      border-radius: 999px;
      border: 1px solid #3cb87980;
      background: linear-gradient(180deg, #1f6f47d4 0%, #18563ace 100%);
      color: #c8f8de;
      font-weight: 600;
      transition: transform 0.16s ease, filter 0.16s ease, opacity 0.16s ease;
    }
    .quick-submit:hover {
      transform: translateY(-1px);
      filter: brightness(1.06);
    }
    .quick-submit:disabled {
      opacity: 0.72;
      cursor: wait;
      transform: none;
      filter: none;
    }
    .quick-status {
      min-height: 1.2em;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #cde0f7;
      opacity: 0.95;
    }
    .quick-open-create,
    .quick-back-jobs {
      height: 33px;
      padding: 0 12px;
      border: 1px solid #ffffff2c;
      border-radius: 999px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.03em;
      color: #daebff;
      background: #ffffff12;
      cursor: pointer;
      transition: background 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
    }
    .quick-open-create:hover,
    .quick-back-jobs:hover {
      background: #ffffff22;
      border-color: #ffffff44;
      transform: translateY(-1px);
    }
    .quick-form-foot {
      border-top: 1px solid #ffffff1a;
      padding-top: 10px;
      display: flex;
      justify-content: flex-end;
    }
    .quick-jobs-list {
      display: grid;
      gap: 6px;
      max-height: 170px;
      overflow: auto;
      padding-right: 4px;
    }
    .quick-jobs-list-main {
      max-height: 280px;
    }
    .quick-job-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      padding: 8px 10px;
      border: 1px solid #ffffff1d;
      border-radius: 10px;
      background: #0b1422a8;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
    }
    .quick-job-item-main {
      min-width: 0;
      display: grid;
      gap: 4px;
    }
    .quick-job-line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      border: 0;
      padding: 0;
      margin: 0;
      background: transparent;
      width: 100%;
      text-align: left;
      color: inherit;
      cursor: pointer;
    }
    .quick-job-item-time {
      color: #bde8ff;
      white-space: nowrap;
    }
    .quick-job-item-name {
      color: #d8e4f7;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }
    .quick-job-item-cooldown {
      color: #a8f1ca;
      white-space: nowrap;
    }
    .quick-job-item-details {
      border-top: 1px solid #ffffff17;
      margin-top: 2px;
      padding-top: 8px;
      display: grid;
      gap: 6px;
      color: #c7d8ee;
    }
    .quick-job-prompt-full {
      margin: 0;
      padding: 8px;
      border-radius: 8px;
      background: #070f1a;
      border: 1px solid #ffffff14;
      color: #e4eefb;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 180px;
      overflow: auto;
    }
    .quick-job-delete {
      align-self: center;
      height: 28px;
      padding: 0 10px;
      border: 1px solid #ff7f7f40;
      border-radius: 999px;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #ffadad;
      background: #3a141455;
      cursor: pointer;
      transition: background 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
    }
    .quick-job-delete:hover {
      background: #4d191970;
      border-color: #ff8f8f6b;
      transform: translateY(-1px);
    }
    .quick-job-delete:disabled {
      opacity: 0.65;
      cursor: wait;
      transform: none;
    }
    .quick-jobs-empty {
      padding: 8px 10px;
      border: 1px dashed #ffffff22;
      border-radius: 10px;
      color: #b8cae3;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
    }
    .quick-view-hidden {
      display: none;
    }
    .multi-agent-panel {
      margin: 16px auto 0;
      width: min(720px, 100%);
      padding: 14px;
      border: 1px solid #ffffff22;
      border-radius: 16px;
      background:
        radial-gradient(120% 100% at 0% 0%, #ffd07a18, transparent 55%),
        linear-gradient(180deg, #0e1a2a88 0%, #0a1220a8 100%);
      backdrop-filter: blur(6px);
      box-shadow: 0 14px 34px #00000045;
      display: grid;
      gap: 12px;
      text-align: left;
    }
    .multi-agent-head {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 10px;
    }
    .multi-agent-title {
      font-family: "Fraunces", serif;
      font-size: clamp(1.05rem, 2vw, 1.25rem);
      color: #f4f8ff;
      letter-spacing: 0.01em;
    }
    .multi-agent-sub {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #c9daef;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      margin-top: 3px;
    }
    .multi-agent-refresh {
      border: 1px solid #ffffff2a;
      background: #0c1624a6;
      color: #cfe3ff;
      border-radius: 10px;
      width: 30px;
      height: 30px;
      cursor: pointer;
      font-size: 14px;
      transition: background 120ms;
    }
    .multi-agent-refresh:hover {
      background: #14223680;
    }
    .multi-agent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }
    .multi-agent-cell {
      border: 1px solid #ffffff1c;
      border-radius: 10px;
      background: #0c1624a6;
      padding: 8px 10px;
      display: grid;
      gap: 4px;
    }
    .multi-agent-cell-name {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #d6e6ff;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .multi-agent-cell-counts {
      display: flex;
      gap: 8px;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
    }
    .multi-agent-count-open { color: #9be7ff; }
    .multi-agent-count-waiting { color: #ffd58a; }
    .multi-agent-count-done { color: #93e0a8; }
    .multi-agent-count-failed { color: #ff9a9a; }
    .multi-agent-count-archived { color: #b8a8d8; }
    .multi-agent-count-zero { color: #5a6b85; }
    .multi-agent-count-link {
      cursor: pointer;
      padding: 1px 4px;
      margin: -1px -4px;
      border-radius: 4px;
      transition: background 100ms ease, filter 100ms ease;
    }
    .multi-agent-count-link:hover,
    .multi-agent-count-link:focus-visible {
      background: #ffffff10;
      filter: brightness(1.15);
      outline: none;
    }
    .multi-agent-extras {
      display: grid;
      gap: 6px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #b8cae3;
    }
    .multi-agent-extras-line {
      padding: 4px 8px;
      border-left: 2px solid #ffd07a99;
      background: #0c162466;
      border-radius: 4px;
    }
    .multi-agent-extras-line.escalated {
      border-left-color: #ff9a9a;
    }
    .multi-agent-head-actions {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .multi-agent-action {
      border: 1px solid #ffffff2a;
      background: #0c1624a6;
      color: #cfe3ff;
      border-radius: 10px;
      padding: 4px 10px;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      transition: background 120ms;
    }
    .multi-agent-action:hover {
      background: #14223680;
    }
    .multi-agent-action.is-active {
      background: #2a4972;
      border-color: #ffd07a99;
      color: #ffe7b8;
    }
    .multi-agent-tasks {
      display: grid;
      gap: 6px;
    }
    .multi-agent-tasks-head {
      display: flex;
      justify-content: space-between;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #c9daef;
      padding: 0 4px;
    }
    .multi-agent-tasks-list {
      display: grid;
      gap: 4px;
      max-height: 360px;
      overflow-y: auto;
    }
    .multi-agent-task-row {
      border: 1px solid #ffffff1c;
      border-radius: 8px;
      background: #0c1624a6;
      padding: 6px 10px;
      cursor: pointer;
      display: grid;
      gap: 2px;
      transition: background 120ms;
    }
    .multi-agent-task-row:hover {
      background: #14223680;
    }
    .multi-agent-task-row-head {
      display: flex;
      gap: 8px;
      align-items: baseline;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
    }
    .multi-agent-task-id { color: #d6e6ff; }
    .multi-agent-task-agent { color: #ffd07a; }
    .multi-agent-task-status {
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .multi-agent-task-status.is-open { color: #9be7ff; }
    .multi-agent-task-status.is-waiting { color: #f0c674; }
    .multi-agent-task-status.is-done { color: #93e0a8; }
    .multi-agent-task-status.is-failed { color: #ff9a9a; }
    .multi-agent-task-summary {
      font-size: 12px;
      color: #b8cae3;
      line-height: 1.4;
    }
    .multi-agent-task-headline {
      font-family: "Fraunces", serif;
      font-size: 13px;
      color: #f4f8ff;
      line-height: 1.35;
    }
    .multi-agent-task-meta {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      color: #6a7e9b;
    }
    .multi-agent-task-chat {
      font-size: 11px;
      color: #9bb1d0;
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .multi-agent-task-time {
      margin-left: auto;
      color: #6a7e9b;
    }
    .multi-agent-task-row[role="button"]:focus-visible {
      outline: 2px solid #ffd07a99;
      outline-offset: 1px;
    }
    .multi-agent-task-row.is-expanded {
      background: #14223680;
      border-color: #ffd07a55;
    }
    .multi-agent-task-row.is-waiting-user {
      border-left: 3px solid #f0c674;
      background: #1c1d10b3;
    }
    .multi-agent-task-row.is-waiting-user:hover {
      background: #25260fb3;
    }
    .multi-agent-tasks-section-label {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #f0c674;
      padding: 6px 4px 2px;
    }
    .multi-agent-tasks-section-label + .multi-agent-tasks-section-label,
    .multi-agent-task-row + .multi-agent-tasks-section-label {
      color: #6a7e9b;
      margin-top: 4px;
    }
    .multi-agent-chain {
      margin-top: 6px;
      padding-top: 8px;
      border-top: 1px dashed #ffffff1c;
      display: grid;
      gap: 6px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #c9daef;
    }
    .multi-agent-chain-card {
      background: #0a1220a8;
      border: 1px solid #ffffff14;
      border-radius: 6px;
      padding: 6px 8px;
      display: grid;
      gap: 3px;
    }
    .multi-agent-chain-card.is-current {
      border-color: #ffd07a99;
      background: #1a2a44a8;
    }
    .multi-agent-chain-card-head {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .multi-agent-chain-card-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .multi-agent-chain-card-actions a,
    .multi-agent-chain-card-actions button {
      border: 1px solid #ffffff2a;
      background: #0c1624a6;
      color: #cfe3ff;
      border-radius: 6px;
      padding: 3px 8px;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      text-decoration: none;
      transition: background 120ms;
    }
    .multi-agent-chain-card-actions a:hover,
    .multi-agent-chain-card-actions button:hover {
      background: #14223680;
    }
    .multi-agent-chain-section-label {
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6a7e9b;
      margin-top: 4px;
    }
    .multi-agent-new {
      display: grid;
      gap: 8px;
      padding: 0;
      border: none;
      background: transparent;
    }
    .multi-agent-new-head {
      font-family: "Fraunces", serif;
      color: #f4f8ff;
      font-size: 14px;
    }
    .multi-agent-new-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
    }
    .multi-agent-new-field,
    .multi-agent-new-block {
      display: grid;
      gap: 3px;
    }
    .multi-agent-new-field span,
    .multi-agent-new-block span {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #c9daef;
    }
    .multi-agent-new-field input,
    .multi-agent-new-field select,
    .multi-agent-new-block textarea {
      border: 1px solid #ffffff2a;
      background: #0a1220a8;
      color: #f4f8ff;
      border-radius: 6px;
      padding: 6px 8px;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      width: 100%;
      box-sizing: border-box;
    }
    .multi-agent-new-block textarea,
    .multi-agent-new-block input {
      border: 1px solid #ffffff2a;
      background: #0a1220a8;
      color: #f4f8ff;
      border-radius: 6px;
      padding: 6px 8px;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      width: 100%;
      box-sizing: border-box;
    }
    .multi-agent-new-block textarea {
      resize: vertical;
      min-height: 36px;
    }
    .multi-agent-new-hint {
      text-transform: none;
      letter-spacing: 0;
      font-style: italic;
      color: #6a7e9b;
      margin-left: 4px;
    }
    .multi-agent-new-counter {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      color: #6a7e9b;
      align-self: flex-end;
      margin-top: 2px;
    }
    .multi-agent-new-counter.is-over {
      color: #ff9a9a;
    }
    .multi-agent-new-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
    }
    .multi-agent-new-status {
      flex: 1;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #9be7ff;
    }
    .multi-agent-new-status.is-error { color: #ff9a9a; }
    .multi-agent-new-cancel,
    .multi-agent-new-submit {
      border: 1px solid #ffffff2a;
      background: #0c1624a6;
      color: #cfe3ff;
      border-radius: 8px;
      padding: 6px 12px;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      transition: background 120ms;
    }
    .multi-agent-new-submit {
      background: #2a4972;
      border-color: #ffd07a99;
      color: #ffe7b8;
    }
    .multi-agent-new-cancel:hover { background: #14223680; }
    .multi-agent-new-submit:hover { background: #355a8a; }
    .settings-btn {
      /* now rendered inside .tab-nav as gear icon — keep for ID reference */
      display: none;
    }
    #dashboard-panel {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-bottom: 120px;
      scrollbar-width: thin;
      scrollbar-color: #3a5a80 transparent;
    }
    .repo-cta {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 5;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 0 12px;
      border-radius: 0;
      text-decoration: none;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #f1f6ff;
      background: linear-gradient(180deg, #ffffff18, #ffffff0d);
      backdrop-filter: blur(6px);
      border-bottom: 1px solid #ffffff22;
      animation: ctaEnter 420ms ease-out both;
      transition: background 0.18s ease;
    }
    .repo-cta:hover {
      background: linear-gradient(180deg, #ffffff22, #ffffff12);
    }
    .repo-text {
      opacity: 0.92;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .repo-star {
      color: #ffe08f;
      animation: starPulse 1.8s ease-in-out infinite;
    }
    @keyframes ctaEnter {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes starPulse {
      0%, 100% { opacity: 0.78; }
      50% { opacity: 1; }
    }
    .settings-modal {
      position: fixed;
      top: 94px;
      right: 18px;
      width: min(320px, calc(100vw - 36px));
      z-index: 6;
      border: 1px solid #d8e4ff20;
      border-radius: 14px;
      background: #0b1220b8;
      backdrop-filter: blur(10px);
      box-shadow: 0 18px 36px #0000005a;
      padding: 12px;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translateY(-8px) scale(0.98);
      transition: opacity 0.2s ease, transform 0.2s ease, visibility 0s linear 0.2s;
    }
    .settings-modal.open {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateY(0) scale(1);
      transition: opacity 0.2s ease, transform 0.2s ease, visibility 0s linear 0s;
    }
    .settings-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #9eb5d6;
      margin-bottom: 6px;
    }
    .settings-close {
      border: none;
      background: transparent;
      color: #9eb5d6;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 0 2px;
    }
    .setting-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 2px;
      border-top: 1px solid #ffffff12;
    }
    .settings-stack {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .setting-main {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      min-width: 0;
    }
    .setting-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .settings-label {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #c8d4e8;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .settings-meta {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #9eb5d6;
      opacity: 0.9;
      letter-spacing: 0.03em;
    }
    .hb-toggle {
      border: 1px solid #ffffff2a;
      background: transparent;
      color: #dce7f8;
      border-radius: 999px;
      min-width: 92px;
      padding: 7px 10px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease, opacity 0.16s ease;
    }
    .hb-toggle:hover {
      transform: translateY(-1px);
    }
    .hb-toggle:disabled {
      cursor: wait;
      opacity: 0.72;
      transform: none;
    }
    .hb-toggle.on {
      background: #11342455;
      border-color: #67f0b560;
      color: #67f0b5;
    }
    .hb-toggle.off {
      background: #34181855;
      border-color: #ff7f7f55;
      color: #ff9b9b;
    }
    .hb-config {
      border: 1px solid #ffffff2a;
      background: #ffffff0f;
      color: #dce7f8;
      border-radius: 999px;
      min-width: 92px;
      padding: 7px 10px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
    }
    .hb-config:hover {
      transform: translateY(-1px);
      background: #ffffff1d;
      border-color: #ffffff42;
    }
    .hb-card {
      width: min(700px, 100%);
      border: 1px solid #d8e4ff20;
      border-radius: 16px;
      background: #0b1220f2;
      box-shadow: 0 20px 44px #00000066;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .hb-form {
      padding: 14px;
      display: grid;
      gap: 12px;
    }
    .hb-field {
      display: grid;
      gap: 6px;
    }
    .hb-label {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #bfd4ef;
    }
    .hb-input,
    .hb-textarea {
      width: 100%;
      border-radius: 10px;
      border: 1px solid #ffffff2e;
      background: #ffffff09;
      color: #eef4ff;
      font-family: "JetBrains Mono", monospace;
      font-size: 13px;
      padding: 10px 11px;
    }
    .hb-textarea {
      min-height: 190px;
      resize: vertical;
      line-height: 1.4;
    }
    .hb-input:focus-visible,
    .hb-textarea:focus-visible {
      outline: 1px solid #7dc5ff88;
      outline-offset: 1px;
    }
    .hb-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border-top: 1px solid #ffffff12;
      padding-top: 12px;
      flex-wrap: wrap;
    }
    .hb-status {
      min-height: 1.2em;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #cde0f7;
      opacity: 0.95;
    }
    .hb-buttons {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hb-btn {
      height: 34px;
      padding: 0 14px;
      border-radius: 999px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.03em;
      cursor: pointer;
      transition: transform 0.16s ease, filter 0.16s ease, opacity 0.16s ease, background 0.16s ease, border-color 0.16s ease;
    }
    .hb-btn:hover {
      transform: translateY(-1px);
    }
    .hb-btn:disabled {
      opacity: 0.7;
      cursor: wait;
      transform: none;
      filter: none;
    }
    .hb-btn.ghost {
      border: 1px solid #ffffff2c;
      background: #ffffff10;
      color: #daebff;
    }
    .hb-btn.solid {
      border: 1px solid #3cb87980;
      background: linear-gradient(180deg, #1f6f47d4 0%, #18563ace 100%);
      color: #c8f8de;
      font-weight: 600;
    }
    .hb-btn.solid:hover {
      filter: brightness(1.06);
    }
    .info-modal {
      position: fixed;
      inset: 0;
      z-index: 7;
      display: grid;
      place-items: center;
      background: #02050db0;
      padding: 18px;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.18s ease, visibility 0s linear 0.18s;
    }
    .info-modal.open {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transition: opacity 0.18s ease, visibility 0s linear 0s;
    }
    .info-card {
      width: min(980px, 100%);
      max-height: min(82vh, 900px);
      border: 1px solid #d8e4ff20;
      border-radius: 16px;
      background: #0b1220f2;
      box-shadow: 0 20px 44px #00000066;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .info-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      border-bottom: 1px solid #ffffff12;
      font-family: "JetBrains Mono", monospace;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #b8c9e5;
      font-size: 12px;
    }
    .info-body {
      padding: 10px 14px 14px;
      overflow: auto;
      display: grid;
      gap: 10px;
      scrollbar-width: thin;
      scrollbar-color: #7fa6d5 #091222;
    }
    .info-section {
      border: 1px solid #ffffff14;
      border-radius: 10px;
      overflow: visible;
      background: #0a1321;
    }
    .info-title {
      padding: 8px 10px;
      border-bottom: 1px solid #ffffff12;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #9db4d6;
    }
    .info-json {
      margin: 0;
      padding: 10px;
      max-height: none;
      min-height: 0;
      overflow: visible;
      display: block;
      white-space: pre;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      color: #d7e3f5;
      background: #060d18;
      line-height: 1.5;
      overscroll-behavior: auto;
    }
    .info-body::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    .info-body::-webkit-scrollbar-track {
      background: #091222;
      border-radius: 999px;
    }
    .info-body::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, #93c6ff, #668ebf);
      border-radius: 999px;
      border: 2px solid #091222;
    }
    .info-body::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, #a9d4ff, #789fce);
    }

    .dock-shell {
      position: fixed;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%);
      width: min(1140px, calc(100% - 24px));
      display: grid;
      grid-template-columns: 84px minmax(0, 1fr) 84px;
      gap: 12px;
      align-items: center;
      z-index: 2;
    }

    .dock {
      width: 100%;
      padding: 6px 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: nowrap;
      gap: 0;
      border-radius: 26px;
      border: 0;
      background: #ffffff08;
      backdrop-filter: blur(10px);
      box-shadow: none;
    }

    .pill {
      min-height: 54px;
      flex: 1 1 0;
      padding: 8px 10px;
      border-radius: 0;
      border: 0;
      border-right: 0;
      background: transparent;
      color: #e7f0ff;
      font-size: 12px;
      letter-spacing: 0.01em;
      font-family: "JetBrains Mono", monospace;
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 3px;
    }
    .pill:last-child {
      border-right: 0;
    }
    .side-bubble {
      width: 74px;
      height: 74px;
      border-radius: 999px;
      background: #ffffff08;
      backdrop-filter: blur(10px);
      display: grid;
      place-items: center;
      text-align: center;
      font-family: "JetBrains Mono", monospace;
      color: #eef4ff;
      line-height: 1.1;
      padding: 8px;
    }
    .side-icon {
      font-size: 13px;
      opacity: 0.85;
    }
    .side-value {
      font-size: 13px;
      font-weight: 600;
      margin-top: 2px;
    }
    .side-label {
      font-size: 10px;
      opacity: 0.75;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 2px;
    }
    .pill-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #d6e2f5;
      opacity: 0.75;
    }
    .pill-icon {
      width: 14px;
      min-width: 14px;
      text-align: center;
      font-size: 11px;
      line-height: 1;
      opacity: 0.9;
    }
    .pill-value {
      font-size: 12px;
      color: #f3f7ff;
      font-weight: 500;
      text-shadow: none;
    }

    .pill.ok { border-color: #67f0b542; }
    .pill.ok .pill-value { color: #8bf7c6; }
    .pill.warn { border-color: #ffc27652; }
    .pill.warn .pill-value { color: #ffd298; }
    .pill.bad { border-color: #ff7f7f47; }
    .pill.bad .pill-value { color: #ffacac; }

    /* ── Tab navigation ── */
    .tab-nav {
      display: flex;
      gap: 6px;
      justify-content: center;
      align-items: center;
      margin-bottom: 12px;
      flex-shrink: 0;
      background: #ffffff08;
      backdrop-filter: blur(8px);
      border: 1px solid #ffffff14;
      border-radius: 999px;
      padding: 4px;
      width: fit-content;
    }
    .tab-btn {
      height: 32px;
      padding: 0 18px;
      border: 1px solid transparent;
      border-radius: 999px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #a8b8d0;
      background: transparent;
      cursor: pointer;
      transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
    }
    .tab-btn:hover {
      color: #d6e6f8;
      background: #ffffff10;
    }
    .tab-btn-active {
      background: #0e2040cc;
      border-color: #ffffff22;
      color: #eef4ff;
    }
    /* Must come AFTER .tab-btn / .tab-btn-active so the settings cog
       overrides the shared sizing rather than being clobbered by it. */
    .tab-btn-settings {
      font-size: 22px;
      padding: 0 12px;
      line-height: 32px;
      border-left: 1px solid #ffffff12;
      margin-left: 2px;
      border-radius: 0 999px 999px 0;
    }
    .tab-btn-split {
      font-size: 18px;
      padding: 0 12px;
      line-height: 32px;
      border-left: 1px solid #ffffff12;
    }
    .tab-btn-split[aria-pressed="true"] {
      color: #7dc5ff;
      background: #0e2040cc;
      border-color: #ffffff22;
    }
    /* Default: show full label, hide short. Mobile media query swaps these. */
    .tab-btn-label-short { display: none; }
    @media (max-width: 640px) {
      .tab-nav {
        gap: 3px;
        padding: 4px;
        margin-bottom: 8px;
      }
      .tab-btn {
        height: 36px;
        padding: 0 14px;
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      .tab-btn-settings {
        font-size: 22px;
        padding: 0 12px;
        line-height: 36px;
      }
      .tab-btn-split {
        font-size: 18px;
        padding: 0 11px;
        line-height: 36px;
      }
      .tab-btn-label-full { display: none; }
      .tab-btn-label-short { display: inline; }
    }

    /* ── Chat panel ── */
    .chat-panel {
      display: flex;
      flex-direction: column;
      width: min(100%, 920px);
      min-width: min(680px, 100%);
      max-width: 100%;
      flex: 1;
      min-height: 0;
      text-align: left;
      border: 1px solid #ffffff22;
      border-radius: 16px 16px 0 0;
      background:
        radial-gradient(120% 100% at 100% 0%, #7dc5ff12, transparent 55%),
        linear-gradient(180deg, #0e1a2a88 0%, #0a1220a8 100%);
      backdrop-filter: blur(6px);
      box-shadow: 0 14px 34px #00000045;
      overflow: hidden;
    }
    .chat-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      border-bottom: 1px solid #ffffff12;
      position: relative;
    }
    .chat-toolbar-left {
      display: flex;
      gap: 6px;
    }
    .chat-toolbar-btn {
      border: 1px solid #ffffff1a;
      border-radius: 6px;
      background: transparent;
      color: #a8b4c5;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      padding: 3px 10px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .chat-toolbar-btn:hover {
      background: #ffffff10;
      color: #eef4ff;
    }
    /* Toolbar chat-title input. Kelly 2026-05-20: sits inside
       .chat-toolbar-left, immediately after the agent badge, so the
       title reads alongside the agent. Hidden for empty chats — those
       use #chat-new-title-input above the message box instead. The
       placeholder mirrors what the chat WOULD auto-name to (preview
       text, or "Untitled chat") so it reads like a suggestion. */
    .chat-name-input {
      flex: 0 1 240px;
      min-width: 0;
      max-width: 320px;
      background: transparent;
      color: #cfe3ff;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 3px 8px;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 12px;
      transition: border-color 0.15s, background 0.15s;
    }
    .chat-name-input::placeholder {
      color: #5a7a9a;
      font-style: italic;
    }
    .chat-name-input:hover {
      border-color: #ffffff14;
    }
    .chat-name-input:focus {
      outline: none;
      border-color: #ffd07a99;
      background: #0c1624a6;
    }
    /* New-chat title input — sits above the message textarea, only
       visible while the chat has no messages. Commits via the same
       submitChatRename mechanism. */
    .chat-new-title-input {
      display: block;
      width: 100%;
      box-sizing: border-box;
      background: #0c1624a6;
      color: #e4eefb;
      border: 1px solid #ffffff22;
      border-radius: 8px;
      padding: 6px 12px;
      margin-bottom: 8px;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 13px;
    }
    .chat-new-title-input::placeholder {
      color: #6a7e9b;
      font-style: italic;
    }
    .chat-new-title-input:focus {
      outline: 2px solid #ffd07a99;
      outline-offset: 1px;
      border-color: #ffd07a99;
    }
    /* Title input inside the chat-from-task mini-form on the task viewer.
       Same shape as the Next form's headline input — single-line, full-
       width, accent on focus. */
    .task-panel-chat-title-input {
      display: block;
      width: 100%;
      background: #0c1624a6;
      color: #e4eefb;
      border: 1px solid #ffffff2a;
      border-radius: 6px;
      padding: 6px 10px;
      margin-bottom: 8px;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 12px;
      box-sizing: border-box;
    }
    .task-panel-chat-title-input:focus {
      outline: 2px solid #ffd07a99;
      outline-offset: 1px;
      border-color: #ffd07a99;
    }
    .chat-session-badge {
      border: 1px solid #ffffff14;
      border-radius: 6px;
      background: transparent;
      color: #7a8698;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.02em;
      padding: 3px 8px;
      margin-left: auto;
      margin-right: 6px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }
    .chat-session-badge:hover {
      background: #ffffff10;
      color: #a8b4c5;
    }
    @media (max-width: 600px) {
      .chat-session-badge { max-width: 140px; font-size: 9px; }
    }
    .chat-history-dropdown {
      position: absolute;
      top: 100%;
      left: 10px;
      right: 10px;
      background: #1a1e2a;
      border: 1px solid #ffffff1a;
      border-radius: 8px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 50;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .chat-history-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px 8px 12px;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      color: #6b7a90;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border-bottom: 1px solid #ffffff0d;
    }
    .chat-history-new {
      border: 1px solid #ffffff1f;
      background: #ffffff08;
      color: #c8d4e5;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.03em;
      text-transform: none;
      padding: 4px 10px;
      border-radius: 999px;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s;
    }
    .chat-history-new:hover {
      background: #ffffff14;
      border-color: #ffffff33;
    }
    .chat-history-list {
      padding: 4px;
    }
    .chat-history-row {
      display: flex;
      align-items: stretch;
      gap: 4px;
      border-radius: 6px;
    }
    .chat-history-row-active {
      background: #ffffff08;
      border-left: 2px solid #6e8efb;
    }
    .chat-history-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      padding: 8px 10px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #c8d4e5;
      text-align: left;
      cursor: pointer;
      font-family: "Space Grotesk", sans-serif;
      font-size: 12px;
      transition: background 0.12s;
    }
    .chat-history-item:hover {
      background: #ffffff0d;
    }
    .chat-history-row-active .chat-history-item {
      background: transparent;
    }
    .chat-history-active {
      background: transparent;
    }
    .chat-history-sync-btn {
      flex: 0 0 auto;
      align-self: center;
      width: 28px;
      height: 28px;
      margin-right: 4px;
      padding: 0;
      border: 1px solid #ffffff1a;
      border-radius: 6px;
      background: #ffffff05;
      color: #c8d4e5;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      transition: background 0.12s, transform 0.12s;
    }
    .chat-history-sync-btn:hover {
      background: #ffffff12;
    }
    .chat-history-sync-btn.is-syncing {
      opacity: 0.6;
      animation: chat-history-sync-spin 0.8s linear infinite;
    }
    .chat-history-rename-btn {
      flex: 0 0 auto;
      align-self: center;
      width: 28px;
      height: 28px;
      margin-right: 4px;
      padding: 0;
      border: 1px solid #ffffff1a;
      border-radius: 6px;
      background: #ffffff05;
      color: #c8d4e5;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      opacity: 0;
      transition: opacity 0.12s, background 0.12s;
    }
    .chat-history-row:hover .chat-history-rename-btn,
    .chat-history-row-active .chat-history-rename-btn {
      opacity: 1;
    }
    .chat-history-rename-btn:hover {
      background: #ffffff12;
    }
    .chat-history-rename-input {
      flex: 1 1 auto;
      min-width: 0;
      margin: 4px 4px 4px 10px;
      padding: 6px 8px;
      border: 1px solid var(--accent, #7bd88f);
      border-radius: 6px;
      background: #0d1117;
      color: #e5eaf3;
      font: inherit;
      outline: none;
    }
    @keyframes chat-history-sync-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .chat-history-preview {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chat-history-meta {
      font-size: 10px;
      color: #5a6a7e;
    }
    .chat-history-empty {
      padding: 12px;
      text-align: center;
      font-size: 11px;
      color: #5a6a7e;
    }
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      scrollbar-width: thin;
      scrollbar-color: #7fa6d5 #091222;
      position: relative;
    }
    .chat-messages::-webkit-scrollbar {
      width: 6px;
    }
    .chat-messages::-webkit-scrollbar-track {
      background: transparent;
    }
    .chat-messages::-webkit-scrollbar-thumb {
      background: #3a5a80;
      border-radius: 999px;
    }
    .chat-empty {
      margin: auto;
      text-align: center;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #5a7a9a;
      padding: 40px 20px;
    }
    .chat-picker-head {
      font-family: "Space Grotesk", sans-serif;
      font-size: 14px;
      letter-spacing: 0.02em;
      text-transform: none;
      color: #c7d1e0;
      margin-bottom: 4px;
    }
    .chat-picker-sub {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.02em;
      text-transform: none;
      color: #6a7c91;
      margin-bottom: 16px;
    }
    .chat-picker-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 480px;
      margin: 0 auto;
    }
    .chat-picker-item {
      text-align: left;
      padding: 10px 12px;
      border: 1px solid #ffffff14;
      border-radius: 8px;
      background: #ffffff06;
      color: #c7d1e0;
      cursor: pointer;
      font-family: "Space Grotesk", sans-serif;
      text-transform: none;
      letter-spacing: 0;
      transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
    }
    .chat-picker-item:hover {
      background: #ffffff0e;
      border-color: #ffffff26;
    }
    .chat-picker-item-active {
      background: linear-gradient(180deg, #2f5486, #24406a);
      border-color: #7fb1f0;
      color: #eef4ff;
      box-shadow: 0 0 0 1px #7fb1f055, 0 6px 20px #1a3b6a55;
    }
    .chat-picker-item-title {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 2px;
    }
    .chat-picker-item-desc {
      font-size: 11px;
      color: #8892a4;
      line-height: 1.4;
    }
    .chat-picker-item-active .chat-picker-item-desc { color: #b8c7dc; }
    .chat-picker-actions {
      max-width: 480px;
      margin: 18px auto 0;
      padding-top: 14px;
      border-top: 1px dashed #ffffff14;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .chat-picker-actions-hint {
      font-size: 12px;
      color: #6a7c91;
      font-family: "Space Grotesk", sans-serif;
    }
    .chat-picker-task-btn {
      padding: 8px 14px;
      border: 1px solid #ffffff1f;
      border-radius: 8px;
      background: #ffffff0a;
      color: #c7d1e0;
      cursor: pointer;
      font-family: "Space Grotesk", sans-serif;
      font-size: 12px;
      letter-spacing: 0.02em;
      transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
    }
    .chat-picker-task-btn:hover:not(:disabled) {
      background: linear-gradient(180deg, #2f5486, #24406a);
      border-color: #7fb1f0;
      color: #eef4ff;
    }
    .chat-picker-task-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .chat-agent-badge {
      display: inline-block;
      padding: 3px 8px;
      border: 1px solid #ffffff14;
      border-radius: 6px;
      background: #ffffff06;
      color: #a8b4c5;
      font-family: "Space Grotesk", sans-serif;
      font-size: 11px;
      letter-spacing: 0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
    }
    .chat-agent-badge[data-locked="0"] {
      color: #7a8698;
      border-style: dashed;
    }
    @media (max-width: 600px) {
      .chat-agent-badge { max-width: 120px; font-size: 10px; }
    }
    .chat-send:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .chat-msg {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      animation: rise 200ms ease-out both;
    }
    .chat-msg-text {
      max-width: 88%;
    }
    .chat-msg-user {
      align-self: flex-end;
      align-items: flex-end;
    }
    .chat-msg-assistant {
      align-self: flex-start;
      align-items: flex-start;
    }
    .chat-msg-role {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      opacity: 0.55;
      padding: 0 4px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .chat-msg-pill {
      font-size: 9px;
      letter-spacing: 0.08em;
      padding: 1px 6px;
      border-radius: 999px;
      background: #ffffff14;
      border: 1px solid #ffffff22;
      color: #9ab6d6;
      opacity: 0.9;
    }
    .chat-msg-user-pending .chat-msg-text {
      opacity: 0.6;
    }
    .chat-msg-text {
      padding: 10px 14px;
      border-radius: 14px;
      font-family: "JetBrains Mono", monospace;
      font-size: 13px;
      line-height: 1.55;
      word-break: break-word;
    }
    .chat-msg-user .chat-msg-text {
      background: linear-gradient(135deg, #1a4a7a, #0f3060);
      border: 1px solid #2a6aaa44;
      color: #d8eeff;
      border-bottom-right-radius: 4px;
      white-space: pre-wrap;
    }
    .chat-msg-assistant .chat-msg-text {
      background: #0b1828cc;
      border: 1px solid #ffffff18;
      color: #e4eefb;
      border-bottom-left-radius: 4px;
    }
    .chat-msg-text code {
      background: #ffffff15;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 12px;
    }
    .chat-msg-text pre {
      background: #00000040;
      padding: 8px 10px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 6px 0;
    }
    .chat-msg-text pre code {
      background: none;
      padding: 0;
    }
    .chat-msg-text strong { color: #fff; }
    .chat-msg-text h3, .chat-msg-text h4, .chat-msg-text h5 {
      margin: 8px 0 4px;
      font-size: 13px;
      color: #fff;
    }
    .chat-msg-text ul {
      margin: 4px 0;
      padding-left: 18px;
    }
    .chat-msg-text li { margin: 2px 0; }
    .chat-msg-text ul.chat-msg-bullets {
      margin: 2px 0;
      padding-left: 20px;
      list-style: disc;
    }
    .chat-msg-text ul.chat-msg-bullets > li {
      margin: 6px 0;
      line-height: 1.45;
    }
    .chat-msg-text ul.chat-msg-bullets > li.chat-msg-bullet-raw {
      list-style: none;
      margin-left: -20px;
    }
    .chat-msg-streaming .chat-msg-text::after {
      content: "▋";
      display: inline-block;
      color: var(--accent);
      animation: caret 0.8s step-end infinite;
      margin-left: 2px;
    }
    .chat-input-area {
      flex-shrink: 0;
      padding: 10px 12px 12px;
      border-top: 1px solid #ffffff12;
      background: #080f1c66;
    }
    .chat-task-host {
      flex-shrink: 0;
      max-height: 50%;
      overflow-y: auto;
      padding: 8px 12px;
      border-top: 1px solid #ffffff12;
      background: #050b16;
    }
    .chat-task-host .multi-agent-new.is-in-chat {
      margin: 0;
      border: 1px solid #ffffff14;
    }
    .chat-form {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      border: 1px solid #ffffff2e;
      border-radius: 14px;
      background: #ffffff09;
      padding: 8px 8px 8px 12px;
      transition: border-color 0.18s ease;
    }
    .chat-form:focus-within {
      border-color: #7dc5ff55;
    }
    .chat-input {
      flex: 1;
      border: 0;
      background: transparent;
      color: #eef4ff;
      font-family: "JetBrains Mono", monospace;
      font-size: 13px;
      line-height: 1.5;
      resize: none;
      max-height: 160px;
      overflow-y: auto;
      padding: 2px 0;
      scrollbar-width: thin;
      scrollbar-color: #3a5a80 transparent;
    }
    .chat-input::placeholder {
      color: #4a6a8a;
    }
    .chat-input:focus {
      outline: none;
    }
    .chat-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
      align-items: stretch;
    }
    .chat-send,
    .chat-cancel,
    .chat-interrupt {
      flex-shrink: 0;
      flex-grow: 0;
      height: 28px;
      padding: 0 10px;
      border-radius: 999px;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.03em;
      line-height: 1;
      white-space: nowrap;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.16s ease, filter 0.16s ease, opacity 0.16s ease, background 0.16s ease, border-color 0.16s ease;
    }
    .chat-send {
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 50%;
      font-size: 15px;
      line-height: 1;
      font-weight: 700;
    }
    .chat-send[hidden],
    .chat-cancel[hidden],
    .chat-interrupt[hidden] {
      display: none;
    }
    .chat-interrupt {
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 50%;
      font-size: 14px;
      line-height: 1;
      border: 1px solid #ffb36655;
      background: #3a220055;
      color: #ffcf99;
    }
    .chat-interrupt:hover {
      transform: translateY(-1px);
      background: #4a2a0070;
      border-color: #ffcf9966;
    }
    .chat-interrupt:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
    }
    .chat-send {
      border: 1px solid #3cb87980;
      background: linear-gradient(180deg, #1f6f47d4 0%, #18563ace 100%);
      color: #c8f8de;
      font-weight: 600;
    }
    .chat-send:hover {
      transform: translateY(-1px);
      filter: brightness(1.06);
    }
    .chat-send:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
      filter: none;
    }
    .chat-cancel {
      border: 1px solid #ff7f7f55;
      background: #34181855;
      color: #ff9b9b;
    }
    .chat-cancel:hover {
      transform: translateY(-1px);
      background: #4d191970;
      border-color: #ff9b9b66;
    }
    .chat-msg-meta {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      color: #7a9aba;
      padding: 2px 4px;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      justify-content: space-between;
    }
    .chat-msg-meta-label {
      display: inline-flex;
      align-items: center;
    }
    .chat-msg-thinking .chat-msg-meta-label {
      animation: caret 1.4s step-end infinite;
    }
    .chat-msg-background .chat-msg-meta-label {
      animation: caret 2s step-end infinite;
    }
    .chat-msg-thinking { color: #9ab6d6; }
    .chat-msg-error .chat-msg-text {
      border-color: #ff7f7f55;
      background: #2b141466;
      color: #ffc2c2;
    }
    .chat-msg-stop-inline {
      appearance: none;
      cursor: pointer;
      padding: 2px 10px;
      border-radius: 4px;
      background: #3a121266;
      color: #ff8a8a;
      border: 1px solid #ff4d4d88;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 600;
      line-height: 1.4;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      transition: transform 0.14s ease, background 0.14s ease, border-color 0.14s ease;
    }
    .chat-msg-stop-inline:hover {
      background: #5a1a1a90;
      border-color: #ff4d4d;
      transform: translateY(-1px);
    }
    .chat-msg-stop-inline:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    /* ── Files panel ── */
    /* Width matches the Tasks panel (Kelly 2026-05-20). Both pages share
       the same picker-on-left, viewer-on-right shape, so they should
       render at the same width on large screens. The min/max-width rules
       below clamp identically.

       Kelly 2026-05-25: container-type: inline-size lets the inner
       split-collapse rules react to THIS panel's width rather than the
       viewport — so a split-screen or sidebar browser window collapses
       the picker correctly even when the OS viewport is wide. */
    .files-panel {
      display: flex;
      flex-direction: column;
      width: min(100%, 1300px);
      min-width: min(680px, 100%);
      max-width: 100%;
      flex: 1;
      min-height: 0;
      text-align: left;
      border: 1px solid #ffffff22;
      border-radius: 16px 16px 0 0;
      background:
        radial-gradient(120% 100% at 100% 0%, #7dc5ff12, transparent 55%),
        linear-gradient(180deg, #0e1a2a88 0%, #0a1220a8 100%);
      backdrop-filter: blur(6px);
      box-shadow: 0 14px 34px #00000045;
      overflow: hidden;
      container-type: inline-size;
      container-name: files-panel;
    }
    /* ── Tasks panel ── */
    .tasks-panel {
      display: flex;
      flex-direction: column;
      width: min(100%, 1300px);
      min-width: min(680px, 100%);
      max-width: 100%;
      flex: 1;
      min-height: 0;
      text-align: left;
      border: 1px solid #ffffff22;
      border-radius: 16px 16px 0 0;
      background:
        radial-gradient(120% 100% at 100% 0%, #7dc5ff12, transparent 55%),
        linear-gradient(180deg, #0e1a2a88 0%, #0a1220a8 100%);
      backdrop-filter: blur(6px);
      box-shadow: 0 14px 34px #00000045;
      container-type: inline-size;
      container-name: tasks-panel;
      overflow: hidden;
    }
    /* WAL-63 Phase 2: top-level Tasks view tabs (Current / Projects / All
       tasks). Sits above the existing status-filter chip row. Active tab
       carries a brighter underline so the structural split between view
       (which list) and filter (what's in this list) reads at a glance. */
    .tasks-view-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 10px 0;
      border-bottom: 1px solid #ffffff10;
    }
    .tasks-view-tab {
      border: none;
      background: transparent;
      color: #8aa0bd;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      letter-spacing: 0.04em;
      padding: 6px 14px 8px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 120ms, border-color 120ms;
    }
    .tasks-view-tab:hover { color: #cfe3ff; }
    .tasks-view-tab.is-active {
      color: #ffe7b8;
      border-bottom-color: #ffd07a;
    }
    /* Current view: project group cards. Each project is a collapsible
       section; rows inside carry status colour dots so the inbox reads at a
       glance. Grouping by project replaces the flat picker for the Current
       inbox; the All-tasks view still uses the legacy tree. */
    .tasks-current {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 10px 12px;
      overflow-y: auto;
    }
    .tasks-current-empty {
      padding: 24px;
      text-align: center;
      color: #5a7a9a;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
    }
    .tasks-current-group {
      border: 1px solid #ffffff14;
      border-radius: 10px;
      background: #0c1624a6;
      overflow: hidden;
    }
    .tasks-current-group-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #14223680;
      border-bottom: 1px solid #ffffff12;
      cursor: pointer;
      user-select: none;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      color: #cfe3ff;
    }
    .tasks-current-group-name {
      flex: 1;
      letter-spacing: 0.04em;
    }
    .tasks-current-group-count {
      color: #8aa0bd;
      font-size: 10px;
    }
    .tasks-current-group-chevron {
      color: #8aa0bd;
      font-size: 11px;
    }
    .tasks-current-group.is-collapsed .tasks-current-group-body { display: none; }
    .tasks-current-group.is-collapsed .tasks-current-group-chevron::before { content: "▸"; }
    .tasks-current-group:not(.is-collapsed) .tasks-current-group-chevron::before { content: "▾"; }
    .tasks-current-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #ffffff08;
      transition: background 120ms;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #c8d4e5;
    }
    .tasks-current-row:last-child { border-bottom: none; }
    .tasks-current-row:hover { background: #ffffff0a; }
    .tasks-current-row.is-active {
      background: #1c3a644d;
      border-left: 2px solid #9be7ff;
      padding-left: 10px;
    }
    .tasks-current-row-dot {
      flex-shrink: 0;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #5a7a9a;
      margin-top: 5px; /* align with the title baseline on the first line */
    }
    .tasks-current-row-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .tasks-current-row-sub {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      font-size: 10px;
      color: #6a7e9b;
    }
    .tasks-current-row-id {
      flex-shrink: 0;
      color: #6a8cb0;
      font-family: "JetBrains Mono", monospace;
    }
    .tasks-current-row.status-done .tasks-current-row-dot { background: #6fcf97; }
    .tasks-current-row.status-failed .tasks-current-row-dot { background: #eb5757; }
    .tasks-current-row.status-waiting-user .tasks-current-row-dot { background: #f0c674; }
    .tasks-current-row.status-waiting-task .tasks-current-row-dot { background: #f2994a; }
    .tasks-current-row.status-waiting-limits .tasks-current-row-dot { background: #e0e0e0; }
    .tasks-current-row.status-waiting-other .tasks-current-row-dot { background: #b0b0b0; }
    .tasks-current-row.status-claimed .tasks-current-row-dot { background: #56ccf2; }
    .tasks-current-row.status-open .tasks-current-row-dot { background: #4a5668; }
    .tasks-current-row-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #e4eefb;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.35;
    }
    .tasks-current-row-meta {
      display: flex;
      gap: 8px;
      align-items: center;
      color: #8aa0bd;
      font-size: 10px;
      text-align: right;
      white-space: nowrap;
    }
    /* Projects placeholder — kept for compatibility but unused after Phase 4
       replaced the placeholder with the live card grid below. */
    .tasks-projects-placeholder {
      padding: 32px 24px;
      text-align: center;
      color: #8aa0bd;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      line-height: 1.6;
    }
    .tasks-projects-placeholder strong { color: #cfe3ff; }
    /* WAL-63 Phase 4: project card grid in the Projects view sidebar. One
       card per Notes/Projects/<slug>/ folder (plus an Unassigned card when
       un-tagged tasks exist). Counts row mirrors the plan's legend. */
    .tasks-projects-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 12px;
      overflow-y: auto;
    }
    .tasks-project-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      border: 1px solid #ffffff14;
      border-radius: 10px;
      background: #0c1624a6;
      cursor: pointer;
      text-align: left;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #c8d4e5;
      transition: background 120ms, border-color 120ms;
    }
    .tasks-project-card:hover {
      background: #14223680;
      border-color: #ffffff22;
    }
    .tasks-project-card.is-active {
      background: #1c3a644d;
      border-color: #9be7ff;
    }
    .tasks-project-card-head {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tasks-project-card-name {
      flex: 1;
      color: #ffe7b8;
      font-size: 12px;
      letter-spacing: 0.04em;
    }
    .tasks-project-card-jira, .tasks-project-card-status {
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 9px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .tasks-project-card-jira {
      background: #2a4972;
      color: #cfe3ff;
    }
    .tasks-project-card-status {
      background: #1a3322;
      color: #6fcf97;
    }
    .tasks-project-card-slug {
      color: #8aa0bd;
      font-size: 10px;
    }
    .tasks-project-card-counts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .tasks-project-card-counts .count {
      font-size: 10px;
      letter-spacing: 0.03em;
      color: #8aa0bd;
    }
    .tasks-project-card-counts .count-active { color: #56ccf2; }
    .tasks-project-card-counts .count-done { color: #6fcf97; }
    .tasks-project-card-counts .count-stuck { color: #eb5757; }
    .tasks-project-card-counts .count-closed { color: #5a7a9a; }
    .tasks-project-card-foot {
      display: flex;
      justify-content: flex-end;
      color: #5a7a9a;
      font-size: 10px;
    }
    /* WAL-63 Phase 4: project page right-pane container — replaces the task
       viewer when Kelly drills into a project card. */
    .tasks-project-pane {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      font-family: "Space Grotesk", -apple-system, sans-serif;
      color: #cfe3ff;
    }
    .tasks-project-head {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-bottom: 12px;
      border-bottom: 1px solid #ffffff14;
    }
    .tasks-project-head-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .tasks-project-title {
      flex: 1;
      font-family: "Fraunces", serif;
      font-size: 22px;
      color: #ffe7b8;
      letter-spacing: 0.01em;
    }
    .tasks-project-jira, .tasks-project-status {
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .tasks-project-jira { background: #2a4972; color: #cfe3ff; }
    .tasks-project-status { background: #1a3322; color: #6fcf97; }
    .tasks-project-slug {
      color: #8aa0bd;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
    }
    .tasks-project-metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 6px;
    }
    .tasks-project-metrics .metric {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .tasks-project-metrics .metric-label {
      font-size: 10px;
      color: #5a7a9a;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-family: "JetBrains Mono", monospace;
    }
    .tasks-project-metrics .metric-value {
      color: #ffe7b8;
      font-family: "JetBrains Mono", monospace;
      font-size: 13px;
    }
    .tasks-project-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .tasks-project-hide-toggle {
      cursor: pointer;
      gap: 6px;
    }
    /* WAL-63 Phase 4a: documents shelf — sits between header and leaves. */
    .tasks-project-docs {
      margin: 14px 0;
    }
    .tasks-project-docs-head {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #5a7a9a;
      margin-bottom: 8px;
    }
    .tasks-project-docs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 10px;
    }
    .tasks-project-doc-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      border: 1px solid #ffffff14;
      border-radius: 8px;
      background: #0c1624a6;
      color: #cfe3ff;
      cursor: pointer;
      text-align: left;
      font-family: "Space Grotesk", -apple-system, sans-serif;
      font-size: 12px;
      transition: background 120ms, border-color 120ms;
    }
    .tasks-project-doc-card:hover {
      background: #14223680;
      border-color: #ffd07a55;
    }
    .tasks-project-doc-card.kind-primary { border-left: 3px solid #9be7ff; }
    .tasks-project-doc-card.kind-fdp { border-left: 3px solid #ffd07a; }
    .tasks-project-doc-card.kind-other { border-left: 3px solid #5a7a9a; }
    .tasks-project-doc-card-title {
      font-family: "Fraunces", serif;
      font-size: 14px;
      color: #ffe7b8;
    }
    .tasks-project-doc-card-desc {
      color: #b8cae3;
      line-height: 1.45;
    }
    .tasks-project-doc-card-meta {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      color: #8aa0bd;
    }
    .tasks-project-docs-other {
      margin-top: 10px;
    }
    .tasks-project-docs-other > summary {
      cursor: pointer;
      color: #8aa0bd;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      padding: 6px 0;
    }
    .tasks-project-docs-other > summary:hover { color: #cfe3ff; }
    .tasks-project-docs-other[open] > summary { color: #cfe3ff; }
    /* Project page sections — leaves, families, closed. */
    .tasks-project-section {
      margin-top: 18px;
    }
    .tasks-project-section-head {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #ffd07a;
      margin-bottom: 8px;
    }
    .tasks-project-trees {
      border: 1px solid #ffffff14;
      border-radius: 8px;
      padding: 6px 8px;
      background: #0c1624a6;
    }
    .tasks-project-closed > summary {
      cursor: pointer;
    }
    .tasks-project-closed[open] > summary {
      margin-bottom: 8px;
    }
    .tasks-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-bottom: 1px solid #ffffff12;
      flex-wrap: wrap;
    }
    .tasks-toolbar-left {
      display: flex;
      gap: 6px;
    }
    .tasks-toolbar-right {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-left: auto;
    }
    .tasks-toolbar-btn {
      border: 1px solid #ffffff1a;
      border-radius: 6px;
      background: transparent;
      color: #a8b4c5;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      padding: 3px 10px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .tasks-toolbar-btn:hover {
      background: #ffffff10;
      color: #eef4ff;
    }
    .tasks-filter-chips {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .tasks-filter-chip {
      border: 1px solid #ffffff1a;
      border-radius: 6px;
      background: transparent;
      color: #7a8698;
      padding: 3px 9px;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .tasks-filter-chip:hover {
      background: #ffffff10;
      color: #eef4ff;
    }
    .tasks-filter-chip.is-active {
      background: #1c3a64aa;
      color: #f4f8ff;
      border-color: #9be7ff66;
    }
    /* Picker toggle is just another toolbar button — desktop hides it
       (both panes are always side-by-side); mobile shows it as the way
       back to the list when the viewer is full-width. */
    .tasks-picker-toggle {
      display: none;
    }
    .tasks-split {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .tasks-sidebar {
      width: 320px;
      min-width: 240px;
      border-right: 1px solid #ffffff12;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #3a5a80 transparent;
    }
    .tasks-tree {
      padding: 6px 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .tasks-loading {
      padding: 12px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #5a7a9a;
    }
    .tasks-tree-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #c8d4e5;
      transition: background 0.12s;
    }
    .tasks-tree-row:hover { background: #ffffff0d; }
    /* Top-level parent rows in the picker tree get a lighter background
       so the family hierarchy is easier to scan. Kelly 2026-05-20. */
    .tasks-tree-row.is-root {
      background: #ffffff05;
    }
    .tasks-tree-row.is-active {
      background: #1c3a644d;
      border-left: 2px solid #9be7ff;
      padding-left: 6px;
    }
    .tasks-tree-row.is-waiting-user {
      background: #f0c67414;
      border-left: 2px solid #f0c674;
      padding-left: 6px;
    }
    /* WAL-63 Phase 1: closed tasks recede in the picker. The headline, ids,
       and status pill all fade so the user-attention overlay reads at a
       glance without an extra column. Hover and active highlights still
       override so the row stays interactive. */
    .tasks-tree-row.is-closed {
      opacity: 0.45;
    }
    .tasks-tree-row.is-closed .tasks-tree-headline {
      text-decoration: line-through;
      text-decoration-color: #5a7a9a99;
    }
    .tasks-tree-row.is-closed:hover { opacity: 0.75; }
    /* Selected-closed rows: keep the muted look so the user-attention
       overlay still reads when a closed task is open in the viewer.
       The .is-active border + background still apply for affordance. */
    .tasks-tree-row.is-closed.is-active { opacity: 0.55; }
    .tasks-tree-indent {
      display: inline-block;
      flex-shrink: 0;
    }
    .tasks-tree-chevron {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      background: transparent;
      color: #8aa0bd;
      font-size: 14px;
      line-height: 24px;
      cursor: pointer;
      border-radius: 4px;
      transition: color 120ms, background 120ms;
    }
    .tasks-tree-chevron:hover {
      color: #cfe3ff;
      background: #ffffff14;
    }
    .tasks-tree-chevron.is-expanded {
      color: #ffd07a;
    }
    .tasks-tree-chevron-spacer {
      display: inline-block;
      flex-shrink: 0;
      width: 24px;
    }
    .tasks-tree-marker {
      flex-shrink: 0;
      width: 12px;
      color: #5a7a9a;
      text-align: center;
    }
    .tasks-tree-titlecol {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 1px;
      overflow: hidden;
    }
    .tasks-tree-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .tasks-tree-id {
      flex-shrink: 0;
      color: #6a8cb0;
      font-size: 10px;
      opacity: 0.85;
      white-space: nowrap;
    }
    .tasks-tree-agent {
      flex-shrink: 0;
      color: #c8a3ff;
      font-size: 10px;
    }
    .tasks-tree-status {
      flex-shrink: 0;
      font-size: 9px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 1px 6px;
      border-radius: 999px;
      border: 1px solid #ffffff22;
      white-space: nowrap;
    }
    .tasks-tree-status.is-open { color: #9be7ff; border-color: #9be7ff55; }
    .tasks-tree-status.is-waiting { color: #f0c674; border-color: #f0c67455; }
    .tasks-tree-status.is-done { color: #93e0a8; border-color: #93e0a855; }
    .tasks-tree-status.is-failed { color: #ff9a9a; border-color: #ff9a9a55; }
    .tasks-tree-headline {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #e4eefb;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 12px;
    }
    @media (max-width: 640px) {
      .tasks-tree-id {
        font-size: 9px;
      }
      .tasks-tree-agent { display: none; }
    }
    .tasks-tree-empty {
      padding: 16px;
      color: #5a7a9a;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      text-align: center;
    }
    .tasks-tree-section {
      padding: 10px 10px 4px;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6a7e9b;
    }
    .tasks-content {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .tasks-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      padding: 32px;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      color: #5a7a9a;
      text-align: center;
      letter-spacing: 0.03em;
    }
    .tasks-empty strong { color: #cfe3ff; }
    .tasks-viewer {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    .tasks-viewer-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border-bottom: 1px solid #ffffff12;
    }
    .tasks-viewer-headline-wrap {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 8px;
      overflow: hidden;
    }
    .tasks-viewer-id {
      flex-shrink: 0;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6a7e9b;
    }
    .tasks-viewer-headline {
      flex: 1;
      min-width: 0;
      font-family: "Fraunces", serif;
      font-size: 15px;
      color: #f4f8ff;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border-radius: 4px;
      padding: 2px 4px;
      margin: -2px -4px;
      transition: background 120ms;
    }
    .tasks-viewer-headline.is-editable {
      cursor: text;
    }
    .tasks-viewer-headline.is-editable:hover {
      background: #ffffff0a;
    }
    .tasks-viewer-headline-input {
      width: 100%;
      box-sizing: border-box;
      background: #0c1624a6;
      color: #f4f8ff;
      border: 1px solid #ffd07a99;
      border-radius: 4px;
      padding: 1px 4px;
      font-family: "Fraunces", serif;
      font-size: 15px;
      line-height: 1.25;
    }
    .tasks-viewer-headline-input:focus {
      outline: none;
      box-shadow: 0 0 0 2px #ffd07a55;
    }
    .tasks-viewer-status-wrap { flex: 0 0 auto; }
    .tasks-viewer-status {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #0c1624a6;
      border: 1px solid #ffffff22;
      color: #cfe3ff;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .tasks-viewer-status.is-open { color: #9be7ff; border-color: #9be7ff55; }
    .tasks-viewer-status.is-waiting { color: #f0c674; border-color: #f0c67455; }
    .tasks-viewer-status.is-done { color: #93e0a8; border-color: #93e0a855; }
    .tasks-viewer-status.is-failed { color: #ff9a9a; border-color: #ff9a9a55; }
    .tasks-viewer-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 12px 0;
      border-bottom: 1px solid #ffffff12;
    }
    .tasks-viewer-tab {
      border: none;
      background: transparent;
      color: #8aa2c1;
      padding: 8px 14px;
      border-bottom: 2px solid transparent;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: color 0.12s, border-color 0.12s;
    }
    .tasks-viewer-tab:hover { color: #e4eefb; }
    .tasks-viewer-tab.is-active {
      color: #9be7ff;
      border-bottom-color: #9be7ff;
    }
    .tasks-viewer-body {
      padding: 0;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 0;
      scrollbar-width: thin;
      scrollbar-color: #3a5a80 transparent;
    }
    .tasks-viewer-pane[data-pane="task"] {
      padding: 14px;
    }
    .tasks-viewer-pane[data-pane="report"] {
      padding: 0;
    }
    .tasks-viewer-pane[data-pane="report"] .task-panel-report-pane {
      gap: 0;
    }
    .tasks-viewer-pane[data-pane="report"] .task-panel-report-doc {
      border: none;
      border-radius: 0;
      background: transparent;
      margin: 0;
    }
    .tasks-viewer-pane[data-pane="report"] .task-panel-report-doc-head {
      padding: 8px 12px;
    }
    .tasks-viewer-pane[data-pane="report"] .task-panel-doc-pills {
      padding: 8px 12px 0;
    }
    .tasks-viewer-pane[data-pane="report"] .task-panel-report-doc .task-panel-report {
      padding: 8px 12px 14px;
      max-height: none;
      border: none;
      border-radius: 0;
      background: transparent;
    }
    .task-panel-report-frontmatter,
    .files-md-frontmatter {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      line-height: 1.4;
      color: #8a96a8;
      background: rgba(0, 0, 0, 0.22);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      padding: 6px 8px;
      margin: 0 0 14px;
      overflow-x: auto;
      white-space: pre;
      scrollbar-width: thin;
      scrollbar-color: #3a5a80 transparent;
    }
    .task-panel-folder-btn {
      border: 1px solid #ffffff2a;
      background: #0c1624a6;
      color: #cfe3ff;
      border-radius: 6px;
      width: 32px;
      height: 28px;
      font-size: 14px;
      cursor: pointer;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .task-panel-folder-btn:hover {
      background: #14223680;
    }
    .tasks-new-form {
      padding: 16px;
      overflow-y: auto;
    }

    .task-panel {
      display: flex;
      flex-direction: column;
      width: min(100%, 1100px);
      min-width: min(320px, 100%);
      max-width: 100%;
      flex: 1;
      min-height: 0;
      text-align: left;
      border: 1px solid #ffffff22;
      border-radius: 16px 16px 0 0;
      background:
        radial-gradient(120% 100% at 100% 0%, #7dc5ff12, transparent 55%),
        linear-gradient(180deg, #0e1a2a88 0%, #0a1220a8 100%);
      backdrop-filter: blur(6px);
      box-shadow: 0 14px 34px #00000045;
      overflow: hidden;
    }
    .task-panel-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid #ffffff12;
      flex-wrap: wrap;
    }
    .task-panel-back {
      border: 1px solid #ffffff2a;
      background: #0c1624a6;
      color: #cfe3ff;
      border-radius: 8px;
      width: 36px;
      height: 36px;
      font-size: 16px;
      cursor: pointer;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .task-panel-back:hover { background: #14223680; }
    .task-panel-headline-wrap {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .task-panel-id {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6a7e9b;
    }
    .task-panel-headline {
      font-family: "Fraunces", serif;
      font-size: 18px;
      color: #f4f8ff;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .task-panel-status-wrap {
      flex: 0 0 auto;
    }
    .task-panel-status {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #0c1624a6;
      border: 1px solid #ffffff22;
      color: #cfe3ff;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .task-panel-status.is-open { color: #9be7ff; border-color: #9be7ff55; }
    .task-panel-status.is-waiting { color: #f0c674; border-color: #f0c67455; }
    .task-panel-status.is-done { color: #93e0a8; border-color: #93e0a855; }
    .task-panel-status.is-failed { color: #ff9a9a; border-color: #ff9a9a55; }
    .task-panel-body {
      padding: 14px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      scrollbar-width: thin;
      scrollbar-color: #3a5a80 transparent;
    }
    .task-panel-loading {
      color: #6a7e9b;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      text-align: center;
      padding: 40px;
    }
    .task-panel-section-label {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6a7e9b;
      margin-bottom: 4px;
    }
    .task-tree {
      background: #07101da6;
      border: 1px solid #ffffff14;
      border-radius: 10px;
      padding: 8px 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-family: "JetBrains Mono", monospace;
    }
    .task-tree-node {
      display: grid;
      grid-template-columns: auto auto auto auto 1fr;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 120ms;
      font-size: 11px;
      color: #cfe3ff;
    }
    .task-tree-node:hover {
      background: #14223666;
    }
    .task-tree-node.is-current {
      background: #1a2a44a8;
      border: 1px solid #ffd07a99;
      cursor: default;
      padding: 4px 7px;
    }
    .task-tree-node.is-current:hover {
      background: #1a2a44a8;
    }
    .task-tree-indent {
      display: inline-block;
      flex-shrink: 0;
    }
    .task-tree-marker {
      color: #6a7e9b;
      font-size: 11px;
      width: 14px;
      display: inline-block;
      text-align: center;
    }
    .task-tree-node.is-current .task-tree-marker {
      color: #ffd07a;
    }
    .task-tree-id {
      color: #d6e6ff;
      font-size: 10px;
      white-space: nowrap;
    }
    .task-tree-agent {
      color: #ffd07a;
      font-size: 10px;
    }
    .task-tree-status {
      font-size: 9px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #9be7ff;
    }
    .task-tree-status.is-waiting { color: #f0c674; }
    .task-tree-status.is-done { color: #93e0a8; }
    .task-tree-status.is-failed { color: #ff9a9a; }
    .task-tree-headline {
      color: #b8cae3;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @media (max-width: 640px) {
      .task-tree-node {
        grid-template-columns: auto auto auto 1fr;
        gap: 6px;
      }
      .task-tree-agent { display: none; }
    }
    .task-panel-card {
      display: grid;
      gap: 8px;
      padding: 0;
      background: transparent;
      border: none;
    }
    .task-panel-card.is-current {
      background: transparent;
    }
    .task-panel-card-head {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: baseline;
    }
    .task-panel-card-id {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #d6e6ff;
    }
    .task-panel-card-agent {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #ffd07a;
    }
    .task-panel-card-status {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #9be7ff;
    }
    .task-panel-card-status.is-waiting { color: #f0c674; }
    .task-panel-card-status.is-done { color: #93e0a8; }
    .task-panel-card-status.is-failed { color: #ff9a9a; }
    .task-panel-card-headline {
      font-family: "Fraunces", serif;
      font-size: 14px;
      color: #f4f8ff;
      line-height: 1.3;
    }
    .task-panel-card-summary {
      font-size: 12px;
      color: #b8cae3;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .task-panel-card-meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      color: #6a7e9b;
    }
    .task-panel-card-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .task-panel-action {
      border: 1px solid #ffffff2a;
      background: #0c1624a6;
      color: #cfe3ff;
      border-radius: 8px;
      padding: 6px 12px;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      transition: background 120ms;
    }
    .task-panel-action:hover {
      background: #14223680;
    }
    .task-panel-action.is-primary {
      background: #2a4972;
      border-color: #ffd07a99;
      color: #ffe7b8;
    }
    .task-panel-action.is-primary:hover {
      background: #355a8a;
    }
    /* Danger variant — Abort (kills a live worker). Red-tinted so the
       irreversible action reads distinctly from Close. */
    .task-panel-action-danger {
      border-color: #ff6b6b66;
      color: #ffb3b3;
    }
    .task-panel-action-danger:hover {
      background: #3a1620;
    }
    .task-panel-action.is-primary.task-panel-action-danger {
      background: #6b2330;
      border-color: #ff6b6baa;
      color: #ffd9d9;
    }
    .task-panel-action.is-primary.task-panel-action-danger:hover {
      background: #842b3b;
    }
    .task-panel-abort-warn {
      color: #ff9d9d;
    }
    .task-panel-abort-warn strong {
      color: #ffd9d9;
    }
    .task-panel-meta {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      color: #8a96a8;
      letter-spacing: 0.04em;
      padding: 2px 0 6px;
    }
    .task-panel-meta-arrow {
      color: #ffd07a;
      margin: 0 2px;
    }
    .task-panel-meta-sep {
      color: #4a5668;
      margin: 0 4px;
    }
    /* Project chip in the task panel meta line. Click to swap to a
       dropdown of known projects. Distinct from other meta entries —
       border + folder icon advertise the affordance. */
    .task-panel-project-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 8px;
      border: 1px solid #ffffff22;
      border-radius: 999px;
      background: #0c1624a6;
      cursor: pointer;
      color: #cfe3ff;
      transition: border-color 120ms, background 120ms;
    }
    .task-panel-project-chip:hover {
      border-color: #ffd07a99;
      background: #14223680;
    }
    .task-panel-project-chip.is-unassigned {
      color: #6a7e9b;
      font-style: italic;
    }
    .task-panel-project-select {
      background: transparent;
      color: #cfe3ff;
      border: none;
      font-family: inherit;
      font-size: inherit;
      cursor: pointer;
    }
    .task-panel-project-select:focus {
      outline: 2px solid #ffd07a99;
      outline-offset: 2px;
    }
    .task-panel-unblock {
      display: grid;
      gap: 8px;
    }
    .task-panel-rework {
      display: grid;
      gap: 8px;
      margin-top: 8px;
      padding: 10px 12px;
      border: 1px solid #ffd07a55;
      border-radius: 8px;
      background: rgba(240, 198, 116, 0.06);
    }
    .task-panel-rework-warn {
      font-size: 12px;
      color: #f0c674;
      line-height: 1.45;
    }
    .task-panel-rework-warn strong {
      color: #ffe7b8;
    }
    /* WAL-63 Phase 1: closed-task banner — sits between Result and the
       action row. Surfaces the closed.status + by + reason at a glance so
       the Reopen affordance reads as the natural escape hatch. */
    .task-panel-closed-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 8px 0;
      padding: 8px 12px;
      border: 1px solid #ffffff1f;
      border-left: 3px solid #8aa0bd;
      border-radius: 8px;
      background: #0c1624a6;
      color: #b8cae3;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
    }
    .task-panel-closed-pill {
      padding: 2px 8px;
      border-radius: 999px;
      background: #2c3a55;
      color: #cfe3ff;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .task-panel-closed-meta {
      color: #8a96a8;
    }
    .task-panel-closed-reason {
      flex-basis: 100%;
      color: #cfe3ff;
      font-size: 12px;
      font-family: inherit;
    }
    /* WAL-63 Phase 1: close form — borrows the rework warning chrome (same
       collapse/expand toggle pattern as Next) but reuses unblock-input
       styling for the textarea + actions row. */
    .task-panel-close-form {
      /* inherits .task-panel-rework layout (set in markup) — only overrides
         that diverge from the rework variant live here. */
    }
    .task-panel-close-cascade {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #f0c674;
      cursor: pointer;
    }
    .task-panel-close-cascade input[type="checkbox"] {
      accent-color: #f0c674;
    }
    .task-panel-close-cancel {
      border: 1px solid #ffffff2a;
      background: transparent;
      color: #8aa0bd;
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
    }
    .task-panel-close-cancel:hover {
      background: #ffffff0d;
      color: #cfe3ff;
    }
    .task-panel-unblock-hint {
      font-size: 12px;
      color: #b8cae3;
      line-height: 1.45;
    }
    .task-panel-unblock-input {
      width: 100%;
      box-sizing: border-box;
      background: #0a1220;
      border: 1px solid #ffffff2a;
      border-radius: 6px;
      padding: 8px 10px;
      color: #f4f8ff;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      line-height: 1.45;
      resize: vertical;
    }
    .task-panel-unblock-input:focus {
      outline: none;
      border-color: #ffd07a99;
    }
    .task-panel-unblock-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    /* Editable child-headline field at the top of the Next form. Pre-filled
       with the parent's headline + a suffix; user can override before
       submitting if the next step is materially different. */
    .task-panel-next-headline-input {
      display: block;
      width: 100%;
      background: #0c1624a6;
      color: #e4eefb;
      border: 1px solid #ffffff2a;
      border-radius: 6px;
      padding: 6px 10px;
      margin-bottom: 8px;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 12px;
      box-sizing: border-box;
    }
    .task-panel-next-headline-input:focus {
      outline: 2px solid #ffd07a99;
      outline-offset: 1px;
      border-color: #ffd07a99;
    }
    /* Re-route picker inside the Next form. Compact arrow + native select
       so handing the child off to a different agent stays a one-click
       affordance. Defaults to the parent's agent — picking another agent
       lights up the submit button with the new destination. */
    .task-panel-next-target {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #b8cae3;
    }
    .task-panel-next-target-label {
      color: #6a7e9b;
    }
    .task-panel-next-target-select {
      background: #0c1624a6;
      color: #cfe3ff;
      border: 1px solid #ffffff2a;
      border-radius: 6px;
      padding: 3px 6px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      cursor: pointer;
    }
    .task-panel-next-target-select:hover { border-color: #ffd07a99; }
    .task-panel-next-target-select:focus { outline: 2px solid #ffd07a99; outline-offset: 1px; }
    .task-panel-unblock-submit {
      border: 1px solid #ffd07a99;
      background: #2a4972;
      color: #ffe7b8;
      border-radius: 8px;
      padding: 6px 14px;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      transition: background 120ms;
    }
    .task-panel-unblock-submit:hover { background: #355a8a; }
    .task-panel-unblock-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .task-panel-unblock-status {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #9bb1d0;
    }
    .task-panel-unblock-status.is-error { color: #ff9a9a; }
    .task-panel-unblock-status.is-ok { color: #93e0a8; }
    .task-panel-revisit { /* shares .task-panel-unblock styling */ }
    .multi-agent-new-parent {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      margin: 0 0 10px 0;
      background: #173255;
      border: 1px solid #2a4f80;
      border-radius: 6px;
      font-size: 12px;
      color: #cfe1ff;
    }
    .multi-agent-new-parent strong {
      font-family: "JetBrains Mono", monospace;
      color: #fff;
    }
    .multi-agent-new-parent-clear {
      margin-left: auto;
      background: transparent;
      border: 0;
      color: #cfe1ff;
      cursor: pointer;
      font-size: 14px;
      padding: 0 4px;
    }
    .multi-agent-new-parent-clear:hover { color: #fff; }
    .task-panel-section {
      border: 1px solid #ffffff10;
      border-radius: 8px;
      background: #07101da6;
      padding: 0;
      overflow: hidden;
    }
    .task-panel-section[open] {
      background: #0a1424b8;
      border-color: #ffffff1e;
    }
    .task-panel-section-summary {
      cursor: pointer;
      padding: 7px 10px;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #a8b8cf;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 6px;
      user-select: none;
    }
    .task-panel-section-summary::-webkit-details-marker { display: none; }
    .task-panel-section-summary::before {
      content: "▸";
      font-size: 10px;
      color: #6a7e9b;
      transition: transform 120ms;
      display: inline-block;
    }
    .task-panel-section[open] > .task-panel-section-summary::before {
      transform: rotate(90deg);
    }
    .task-panel-section-summary:hover {
      color: #d6e6ff;
      background: #14223644;
    }
    .task-panel-section-body {
      padding: 4px 12px 10px;
    }
    .task-panel-context-list {
      display: grid;
      gap: 4px;
      margin-top: 4px;
    }
    .task-panel-context-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
    }
    .task-panel-context-item button {
      border: none;
      background: none;
      color: #9be7ff;
      cursor: pointer;
      padding: 0;
      font-family: inherit;
      font-size: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .task-panel-context-item button:hover {
      color: #cfe3ff;
    }
    .task-panel-report-doc {
      margin: 0 0 16px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.18);
      overflow: hidden;
    }
    .task-panel-report-doc-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .task-panel-report-doc-title {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #cfe3ff;
      letter-spacing: 0.04em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .task-panel-report-doc .task-panel-report {
      max-height: none;
      border: none;
      border-radius: 0;
      background: transparent;
      padding: 12px 14px;
    }
    .task-panel-report-pane {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .task-panel-doc-pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      padding: 0 0 4px;
    }
    .task-panel-doc-pill {
      border: 1px solid #ffffff2a;
      background: #0c1624a6;
      color: #b8cae3;
      border-radius: 999px;
      padding: 4px 12px;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      transition: background 120ms, color 120ms, border-color 120ms;
    }
    .task-panel-doc-pill:hover {
      background: #14223680;
      color: #cfe3ff;
    }
    .task-panel-doc-pill.is-active {
      background: #2a4972;
      border-color: #ffd07a99;
      color: #ffe7b8;
    }
    .task-panel-report {
      max-height: 480px;
      overflow: auto;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 10px 14px;
      background: rgba(0, 0, 0, 0.18);
    }
    .task-panel-report-md {
      font-size: 13px;
      line-height: 1.5;
    }
    .task-panel-report-md p,
    .task-panel-report-md ul,
    .task-panel-report-md ol,
    .task-panel-report-md pre {
      margin: 0 0 8px;
    }
    .task-panel-report-md h1,
    .task-panel-report-md h2,
    .task-panel-report-md h3 {
      margin: 14px 0 6px;
    }
    .task-panel-report-md pre {
      background: rgba(0, 0, 0, 0.3);
      padding: 6px 8px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
    }
    .task-panel-report-raw {
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      white-space: pre-wrap;
      margin: 0;
    }
    .task-panel-report-loading {
      font-size: 12px;
      color: #8a96a8;
      font-style: italic;
    }
    .task-panel-report-loading.is-error { color: #ff9a9a; }
    @media (max-width: 640px) {
      .task-panel-toolbar {
        padding: 8px 10px;
        gap: 8px;
      }
      .task-panel-headline {
        font-size: 16px;
      }
      .task-panel-status {
        font-size: 10px;
        padding: 3px 8px;
      }
      .task-panel-body {
        padding: 10px;
      }
      .task-panel-card {
        padding: 0;
      }
    }
    .files-toolbar {
      display: flex;
      flex-direction: column;
      padding: 8px 12px;
      border-bottom: 1px solid #ffffff12;
      gap: 6px;
    }
    .files-toolbar-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .files-toolbar-row-branch {
      justify-content: flex-end;
    }
    .files-toolbar-row-crumb {
      justify-content: flex-start;
    }
    .files-breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #a8b4c5;
      overflow-x: auto;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }
    .files-breadcrumb button {
      border: none;
      background: transparent;
      color: #9be7ff;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.12s;
    }
    .files-breadcrumb button:hover {
      background: #ffffff10;
    }
    .files-breadcrumb span {
      color: #5a6a7e;
    }
    .files-branch-select {
      background: #0d1117;
      color: #e5eaf3;
      border: 1px solid #ffffff1a;
      border-radius: 6px;
      padding: 3px 6px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      max-width: 140px;
      min-width: 90px;
    }
    .files-branch-select:focus {
      outline: 1px solid var(--accent, #7bd88f);
      border-color: transparent;
    }
    .files-nav-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .files-nav-btn {
      background: #0d1117;
      color: #c8d4e5;
      border: 1px solid #ffffff1a;
      border-radius: 6px;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: "JetBrains Mono", monospace;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
      padding: 0;
    }
    .files-nav-btn:hover:not(:disabled) {
      background: #ffffff0d;
      color: #9be7ff;
    }
    .files-nav-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .files-code {
      margin: 0;
      padding: 0;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      line-height: 1.55;
      color: #d7e3f5;
      white-space: pre;
      tab-size: 2;
    }

    /* === YAML rendered view (file viewer + task view) ==================== */
    .files-yaml { font-size: 13px; line-height: 1.5; color: #d7e3f5; }
    .yaml-doc { display: flex; flex-direction: column; gap: 6px; }
    .yaml-object { display: flex; flex-direction: column; gap: 4px; }
    .yaml-row { padding: 2px 0; }
    .yaml-row-simple { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
    .yaml-row-complex { display: flex; flex-direction: column; gap: 4px; }
    .yaml-key-line { display: flex; align-items: baseline; }
    .yaml-key { color: #9be7ff; font-weight: 500; }
    .yaml-colon { color: #6a7f94; margin-right: 0; }
    .yaml-str { color: #d7e3f5; }
    .yaml-num { color: #f4b678; }
    .yaml-bool { color: #c792ea; }
    .yaml-null { color: #c792ea; font-style: italic; }
    .yaml-empty { color: #6a7f94; font-style: italic; }
    .yaml-error {
      background: #3a1a1a;
      border: 1px solid #6e2828;
      color: #ffb3b3;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .yaml-raw {
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      color: #6a7f94;
      white-space: pre-wrap;
    }
    .yaml-block {
      font-family: "JetBrains Mono", monospace;
      font-size: 12.5px;
      line-height: 1.55;
      color: #c8d6e8;
      background: #0f1620;
      border-left: 2px solid #2a3950;
      padding: 8px 12px;
      margin: 4px 0 4px 14px;
      white-space: pre-wrap;
      word-break: break-word;
      border-radius: 0 4px 4px 0;
    }
    .yaml-array {
      list-style: none;
      margin: 4px 0 4px 14px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .yaml-item {
      position: relative;
      padding-left: 14px;
    }
    .yaml-item::before {
      content: "·";
      position: absolute;
      left: 0;
      color: #6a7f94;
    }
    .yaml-value-block {
      margin-left: 14px;
    }
    /* Status pill (applied by yaml-entry when key === "status") */
    .yaml-status { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; text-transform: lowercase; }
    .yaml-status-done { background: #1f3a26; color: #a7e4a1; }
    .yaml-status-failed { background: #3a1a1a; color: #ffb3b3; }
    .yaml-status-waiting { background: #3a2f17; color: #f4c97e; }
    .yaml-status-claimed { background: #1f2a3a; color: #9be7ff; }
    .yaml-status-open { background: #2a2a3a; color: #c8d6e8; }

    .files-code code { font-family: inherit; font-size: inherit; }
    .syn-key { color: #9be7ff; }
    .syn-str { color: #a7e4a1; }
    .syn-num { color: #f4b678; }
    .syn-bool { color: #c792ea; }
    .syn-null { color: #c792ea; }
    .syn-kw { color: #c792ea; font-weight: 500; }
    .syn-builtin { color: #9be7ff; }
    .syn-fn { color: #f7c173; }
    .syn-comment { color: #6a7f94; font-style: italic; }
    .syn-punct { color: #8ca0b8; }
    .syn-decor { color: #f4a6c8; }
    .syn-tag { color: #7fc2ff; }
    .syn-attr { color: #c8a3ff; }
    .syn-interp { color: #f4b678; }
    .files-picker-toggle {
      display: none;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 8px 14px;
      border: none;
      border-bottom: 1px solid #ffffff12;
      background: #0b121c;
      color: #c8d4e5;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.03em;
      cursor: pointer;
    }
    .files-picker-toggle:hover {
      background: #111a26;
    }
    .files-picker-toggle-caret {
      font-size: 12px;
      color: #9be7ff;
      transition: transform 0.2s ease;
    }
    .files-picker-toggle[aria-expanded="false"] .files-picker-toggle-caret {
      transform: rotate(-90deg);
    }
    .files-split {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .files-sidebar {
      width: 280px;
      min-width: 200px;
      border-right: 1px solid #ffffff12;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #3a5a80 transparent;
    }
    .files-list {
      padding: 4px;
    }
    .files-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 10px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #c8d4e5;
      text-align: left;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      transition: background 0.12s;
      white-space: nowrap;
      overflow: hidden;
    }
    .files-item:hover {
      background: #ffffff0d;
    }
    .files-item-active {
      background: #ffffff08;
      border-left: 2px solid #9be7ff;
    }
    .files-item-icon {
      flex-shrink: 0;
      width: 16px;
      text-align: center;
      font-size: 12px;
    }
    .files-item-name {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .files-item-size {
      margin-left: auto;
      color: #5a6a7e;
      font-size: 10px;
      flex-shrink: 0;
    }
    .files-content {
      flex: 1;
      min-width: 0;
      overflow: auto;
      padding: 16px 20px;
      scrollbar-width: thin;
      scrollbar-color: #3a5a80 transparent;
    }
    .files-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      color: #5a7a9a;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    /* Files-tab image viewer */
    .files-image-view {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
    }
    .files-image-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #8a96a8;
      letter-spacing: 0.03em;
    }
    .files-image-toggle {
      border: 1px solid #ffffff2a;
      background: #0c1624a6;
      color: #cfe3ff;
      border-radius: 6px;
      padding: 3px 10px;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
    }
    .files-image-toggle:hover { background: #14223680; }
    .files-image-canvas {
      /* Checkerboard so transparent PNGs (sprites/icons) read clearly. */
      background-image:
        linear-gradient(45deg, #1c2735 25%, transparent 25%),
        linear-gradient(-45deg, #1c2735 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #1c2735 75%),
        linear-gradient(-45deg, transparent 75%, #1c2735 75%);
      background-size: 16px 16px;
      background-position: 0 0, 0 8px, 8px -8px, -8px 0;
      border: 1px solid #ffffff1a;
      border-radius: 4px;
      padding: 12px;
      align-self: flex-start;
      max-width: 100%;
      overflow: auto;
    }
    .files-image {
      display: block;
      max-width: 100%;
      height: auto;
    }
    .files-image.is-pixelated {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
    .files-loading {
      padding: 12px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #5a7a9a;
    }
    .files-md {
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #e4eefb;
    }
    .files-md h1, .files-md h2, .files-md h3,
    .files-md h4, .files-md h5, .files-md h6 {
      color: #fff;
      font-family: "Fraunces", serif;
      margin: 20px 0 8px;
      line-height: 1.3;
    }
    .files-md h1 { font-size: 1.6em; border-bottom: 1px solid #ffffff18; padding-bottom: 8px; }
    .files-md h2 { font-size: 1.35em; border-bottom: 1px solid #ffffff12; padding-bottom: 6px; }
    .files-md h3 { font-size: 1.15em; }
    .files-md p { margin: 8px 0; }
    .files-md ul, .files-md ol { margin: 8px 0; padding-left: 22px; }
    .files-md li { margin: 3px 0; }
    .files-md code {
      background: #ffffff15;
      padding: 1px 5px;
      border-radius: 4px;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
    }
    .files-md pre {
      background: #00000040;
      padding: 12px 14px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 10px 0;
      border: 1px solid #ffffff10;
    }
    .files-md pre code {
      background: none;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
    }
    .files-md strong { color: #fff; }
    .files-md em { color: #c8daf0; }
    .files-md blockquote {
      margin: 10px 0;
      padding: 8px 14px;
      border-left: 3px solid #9be7ff44;
      background: #ffffff06;
      border-radius: 0 6px 6px 0;
      color: #c8daf0;
    }
    .files-md hr {
      border: none;
      border-top: 1px solid #ffffff18;
      margin: 16px 0;
    }
    .files-md a {
      color: #9be7ff;
      text-decoration: none;
    }
    .files-md a:hover {
      text-decoration: underline;
    }
    .files-md table {
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 13px;
      width: 100%;
    }
    .files-md th, .files-md td {
      border: 1px solid #ffffff1a;
      padding: 6px 10px;
      text-align: left;
    }
    .files-md th {
      background: #ffffff0a;
      color: #fff;
      font-weight: 500;
    }
    .files-md img {
      max-width: 100%;
      border-radius: 6px;
    }
    .files-md input[type="checkbox"] {
      margin-right: 6px;
    }
    .files-raw {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      line-height: 1.5;
      color: #d7e3f5;
    }

    /* Kelly 2026-05-25: collapse the picker + viewer split into the
       mobile-style picker-toggle flow when the PANEL itself is narrower
       than the "lg" breakpoint (1200px). Uses container queries instead
       of @media so the layout responds to the actual rendered width of
       the .tasks-panel / .files-panel container — works correctly in
       browser split-screen / sidebar / iframe contexts where the viewport
       is wide but the panel isn't. Fine-tuning rules (smaller fonts, dock
       tweaks, etc.) stay in the 640px @media block below — those are
       device-class adjustments, not container-size ones. */
    @container tasks-panel (max-width: 1199px) {
      .tasks-split {
        flex-direction: column;
      }
      .tasks-sidebar {
        width: 100%;
        min-width: 100%;
        flex: 1;
        min-height: 0;
        max-height: none;
        border-right: none;
        border-bottom: 1px solid #ffffff12;
      }
      .tasks-picker-toggle {
        display: inline-flex;
      }
      .tasks-sidebar.tasks-sidebar-collapsed {
        display: none;
      }
      .tasks-sidebar:not(.tasks-sidebar-collapsed) ~ .tasks-content {
        display: none;
      }
      .tasks-panel.tasks-list-hidden .tasks-filter-chips {
        display: none;
      }
      .tasks-content {
        flex: 1;
        min-height: 0;
      }
    }
    @container files-panel (max-width: 1199px) {
      .files-split {
        flex-direction: column;
      }
      .files-sidebar {
        width: 100%;
        min-width: 100%;
        flex: 1;
        min-height: 0;
        max-height: none;
        border-right: none;
        border-bottom: 1px solid #ffffff12;
      }
      .files-picker-toggle {
        display: flex;
      }
      .files-sidebar.files-sidebar-collapsed {
        display: none;
      }
      .files-sidebar:not(.files-sidebar-collapsed) ~ .files-content {
        display: none;
      }
      .files-content {
        flex: 1;
        min-height: 0;
      }
    }

    @media (max-width: 640px) {
      .stage {
        padding: 38px 8px 80px;
      }
      body.hide-header .stage { padding-top: 8px; }
      .tab-nav {
        margin-bottom: 8px;
      }
      .repo-cta {
        font-size: 10px;
        height: 30px;
        gap: 7px;
      }
      .chat-panel,
      .files-panel,
      .tasks-panel {
        min-width: 100%;
        border-radius: 12px 12px 0 0;
      }
      .tasks-viewer-head {
        padding: 6px 10px;
        gap: 8px;
      }
      .tasks-viewer-headline-wrap {
        flex-direction: column;
        align-items: flex-start;
        gap: 1px;
      }
      .tasks-viewer-headline {
        font-size: 14px;
      }
      .tasks-viewer-id {
        font-size: 9px;
      }
      .files-breadcrumb {
        font-size: 10px;
      }
      .files-branch-select {
        max-width: 160px;
        min-width: 110px;
      }
      .quick-job {
        margin-top: 14px;
        padding: 11px;
      }
      .quick-job-head-row {
        flex-direction: column;
      }
      .quick-job-grid,
      .quick-job-actions {
        grid-template-columns: 1fr;
      }
      .dock-shell {
        bottom: 8px;
        width: calc(100% - 12px);
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
      }
      .side-bubble {
        display: none;
      }
      .dock {
        border-radius: 14px;
        padding: 4px 6px;
        flex-wrap: nowrap;
        gap: 0;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .pill {
        font-size: 10px;
        min-height: 38px;
        flex: 0 0 auto;
        padding: 5px 8px;
      }
      .pill-label {
        font-size: 9px;
        gap: 3px;
      }
      .pill-icon {
        font-size: 10px;
        width: 12px;
        min-width: 12px;
      }
      .pill-value {
        font-size: 10px;
      }
    }`;
