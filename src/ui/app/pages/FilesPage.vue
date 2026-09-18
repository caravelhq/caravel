<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import DocViewer from "../components/doc/DocViewer.vue";
import { escHtml, fmtSize, fileIcon } from "../lib/highlight";

// Reactive state passed to DocViewer
const activeFilePath = ref("");
const activeBranch = ref("");

// DOM refs (via getElementById — thin port keeps imperative style)
let filesList: HTMLElement | null = null;
let filesContent: HTMLElement | null = null;
let filesBreadcrumb: HTMLElement | null = null;
let filesBranchSelect: HTMLSelectElement | null = null;
let filesNavBack: HTMLButtonElement | null = null;
let filesNavForward: HTMLButtonElement | null = null;
let filesPickerToggle: HTMLButtonElement | null = null;
let filesPickerToggleLabel: HTMLElement | null = null;
let filesSidebar: HTMLElement | null = null;

let filesCurrentDir = ".";
let filesActiveRepoRoot = ".";
let filesHeadBranch = "";
let filesSelectedBranch = "";
let filesHasRepo = false;
let filesHistory: Array<{ dir: string; file: string }> = [];
let filesHistoryIdx = -1;
let filesSkipHistoryPush = false;
let filesLoaded = false;

function isPanelNarrow(panelId: string, threshold: number): boolean {
  const el = document.getElementById(panelId);
  if (el && el.clientWidth > 0) return el.clientWidth <= threshold;
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: " + threshold + "px)").matches;
}

function isMobileFiles(): boolean {
  return isPanelNarrow("files-panel", 1199);
}

function setPickerCollapsed(collapsed: boolean): void {
  if (!filesSidebar || !filesPickerToggle) return;
  filesSidebar.classList.toggle("files-sidebar-collapsed", collapsed);
  filesPickerToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function updatePickerToggleLabel(): void {
  if (!filesPickerToggleLabel) return;
  if (activeFilePath.value) {
    const parts = activeFilePath.value.split("/");
    filesPickerToggleLabel.textContent = parts[parts.length - 1] || "Browse files";
  } else if (filesCurrentDir && filesCurrentDir !== ".") {
    const dParts = filesCurrentDir.split("/");
    filesPickerToggleLabel.textContent = "Browse: " + (dParts[dParts.length - 1] || filesCurrentDir);
  } else {
    filesPickerToggleLabel.textContent = "Browse files";
  }
}

function pushHistory(dir: string, file: string): void {
  if (filesSkipHistoryPush) return;
  const last = filesHistory[filesHistoryIdx];
  if (last && last.dir === dir && last.file === file) return;
  filesHistory = filesHistory.slice(0, filesHistoryIdx + 1);
  filesHistory.push({ dir, file });
  filesHistoryIdx = filesHistory.length - 1;
  updateNavButtons();
}

function updateNavButtons(): void {
  if (filesNavBack) filesNavBack.disabled = filesHistoryIdx <= 0;
  if (filesNavForward)
    filesNavForward.disabled = filesHistoryIdx < 0 || filesHistoryIdx >= filesHistory.length - 1;
}

async function goToHistory(delta: number): Promise<void> {
  const next = filesHistoryIdx + delta;
  if (next < 0 || next >= filesHistory.length) return;
  filesHistoryIdx = next;
  const entry = filesHistory[next];
  filesSkipHistoryPush = true;
  try {
    await loadDirectory(entry.dir);
    if (entry.file) openFile(entry.file);
  } finally {
    filesSkipHistoryPush = false;
  }
  updateNavButtons();
}

function renderBreadcrumb(dirPath: string): void {
  if (!filesBreadcrumb) return;
  filesBreadcrumb.textContent = "";

  const rootBtn = document.createElement("button");
  rootBtn.type = "button";
  rootBtn.textContent = "~";
  rootBtn.addEventListener("click", () => loadDirectory("."));
  filesBreadcrumb.appendChild(rootBtn);

  if (dirPath && dirPath !== ".") {
    const parts = dirPath.split("/");
    for (let i = 0; i < parts.length; i++) {
      const sep = document.createElement("span");
      sep.textContent = " / ";
      filesBreadcrumb.appendChild(sep);

      const partBtn = document.createElement("button");
      partBtn.type = "button";
      partBtn.textContent = parts[i];
      const partPath = parts.slice(0, i + 1).join("/");
      partBtn.addEventListener("click", () => loadDirectory(partPath));
      filesBreadcrumb.appendChild(partBtn);
    }
  }
}

function applyRepoVisibility(hasRepo: boolean): void {
  filesHasRepo = !!hasRepo;
  if (filesBranchSelect) filesBranchSelect.hidden = !filesHasRepo;
  if (!filesHasRepo) {
    filesSelectedBranch = "";
    filesHeadBranch = "";
  }
}

async function refreshBranchSelector(): Promise<void> {
  if (!filesBranchSelect) return;
  try {
    const res = await fetch("/api/git/branches?path=" + encodeURIComponent(filesCurrentDir || "."));
    const data = await res.json();
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

    const opts: string[] = [];
    let hasSelected = false;
    for (const b of data.branches || []) {
      const label = b === filesHeadBranch ? b + " (current)" : b;
      const sel = b === filesSelectedBranch ? " selected" : "";
      if (b === filesSelectedBranch) hasSelected = true;
      opts.push('<option value="' + escHtml(b) + '"' + sel + ">" + escHtml(label) + "</option>");
    }
    if (!hasSelected && filesSelectedBranch) {
      opts.unshift(
        '<option value="' + escHtml(filesSelectedBranch) + '" selected>' +
        escHtml(filesSelectedBranch) + "</option>"
      );
    }
    filesBranchSelect.innerHTML = opts.join("");
    filesBranchSelect.title = "Repo: " + (data.rootLabel || data.root || "~");
  } catch (_) {
    if (filesBranchSelect) filesBranchSelect.innerHTML = "";
    applyRepoVisibility(false);
  }
}

async function loadDirectory(dirPath: string): Promise<void> {
  filesCurrentDir = dirPath || ".";
  activeFilePath.value = "";
  (window as any).__filesActivePath = null;
  pushHistory(filesCurrentDir, "");
  renderBreadcrumb(filesCurrentDir);
  updatePickerToggleLabel();
  setPickerCollapsed(false);

  if (!filesList) return;
  filesList.innerHTML = '<div class="files-loading">Loading...</div>';

  try {
    let url = "/api/files/list?path=" + encodeURIComponent(filesCurrentDir);
    if (filesSelectedBranch) url += "&branch=" + encodeURIComponent(filesSelectedBranch);
    const res = await fetch(url);
    const data = await res.json();
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
    for (const entry of data.entries) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "files-item";
      item.dataset.path = entry.path;
      item.dataset.type = entry.type;

      const icon = document.createElement("span");
      icon.className = "files-item-icon";
      icon.textContent = fileIcon(entry);
      item.appendChild(icon);

      const name = document.createElement("span");
      name.className = "files-item-name";
      name.textContent = entry.name + (entry.isSymlink ? " ↗" : "");
      if (entry.isSymlink) name.title = "symlink";
      item.appendChild(name);

      if (entry.type === "file" && entry.size != null) {
        const size = document.createElement("span");
        size.className = "files-item-size";
        size.textContent = fmtSize(entry.size);
        item.appendChild(size);
      }

      item.addEventListener("click", () => {
        if (entry.type === "directory") {
          loadDirectory(entry.path);
        } else {
          openFile(entry.path);
        }
      });

      filesList.appendChild(item);
    }
  } catch (err) {
    if (filesList) {
      filesList.innerHTML =
        '<div class="files-loading">Error: ' +
        escHtml(String(err instanceof Error ? err.message : err)) +
        "</div>";
    }
  }
}

function openFile(filePath: string): void {
  activeFilePath.value = filePath;
  activeBranch.value = filesSelectedBranch;
  (window as any).__filesActivePath = filePath;
  pushHistory(filesCurrentDir, filePath);
  updatePickerToggleLabel();
  if (isMobileFiles()) setPickerCollapsed(true);

  // Highlight active file in sidebar
  if (filesList) {
    filesList.querySelectorAll<HTMLElement>(".files-item").forEach((el) => {
      el.classList.toggle("files-item-active", el.dataset.path === filePath);
    });
  }
}

// Expose loadFile and loadDirectory for cross-page globals (F8 deferred to later phase).
(window as any).__loadFile = openFile;
(window as any).__loadDirectory = loadDirectory;

onMounted(() => {
  filesList = document.getElementById("files-list");
  filesBreadcrumb = document.getElementById("files-breadcrumb");
  filesBranchSelect = document.getElementById("files-branch-select") as HTMLSelectElement | null;
  filesNavBack = document.getElementById("files-nav-back") as HTMLButtonElement | null;
  filesNavForward = document.getElementById("files-nav-forward") as HTMLButtonElement | null;
  filesPickerToggle = document.getElementById("files-picker-toggle") as HTMLButtonElement | null;
  filesPickerToggleLabel = document.getElementById("files-picker-toggle-label");
  filesSidebar = document.getElementById("files-sidebar");

  if (filesNavBack) filesNavBack.addEventListener("click", () => goToHistory(-1));
  if (filesNavForward) filesNavForward.addEventListener("click", () => goToHistory(1));

  if (filesBranchSelect) {
    filesBranchSelect.addEventListener("change", () => {
      filesSelectedBranch = filesBranchSelect!.value || "";
      activeBranch.value = filesSelectedBranch;
      loadDirectory(filesCurrentDir);
    });
  }

  if (filesPickerToggle) {
    filesPickerToggle.addEventListener("click", () => {
      if (!filesSidebar) return;
      const collapsed = filesSidebar.classList.contains("files-sidebar-collapsed");
      setPickerCollapsed(!collapsed);
    });
  }

  // Load on first mount (equivalent to tab click triggering load in vanilla).
  if (!filesLoaded) {
    filesLoaded = true;
    refreshBranchSelector().then(() => loadDirectory("."));
  }
});

onBeforeUnmount(() => {
  // Clear global refs on unmount so cross-page callers get null rather than stale closures.
  (window as any).__filesActivePath = null;
});
</script>

<template>
  <div id="files-panel" class="files-panel">
    <div class="files-toolbar">
      <div class="files-toolbar-row files-toolbar-row-branch">
        <select id="files-branch-select" class="files-branch-select" title="Branch" hidden></select>
        <div class="files-nav-group">
          <button id="files-nav-back" class="files-nav-btn" type="button" title="Back" aria-label="Back" :disabled="true">←</button>
          <button id="files-nav-forward" class="files-nav-btn" type="button" title="Forward" aria-label="Forward" :disabled="true">→</button>
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
      <DocViewer :path="activeFilePath" :branch="activeBranch || undefined" kind="file" />
    </div>
  </div>
</template>
