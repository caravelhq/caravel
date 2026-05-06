import { pageStyles } from "./styles";

function decodeUnicodeEscapes(text: string): string {
  const decodedCodePoints = text.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex: string) => {
    const codePoint = Number.parseInt(hex, 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
  });
  return decodedCodePoints.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCharCode(code) : _;
  });
}

export function htmlPage(): string {
  const html = String.raw`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0d1117" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="ClaudeClaw" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  <title>ClaudeClaw</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
${pageStyles}
  </style>
</head>
<body>
  <div class="grain" aria-hidden="true"></div>
  <a
    class="repo-cta"
    href="https://github.com/moazbuilds/claudeclaw"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Star claudeclaw on GitHub"
  >
    <span class="repo-text">Like ClaudeClaw? Star it on GitHub</span>
    <span class="repo-star">★</span>
  </a>
  <!-- settings button moved into tab-nav -->
  <aside class="settings-modal" id="settings-modal" aria-live="polite">
    <div class="settings-head">
      <span>Settings</span>
      <button class="settings-close" id="settings-close" type="button" aria-label="Close settings">×</button>
    </div>
    <div class="settings-stack">
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">💓 Heartbeat</div>
          <div class="settings-meta" id="hb-info">syncing...</div>
        </div>
        <div class="setting-actions">
          <button class="hb-config" id="hb-config" type="button">Configure</button>
          <button class="hb-toggle" id="hb-toggle" type="button">Loading...</button>
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🕒 Clock</div>
          <div class="settings-meta" id="clock-info">24-hour format</div>
        </div>
        <button class="hb-toggle" id="clock-toggle" type="button">24h</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🔗 GitHub Banner</div>
          <div class="settings-meta">Star on GitHub header bar</div>
        </div>
        <button class="hb-toggle" id="header-toggle" type="button">On</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🐞 Debug</div>
          <div class="settings-meta">Show chat thread/session ids</div>
        </div>
        <button class="hb-toggle off" id="debug-toggle" type="button">Off</button>
      </div>
      <div class="setting-item" id="split-toggle-row">
        <div class="setting-main">
          <div class="settings-label">⫴ Split view</div>
          <div class="settings-meta">Side-by-side panes (≥1200px)</div>
        </div>
        <button class="hb-toggle off" id="split-toggle" type="button">Off</button>
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🧾 Advanced</div>
          <div class="settings-meta">Technical runtime and JSON files</div>
        </div>
        <button class="hb-toggle on" id="info-open" type="button">Info</button>
      </div>
    </div>
  </aside>
  <section class="info-modal" id="hb-modal" aria-live="polite" aria-hidden="true">
    <article class="hb-card">
      <div class="info-head">
        <span>Heartbeat Configuration</span>
        <button class="settings-close" id="hb-modal-close" type="button" aria-label="Close heartbeat configuration">×</button>
      </div>
      <form class="hb-form" id="hb-form">
        <label class="hb-field" for="hb-interval-input">
          <span class="hb-label">Interval (minutes)</span>
          <input class="hb-input" id="hb-interval-input" type="number" min="1" max="1440" step="1" required />
        </label>
        <label class="hb-field" for="hb-prompt-input">
          <span class="hb-label">Custom prompt</span>
          <textarea class="hb-textarea" id="hb-prompt-input" placeholder="What should heartbeat run?" required></textarea>
        </label>
        <div class="hb-actions">
          <div class="hb-status" id="hb-modal-status"></div>
          <div class="hb-buttons">
            <button class="hb-btn ghost" id="hb-cancel-btn" type="button">Cancel</button>
            <button class="hb-btn solid" id="hb-save-btn" type="submit">Save</button>
          </div>
        </div>
      </form>
    </article>
  </section>
  <section class="info-modal" id="info-modal" aria-live="polite" aria-hidden="true">
    <article class="info-card">
      <div class="info-head">
        <span>Advanced Technical Info</span>
        <button class="settings-close" id="info-close" type="button" aria-label="Close technical info">×</button>
      </div>
      <div class="info-body" id="info-body">
        <div class="info-section">
          <div class="info-title">Loading</div>
          <pre class="info-json">Loading technical data...</pre>
        </div>
      </div>
    </article>
  </section>
  <main class="stage">
    <nav class="tab-nav" role="tablist" aria-label="Main navigation">
      <button class="tab-btn tab-btn-active" id="tab-dashboard" type="button" role="tab" aria-selected="true" aria-controls="dashboard-panel">Dashboard</button>
      <button class="tab-btn" id="tab-chat" type="button" role="tab" aria-selected="false" aria-controls="chat-panel">Chat</button>
      <button class="tab-btn" id="tab-files" type="button" role="tab" aria-selected="false" aria-controls="files-panel">Files</button>
      <button class="tab-btn tab-btn-split" id="split-nav-toggle" type="button" title="Toggle split view" aria-label="Toggle split view" aria-pressed="false">&#x2AFD;</button>
      <button class="tab-btn tab-btn-settings" id="settings-btn" type="button" title="Settings">&#x2699;</button>
    </nav>
    <div id="dashboard-panel">
    <section class="hero">
      <div class="logo-art" role="img" aria-label="Lobster ASCII art logo">
        <div class="logo-top"><span>🦞</span><span>🦞</span></div>
        <pre class="logo-body">   ▐▛███▜▌
  ▝▜█████▛▘
    ▘▘ ▝▝</pre>
      </div>
      <div class="typewriter" id="typewriter" aria-live="polite"></div>
      <div class="time" id="clock">--:--:--</div>
      <div class="date" id="date">Loading date...</div>
      <div class="message" id="message">Welcome back.</div>
      <section class="quick-job" id="quick-jobs-view">
        <div class="quick-job-head quick-job-head-row">
          <div>
            <div class="quick-job-title">Jobs List</div>
            <div class="quick-job-sub">Scheduled runs loaded from runtime jobs</div>
            <div class="quick-jobs-next" id="quick-jobs-next">Next job in --</div>
          </div>
          <button class="quick-open-create" id="quick-open-create" type="button">Create Job</button>
        </div>
        <div class="quick-jobs-list quick-jobs-list-main" id="quick-jobs-list">
          <div class="quick-jobs-empty">Loading jobs...</div>
        </div>
        <div class="quick-status" id="quick-jobs-status"></div>
      </section>
      <form class="quick-job quick-view-hidden" id="quick-job-form">
        <div class="quick-job-head">
          <div class="quick-job-title">Add Scheduled Job</div>
          <div class="quick-job-sub">Recurring cron with prompt payload</div>
        </div>
        <div class="quick-job-grid">
          <div class="quick-field quick-time-wrap">
            <div class="quick-label">Delay From Now (Minutes)</div>
            <div class="quick-input-wrap">
            <input class="quick-input" id="quick-job-offset" type="number" min="1" max="1440" step="1" placeholder="10" required />
              <label class="quick-check quick-check-inline" for="quick-job-recurring">
                <input id="quick-job-recurring" type="checkbox" checked />
                <span>Recurring</span>
              </label>
            </div>
            <div class="quick-time-buttons">
              <button class="quick-add" type="button" data-add-minutes="15">+15m</button>
              <button class="quick-add" type="button" data-add-minutes="30">+30m</button>
              <button class="quick-add" type="button" data-add-minutes="60">+1h</button>
              <button class="quick-add" type="button" data-add-minutes="180">+3h</button>
            </div>
            <div class="quick-preview" id="quick-job-preview">Runs in -- min</div>
          </div>
          <div class="quick-field">
            <div class="quick-label">Prompt</div>
            <textarea class="quick-prompt" id="quick-job-prompt" placeholder="Remind me to drink water." required></textarea>
            <div class="quick-prompt-meta">
              <span id="quick-job-count">0 chars</span>
              <span>Saved at computed clock time</span>
            </div>
          </div>
        </div>
        <div class="quick-job-actions">
          <button class="quick-submit" id="quick-job-submit" type="submit">Add to Jobs List</button>
          <div class="quick-status" id="quick-job-status"></div>
        </div>
        <div class="quick-form-foot">
          <button class="quick-back-jobs" id="quick-back-jobs" type="button">Back to Jobs List</button>
        </div>
      </form>
      <section class="multi-agent-panel" id="multi-agent-panel" hidden>
        <div class="multi-agent-head">
          <div>
            <div class="multi-agent-title">Multi-Agent Tasks</div>
            <div class="multi-agent-sub" id="multi-agent-sub">Loading...</div>
          </div>
          <div class="multi-agent-head-actions">
            <button class="multi-agent-action" id="multi-agent-new-btn" type="button" title="Create a new task">+ New</button>
            <button class="multi-agent-action" id="multi-agent-list-toggle" type="button" title="Show recent tasks">Tasks</button>
            <button class="multi-agent-refresh" id="multi-agent-refresh" type="button" title="Refresh">↻</button>
          </div>
        </div>
        <div class="multi-agent-grid" id="multi-agent-grid"></div>
        <div class="multi-agent-extras" id="multi-agent-extras"></div>
        <div class="multi-agent-tasks" id="multi-agent-tasks" hidden>
          <div class="multi-agent-tasks-head">
            <span>Recent tasks</span>
            <span class="multi-agent-tasks-meta" id="multi-agent-tasks-meta"></span>
          </div>
          <div class="multi-agent-tasks-list" id="multi-agent-tasks-list"></div>
        </div>
        <form class="multi-agent-new" id="multi-agent-new" hidden>
          <div class="multi-agent-new-head">Create task</div>
          <div class="multi-agent-new-parent" id="multi-agent-new-parent-chip" hidden>
            <span>↳ child of <strong id="multi-agent-new-parent-id"></strong></span>
            <button type="button" class="multi-agent-new-parent-clear" id="multi-agent-new-parent-clear" title="Clear parent">✕</button>
          </div>
          <label class="multi-agent-new-block">
            <span>Headline <em class="multi-agent-new-hint">(required, ≤10 words — appears in lists & notifications)</em></span>
            <input id="multi-agent-new-headline" type="text" maxlength="120" placeholder="BLE plugin survey" required />
            <span class="multi-agent-new-counter" id="multi-agent-new-headline-count">0 / 10 words</span>
          </label>
          <div class="multi-agent-new-grid">
            <label class="multi-agent-new-field">
              <span>Target</span>
              <select id="multi-agent-new-to">
                <option value="ray">ray (research)</option>
                <option value="adam">adam (advisor)</option>
                <option value="sam">sam (strategist)</option>
                <option value="bob">bob (builder)</option>
                <option value="cliff">cliff (review)</option>
                <option value="mark">mark (marketing)</option>
                <option value="alice">alice (coordinator)</option>
              </select>
            </label>
            <label class="multi-agent-new-field">
              <span>Kind</span>
              <select id="multi-agent-new-kind">
                <option value="research">research</option>
                <option value="code">code</option>
                <option value="review">review</option>
                <option value="summarise">summarise</option>
                <option value="decide">decide</option>
                <option value="other">other</option>
              </select>
            </label>
            <label class="multi-agent-new-field">
              <span>Priority</span>
              <select id="multi-agent-new-priority">
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2" selected>P2</option>
                <option value="P3">P3</option>
              </select>
            </label>
            <label class="multi-agent-new-field">
              <span>From</span>
              <input id="multi-agent-new-from" type="text" value="kelly" />
            </label>
          </div>
          <label class="multi-agent-new-block">
            <span>Brief</span>
            <textarea id="multi-agent-new-brief" rows="4" placeholder="Why and what — specific enough that two workers wouldn't duplicate effort." required></textarea>
          </label>
          <label class="multi-agent-new-block">
            <span>Output format</span>
            <textarea id="multi-agent-new-output" rows="2" placeholder="What 'done' looks like. Required for code/review/summarise."></textarea>
          </label>
          <label class="multi-agent-new-block">
            <span>Context (one per line — file path, jira:KEY, or URL)</span>
            <textarea id="multi-agent-new-context" rows="2" placeholder="Notes/Projects/...&#10;jira:WAL-XX"></textarea>
          </label>
          <div class="multi-agent-new-actions">
            <span class="multi-agent-new-status" id="multi-agent-new-status"></span>
            <button class="multi-agent-new-cancel" id="multi-agent-new-cancel" type="button">Cancel</button>
            <button class="multi-agent-new-submit" id="multi-agent-new-submit" type="submit">Dispatch</button>
          </div>
        </form>
      </section>
    </section>
    </div>
    <div id="chat-panel" class="chat-panel" hidden>
      <div class="chat-toolbar">
        <div class="chat-toolbar-left">
          <button id="chat-history-btn" class="chat-toolbar-btn" type="button" title="Chats">Chats</button>
          <span id="chat-agent-badge" class="chat-agent-badge" hidden></span>
        </div>
        <button id="chat-session-badge" class="chat-session-badge" type="button" hidden title="Click to copy full session id"></button>
        <button id="chat-new-task-btn" class="chat-toolbar-btn" type="button" title="Dispatch a task linked to this chat" hidden>+ Task</button>
        <button id="chat-delete" class="chat-toolbar-btn chat-delete-btn" type="button" title="Delete this chat (asks to confirm)" aria-label="Delete chat">🗑</button>
        <div id="chat-history-dropdown" class="chat-history-dropdown" hidden>
          <div class="chat-history-head">
            <span>Saved Chats</span>
            <button id="chat-new-btn" class="chat-history-new" type="button" title="Start a new chat">+ New</button>
          </div>
          <div id="chat-history-list" class="chat-history-list"></div>
        </div>
      </div>
      <div id="chat-messages" class="chat-messages"></div>
      <div id="chat-task-host" class="chat-task-host" hidden></div>
      <div class="chat-input-area">
        <form id="chat-form" class="chat-form">
          <textarea
            id="chat-input"
            class="chat-input"
            placeholder="Message..."
            rows="3"
            autocomplete="off"
          ></textarea>
          <div class="chat-actions">
            <button id="chat-interrupt" class="chat-interrupt" type="button" hidden title="Stop current run; if the composer has text, send it as a new prompt" aria-label="Interrupt">✋</button>
            <button id="chat-send" class="chat-send" type="submit" title="Send message" aria-label="Send">↑</button>
          </div>
          <button id="chat-cancel" class="chat-cancel" type="button" hidden>Cancel</button>
        </form>
      </div>
    </div>
    <div id="files-panel" class="files-panel" hidden>
      <div class="files-toolbar">
        <div class="files-toolbar-row files-toolbar-row-branch">
          <select id="files-branch-select" class="files-branch-select" title="Branch" hidden></select>
          <div class="files-nav-group">
            <button id="files-nav-back" class="files-nav-btn" type="button" title="Back" aria-label="Back" disabled>←</button>
            <button id="files-nav-forward" class="files-nav-btn" type="button" title="Forward" aria-label="Forward" disabled>→</button>
          </div>
        </div>
        <div class="files-toolbar-row files-toolbar-row-crumb">
          <div class="files-breadcrumb" id="files-breadcrumb"></div>
        </div>
      </div>
      <button id="files-picker-toggle" class="files-picker-toggle" type="button" aria-expanded="true" hidden>
        <span class="files-picker-toggle-label" id="files-picker-toggle-label">Browse files</span>
        <span class="files-picker-toggle-caret" aria-hidden="true">▾</span>
      </button>
      <div class="files-split">
        <div class="files-sidebar" id="files-sidebar">
          <div class="files-list" id="files-list">
            <div class="files-loading">Loading...</div>
          </div>
        </div>
        <div class="files-content" id="files-content">
          <div class="files-empty">Select a file to view</div>
        </div>
      </div>
    </div>
    <div id="task-panel" class="task-panel" hidden>
      <div class="task-panel-toolbar">
        <button id="task-panel-back" class="task-panel-back" type="button" title="Back to dashboard" aria-label="Back to dashboard">←</button>
        <div class="task-panel-headline-wrap">
          <div class="task-panel-id" id="task-panel-id"></div>
          <div class="task-panel-headline" id="task-panel-headline">Task</div>
        </div>
        <div class="task-panel-status-wrap">
          <span class="task-panel-status" id="task-panel-status"></span>
        </div>
      </div>
      <div class="task-panel-body" id="task-panel-body">
        <div class="task-panel-loading">Loading task...</div>
      </div>
    </div>
  </main>

  <aside class="split-pane" id="split-pane" hidden aria-label="Split view second pane">
    <button class="split-pane-close" id="split-pane-close" type="button" title="Close split view" aria-label="Close split view">×</button>
    <iframe class="split-iframe" id="split-iframe" title="ClaudeClaw second pane" loading="lazy"></iframe>
  </aside>

  <div class="dock-shell">
    <aside class="side-bubble" id="jobs-bubble" aria-live="polite">
      <div class="side-icon">🗂️</div>
      <div class="side-value">-</div>
      <div class="side-label">Jobs</div>
    </aside>
    <footer class="dock" id="dock" aria-live="polite">
      <div class="pill">Connecting...</div>
    </footer>
    <aside class="side-bubble" id="uptime-bubble" aria-live="polite">
      <div class="side-icon">⏱️</div>
      <div class="side-value">-</div>
      <div class="side-label">Uptime</div>
    </aside>
  </div>

  <script src="/marked.js" defer></script>
  <script src="/yaml.js" defer></script>
  <script src="/client.js" defer></script>
</body>
</html>`;
  return decodeUnicodeEscapes(html);
}
