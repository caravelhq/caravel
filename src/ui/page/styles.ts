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
    }
    body.hide-header .repo-cta { display: none; }
    body.hide-header .stage { padding-top: 12px; }

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
      background: #2b4870;
      border-color: #4a7abd;
      color: #eef4ff;
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
    .files-panel {
      display: flex;
      flex-direction: column;
      width: min(100%, 1100px);
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
      .files-panel {
        min-width: 100%;
        border-radius: 12px 12px 0 0;
      }
      .files-split {
        flex-direction: column;
      }
      .files-sidebar {
        width: 100%;
        min-width: 100%;
        max-height: 75vh;
        border-right: none;
        border-bottom: 1px solid #ffffff12;
      }
      .files-picker-toggle {
        display: flex;
      }
      .files-sidebar.files-sidebar-collapsed {
        display: none;
      }
      .files-content {
        min-height: 55vh;
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
