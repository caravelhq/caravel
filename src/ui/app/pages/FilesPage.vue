<template>
  <div id="files-panel" class="files-panel">
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
</template>
