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
  <meta name="apple-mobile-web-app-title" content="Caravel" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  <title>Caravel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" crossorigin="anonymous" />
  <style>
${pageStyles}
  </style>
</head>
<body>
  <div class="grain" aria-hidden="true"></div>
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
          <div class="settings-label">🎙️ Voice — STT</div>
          <div class="settings-meta" id="voice-stt-meta">Whisper (local)</div>
        </div>
        <button class="hb-toggle off" id="voice-stt-toggle" type="button">Whisper</button>
      </div>
      <div class="setting-item" id="voice-model-row" hidden>
        <div class="setting-main">
          <div class="settings-label">🎙️ STT model</div>
          <div class="settings-meta">DeepGram model name</div>
        </div>
        <input class="hb-input voice-model-input" id="voice-stt-model-input" type="text" placeholder="nova-3" value="nova-3" title="DeepGram STT model" />
      </div>
      <div class="setting-item">
        <div class="setting-main">
          <div class="settings-label">🔊 TTS model</div>
          <div class="settings-meta" id="voice-tts-meta">DeepGram TTS voice</div>
        </div>
        <input class="hb-input voice-model-input" id="voice-tts-model-input" type="text" placeholder="aura-2-thalia-en" value="aura-2-thalia-en" title="DeepGram TTS model" />
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
      <button class="tab-btn tab-btn-active" id="tab-dashboard" type="button" role="tab" aria-selected="true" aria-controls="dashboard-panel"><span class="tab-btn-label-full">Dashboard</span><span class="tab-btn-label-short">Dash</span></button>
      <button class="tab-btn" id="tab-chat" type="button" role="tab" aria-selected="false" aria-controls="chat-panel">Chat</button>
      <button class="tab-btn" id="tab-tasks" type="button" role="tab" aria-selected="false" aria-controls="tasks-panel">Tasks</button>
      <button class="tab-btn" id="tab-files" type="button" role="tab" aria-selected="false" aria-controls="files-panel">Files</button>
      <button class="tab-btn tab-btn-split" id="split-nav-toggle" type="button" title="Toggle split view" aria-label="Toggle split view" aria-pressed="false">&#x2AFD;</button>
      <button class="tab-btn tab-btn-settings" id="settings-btn" type="button" title="Settings">&#x2699;</button>
    </nav>
    <div id="dashboard-panel">
    <section class="hero">
      <div class="logo-art" role="img" aria-label="Caravel ship logo">
        <svg class="logo-ship" viewBox="0 0 120 96" width="120" height="96" fill="none" aria-hidden="true">
          <!-- Caravela latina: three lateen sails, raked masts, high sterncastle. Bow left, stern right. -->
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
      <section class="quick-job" id="quick-jobs-view">
        <div class="quick-job-head quick-job-head-row">
          <div>
            <div class="quick-job-title">Quick Tasks</div>
            <div class="quick-job-sub">Recurring task schedules</div>
            <div class="quick-jobs-next" id="quick-jobs-next"></div>
          </div>
          <button class="quick-open-create" id="quick-open-create" type="button">Create Task</button>
        </div>
        <div class="quick-jobs-list quick-jobs-list-main" id="quick-jobs-list">
          <div class="quick-jobs-empty">Loading schedules...</div>
        </div>
        <div class="quick-status" id="quick-jobs-status"></div>
      </section>
      <form class="quick-job quick-view-hidden" id="quick-job-form" autocomplete="off">
        <div class="quick-job-head">
          <div class="quick-job-title">New Task</div>
          <div class="quick-job-sub">Dispatch a task to an agent</div>
        </div>
        <div class="quick-job-grid">
          <div class="quick-field">
            <div class="quick-label">Agent</div>
            <select class="quick-input" id="quick-task-agent">
              <option value="alice">alice</option>
            </select>
          </div>
          <div class="quick-field">
            <div class="quick-label">Title</div>
            <input class="quick-input" id="quick-task-headline" type="text" maxlength="200" placeholder="Research X for Kelly" required />
          </div>
          <div class="quick-field">
            <div class="quick-label">Description</div>
            <textarea class="quick-prompt" id="quick-task-brief" placeholder="What should the agent do?" required></textarea>
            <div class="quick-prompt-meta">
              <span id="quick-job-count">0 chars</span>
            </div>
          </div>
          <div class="quick-field">
            <label class="quick-check" for="quick-task-recurring">
              <input id="quick-task-recurring" type="checkbox" />
              <span>Recurring schedule</span>
            </label>
          </div>
          <div id="quick-task-schedule-section" class="quick-view-hidden">
            <div class="quick-field">
              <div class="quick-label">Cadence</div>
              <div style="display:flex;gap:.75rem;margin-top:.25rem">
                <label class="quick-check quick-check-inline">
                  <input type="radio" name="quick-task-cron-mode" id="quick-task-mode-interval" value="interval" checked />
                  <span>Interval</span>
                </label>
                <label class="quick-check quick-check-inline">
                  <input type="radio" name="quick-task-cron-mode" id="quick-task-mode-cron" value="cron" />
                  <span>Cron</span>
                </label>
              </div>
            </div>
            <div id="quick-interval-section" class="quick-field">
              <div class="quick-field-row">
                <div class="quick-field">
                  <div class="quick-label">Start time <span style="opacity:.45;font-size:.85em">HH:MM</span></div>
                  <input class="quick-input" id="quick-task-interval-start" type="text" placeholder="08:00" />
                </div>
                <div class="quick-field">
                  <div class="quick-label">Every N hours</div>
                  <input class="quick-input" id="quick-task-interval-hours" type="number" min="1" max="24" step="1" placeholder="24" />
                </div>
              </div>
            </div>
            <div id="quick-cron-section" class="quick-field quick-view-hidden">
              <div class="quick-label">Cron <span style="opacity:.45;font-size:.85em">min hour day month weekday</span></div>
              <input class="quick-input" id="quick-task-cron" type="text" placeholder="0 8 * * *" />
            </div>
          </div>
        </div>
        <div class="quick-job-actions">
          <button class="quick-submit" id="quick-job-submit" type="submit">Create Task</button>
          <div class="quick-status" id="quick-job-status"></div>
        </div>
        <div class="quick-form-foot">
          <button class="quick-back-jobs" id="quick-back-jobs" type="button">Back to Schedules</button>
        </div>
      </form>
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
    </div>
    <div id="chat-panel" class="chat-panel" hidden>
      <div class="chat-toolbar">
        <div class="chat-toolbar-left">
          <button id="chat-history-btn" class="chat-toolbar-btn" type="button" title="Chats">Chats</button>
          <span id="chat-agent-badge" class="chat-agent-badge" hidden></span>
          <input id="chat-name-input" class="chat-name-input" type="text" title="Chat title — leave blank for auto-name from first message" autocomplete="off" hidden />
        </div>
        <button id="chat-session-badge" class="chat-session-badge" type="button" hidden title="Click to copy full session id"></button>
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
      <div class="chat-input-area">
        <input id="chat-new-title-input" class="chat-new-title-input" type="text" placeholder="Chat name/title" autocomplete="off" hidden />
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
    <div id="tasks-panel" class="tasks-panel" hidden>
      <!-- WAL-63 Phase 2: view tabs replacing the single Tasks pane. Current
           is the inbox of active leaves and the default landing view.
           Projects is a placeholder for Phase 4. All tasks is the legacy
           flat picker with status filter chips intact. -->
      <div class="tasks-view-tabs" id="tasks-view-tabs" role="tablist" aria-label="Tasks view">
        <button type="button" class="tasks-view-tab is-active" data-view="current" role="tab" aria-selected="true">Current</button>
        <button type="button" class="tasks-view-tab" data-view="projects" role="tab" aria-selected="false">Projects</button>
        <button type="button" class="tasks-view-tab" data-view="all" role="tab" aria-selected="false">All</button>
      </div>
      <div class="tasks-toolbar">
        <div class="tasks-toolbar-left">
          <button id="tasks-picker-toggle" class="tasks-toolbar-btn tasks-picker-toggle" type="button" aria-expanded="true" title="Show task list">Tasks</button>
        </div>
        <div class="tasks-filter-chips" id="tasks-filter-chips" role="tablist" aria-label="Filter tasks by status">
          <button type="button" class="tasks-filter-chip is-active" data-filter="all">All</button>
          <button type="button" class="tasks-filter-chip" data-filter="open">Open</button>
          <button type="button" class="tasks-filter-chip" data-filter="waiting">Waiting</button>
          <button type="button" class="tasks-filter-chip" data-filter="done">Done</button>
          <button type="button" class="tasks-filter-chip" data-filter="failed">Failed</button>
        </div>
        <div class="tasks-toolbar-right">
          <button id="tasks-new-btn" class="tasks-toolbar-btn" type="button" title="Create a new task">+ New</button>
          <button id="tasks-refresh" class="tasks-toolbar-btn" type="button" title="Refresh" aria-label="Refresh">↻</button>
        </div>
      </div>
      <div class="tasks-split">
        <div class="tasks-sidebar" id="tasks-sidebar">
          <div class="tasks-tree" id="tasks-tree">
            <div class="tasks-loading">Loading…</div>
          </div>
        </div>
        <div class="tasks-content" id="tasks-content">
          <div class="tasks-viewer" id="tasks-viewer" hidden>
            <div class="tasks-viewer-head">
              <div class="tasks-viewer-headline-wrap">
                <div class="tasks-viewer-id" id="tasks-viewer-id"></div>
                <div class="tasks-viewer-headline" id="tasks-viewer-headline">Task</div>
              </div>
              <div class="tasks-viewer-status-wrap">
                <span class="tasks-viewer-status" id="tasks-viewer-status"></span>
              </div>
            </div>
            <div class="tasks-viewer-tabs" role="tablist" aria-label="Task views">
              <button type="button" class="tasks-viewer-tab is-active" data-view="task" role="tab" aria-selected="true">Task</button>
              <button type="button" class="tasks-viewer-tab" data-view="report" role="tab" aria-selected="false">Report</button>
            </div>
            <div class="tasks-viewer-body" id="tasks-viewer-body">
              <div class="task-panel-loading">Loading task…</div>
            </div>
          </div>
          <!-- WAL-63 Phase 4: project page right-pane container. Shown when
               Kelly clicks a project card in the left sidebar. Renders the
               docs shelf, active leaves, family trees, closed section, and
               header metrics for one project. -->
          <div class="tasks-project-pane" id="tasks-project-pane" hidden></div>
          <div class="tasks-empty" id="tasks-empty">Select a task on the left, or click <strong>+ New</strong> to create one.</div>
          <form class="multi-agent-new tasks-new-form" id="multi-agent-new" hidden>
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
                <!-- Options populated at runtime from /api/agents (see
                     populateTaskTargetSelect in client.js). -->
                <select id="multi-agent-new-to"></select>
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
                <input id="multi-agent-new-from" type="text" value="user" />
              </label>
              <!-- WAL-63 Phase 3: project tag dropdown. Populated at panel
                   open from /api/projects (Notes/Projects/<slug>/ directory
                   scan). "(auto)" means: leave the field absent and let the
                   helper / createTask infer from context paths. "(none)"
                   forces project: null. -->
              <label class="multi-agent-new-field">
                <span>Project</span>
                <select id="multi-agent-new-project">
                  <option value="">(auto from context)</option>
                  <option value="__none__">(none / unassigned)</option>
                </select>
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
        </div>
      </div>
    </div>
  </main>

  <aside class="split-pane" id="split-pane" hidden aria-label="Split view second pane">
    <button class="split-pane-close" id="split-pane-close" type="button" title="Close split view" aria-label="Close split view">×</button>
    <iframe class="split-iframe" id="split-iframe" title="Caravel second pane" loading="lazy"></iframe>
  </aside>

  <!-- Fullscreen voice-chat overlay — hoisted outside .chat-panel to avoid backdrop-filter stacking context -->
  <div id="voice-mode-overlay" class="voice-mode-overlay" hidden aria-live="polite">
    <div class="voice-mode-transcript" id="voice-mode-transcript"></div>
    <div class="vm-controls">
      <div class="voice-mode-status" id="voice-mode-status">Press and hold to talk</div>
      <button id="voice-mode-btn" class="voice-mode-btn" type="button" aria-label="Push to talk"><i class="fa-solid fa-microphone"></i></button>
      <button id="voice-mode-close" class="voice-mode-close" type="button" aria-label="Exit voice mode"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>

  <!-- Small modal shown when mic recording or speaker playback is active -->
  <div id="audio-action-modal" class="audio-action-modal" hidden role="dialog" aria-modal="true">
    <div class="audio-action-card">
      <div class="audio-action-icon" id="audio-action-icon"></div>
      <div class="audio-action-label" id="audio-action-label">Recording...</div>
      <button class="audio-action-stop" id="audio-action-stop" type="button" aria-label="Stop">
        <i class="fa-solid fa-stop"></i><span>Stop</span>
      </button>
    </div>
  </div>

  <div class="dock-shell">
    <aside class="side-bubble" id="jobs-bubble" aria-live="polite">
      <div class="side-icon">🗂️</div>
      <div class="side-value">-</div>
      <div class="side-label">Jobs</div>
    </aside>
    <aside class="side-bubble" id="tasks-bubble" aria-live="polite">
      <div class="side-icon">📋</div>
      <div class="side-value">-</div>
      <div class="side-label">Tasks</div>
    </aside>
    <footer class="dock" id="dock" aria-live="polite">
      <div id="dock-pills"><div class="pill">Connecting...</div></div>
      <button id="global-mic" class="global-mic" type="button" title="Dictate into focused field" aria-label="Dictate" disabled><i class="fa-solid fa-microphone"></i></button>
      <button id="global-voice-mode" class="global-voice-mode" type="button" title="Voice chat mode" aria-label="Voice chat mode" hidden><i class="fa-solid fa-walkie-talkie"></i></button>
      <button id="global-speaker" class="global-speaker" type="button" title="Read page aloud" aria-label="Read page aloud"><i class="fa-solid fa-volume-high"></i></button>
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
