<template>
  <div id="tasks-panel" class="tasks-panel">
    <div class="tasks-view-tabs" id="tasks-view-tabs" role="tablist" aria-label="Tasks view">
      <button type="button" class="tasks-view-tab is-active" data-view="projects" role="tab" aria-selected="true">Projects</button>
      <button type="button" class="tasks-view-tab" data-view="all" role="tab" aria-selected="false">All</button>
    </div>
    <div class="tasks-toolbar">
      <div class="tasks-toolbar-left">
        <button id="tasks-picker-toggle" class="tasks-toolbar-btn tasks-picker-toggle" type="button" aria-expanded="true" title="Show task list">List</button>
        <button id="tasks-project-btn" class="tasks-toolbar-btn" type="button" title="Go to project for this task" disabled aria-disabled="true">Project</button>
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
        <div id="tasks-user-blocked" class="tasks-user-blocked" hidden></div>
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
        <div class="tasks-project-pane" id="tasks-project-pane" hidden></div>
        <div class="tasks-empty" id="tasks-empty">Select a task on the left, or click <strong>+ New</strong> to create one.</div>
        <form class="multi-agent-new tasks-new-form" id="multi-agent-new" hidden>
          <div class="multi-agent-new-head">Create task</div>
          <div class="multi-agent-new-parent" id="multi-agent-new-parent-chip" hidden>
            <span>↳ child of <strong id="multi-agent-new-parent-id"></strong></span>
            <button type="button" class="multi-agent-new-parent-clear" id="multi-agent-new-parent-clear" title="Clear parent">✕</button>
          </div>
          <label class="multi-agent-new-block">
            <span>Headline <em class="multi-agent-new-hint">(required, ≤10 words)</em></span>
            <input id="multi-agent-new-headline" type="text" maxlength="120" placeholder="BLE plugin survey" required />
            <span class="multi-agent-new-counter" id="multi-agent-new-headline-count">0 / 10 words</span>
          </label>
          <div class="multi-agent-new-grid">
            <label class="multi-agent-new-field">
              <span>Target</span>
              <select id="multi-agent-new-to"></select>
            </label>
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
            <span>Depends on <em class="multi-agent-new-hint">(task IDs, one per line)</em></span>
            <textarea id="multi-agent-new-needs" rows="2" placeholder="TSK-2026-08-01-0001&#10;TSK-2026-08-01-0002"></textarea>
          </label>
          <details class="multi-agent-new-advanced" id="multi-agent-new-advanced">
            <summary class="multi-agent-new-advanced-toggle">▸ Advanced</summary>
            <div class="multi-agent-new-advanced-body">
              <div class="multi-agent-new-grid">
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
                  <span>From</span>
                  <input id="multi-agent-new-from" type="text" value="user" />
                </label>
              </div>
              <label class="multi-agent-new-block">
                <span>Output format</span>
                <textarea id="multi-agent-new-output" rows="2" placeholder="What 'done' looks like."></textarea>
              </label>
              <label class="multi-agent-new-block">
                <span>Context (one per line — file path, jira:KEY, or URL)</span>
                <textarea id="multi-agent-new-context" rows="2" placeholder="Notes/Projects/...&#10;jira:WAL-XX"></textarea>
              </label>
            </div>
          </details>
          <div class="multi-agent-new-actions">
            <span class="multi-agent-new-status" id="multi-agent-new-status"></span>
            <button class="multi-agent-new-cancel" id="multi-agent-new-cancel" type="button">Cancel</button>
            <button class="multi-agent-new-submit" id="multi-agent-new-submit" type="submit">Dispatch</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
