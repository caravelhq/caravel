<script setup lang="ts">
import { onMounted } from "vue";
import { escHtml, fmtSize, fileIcon } from "../lib/highlight";
import { useWorkspaceStore } from "../stores/workspace";
import { useFilesStore } from "../stores/files";

const filesStore = useFilesStore();

// DOM refs (via getElementById — thin port keeps imperative style)
let filesList: HTMLElement | null = null;
let filesBreadcrumb: HTMLElement | null = null;
let filesBranchSelect: HTMLSelectElement | null = null;

let filesCurrentDir = filesStore.currentDir;
let filesActiveRepoRoot = ".";
let filesHeadBranch = "";
let filesSelectedBranch = filesStore.selectedBranch;
let filesHasRepo = false;

const ws = useWorkspaceStore();

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
  filesStore.currentDir = filesCurrentDir;
  filesStore.currentPath = "";
  renderBreadcrumb(filesCurrentDir);

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

      // ⇥ throw button — opens file in the other group.
      if (entry.type === "file") {
        const throwBtn = document.createElement("button");
        throwBtn.type = "button";
        throwBtn.className = "files-throw-btn";
        throwBtn.textContent = "⇥";
        throwBtn.title = "Open in other group";
        throwBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          ws.open({ kind: "file", path: entry.path }, { side: true });
        });
        item.appendChild(throwBtn);

        // HTML5 drag — carries application/x-caravel-ref MIME.
        item.draggable = true;
        item.addEventListener("dragstart", (ev) => {
          if (!ev.dataTransfer) return;
          const ref = JSON.stringify({ kind: "file", path: entry.path });
          ev.dataTransfer.setData("application/x-caravel-ref", ref);
          ev.dataTransfer.setData("text/plain", entry.path);
          ev.dataTransfer.effectAllowed = "copy";
        });
      }

      item.addEventListener("click", () => {
        if (entry.type === "directory") {
          loadDirectory(entry.path);
        } else {
          ws.open({ kind: "file", path: entry.path }, { preview: true });
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

onMounted(() => {
  filesList = document.getElementById("files-list");
  filesBreadcrumb = document.getElementById("files-breadcrumb");
  filesBranchSelect = document.getElementById("files-branch-select") as HTMLSelectElement | null;

  if (filesBranchSelect) {
    filesBranchSelect.addEventListener("change", () => {
      filesSelectedBranch = filesBranchSelect!.value || "";
      loadDirectory(filesCurrentDir);
    });
  }

  if (!filesStore.loaded) {
    filesStore.loaded = true;
    if (filesStore.currentPath) {
      // Cold URL had /files/<path> — open the file as a tab and navigate the picker to its directory.
      ws.open({ kind: "file", path: filesStore.currentPath });
      const dir = filesStore.currentPath.includes("/")
        ? filesStore.currentPath.split("/").slice(0, -1).join("/") || "."
        : ".";
      refreshBranchSelector().then(() => loadDirectory(dir));
    } else if (filesStore.currentDir !== ".") {
      refreshBranchSelector().then(() => loadDirectory(filesStore.currentDir));
    } else {
      refreshBranchSelector().then(() => loadDirectory("."));
    }
  } else {
    // Remount after tab switch — DOM is fresh, re-render from persisted store state.
    const restoreDir = filesStore.currentDir;
    filesCurrentDir = restoreDir;
    refreshBranchSelector().then(() => loadDirectory(restoreDir));
  }
});
</script>

<template>
  <div id="files-panel" class="files-panel">
    <div class="files-toolbar">
      <div class="files-toolbar-row files-toolbar-row-branch">
        <select id="files-branch-select" class="files-branch-select" title="Branch" hidden></select>
      </div>
      <div class="files-toolbar-row files-toolbar-row-crumb">
        <div class="files-breadcrumb" id="files-breadcrumb"></div>
      </div>
    </div>
    <div class="files-list" id="files-list">
      <div class="files-loading">Loading...</div>
    </div>
  </div>
</template>
