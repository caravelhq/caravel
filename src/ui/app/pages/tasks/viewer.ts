// viewer.ts — task detail panel HTML renderers.
// Ported from client.js:4717–5427.

import { renderMarkdown, stripFrontmatter } from "../../lib/markdown";
import { escapeHtml, statusClass, shorten, timeAgo, renderNextTargetPicker, suggestChildHeadline, countActiveDescendants } from "./helpers";
import type { TaskRow } from "../../stores/tasks";

// ── Shared section wrapper ────────────────────────────────────────────────

export function renderSection(title: string, bodyHtml: string, openByDefault: boolean): string {
  if (!bodyHtml) return "";
  return (
    '<details class="task-panel-section"' + (openByDefault ? " open" : "") + ">" +
    '<summary class="task-panel-section-summary">' + escapeHtml(title) + "</summary>" +
    '<div class="task-panel-section-body">' + bodyHtml + "</div>" +
    "</details>"
  );
}

// ── Mini task tree ────────────────────────────────────────────────────────

export function renderTreeNode(node: TaskRow, depth: number, marker: string, isCurrent: boolean): string {
  const pad = depth * 14;
  const indent = '<span class="task-tree-indent" style="width:' + pad + 'px"></span>';
  const dot = '<span class="task-tree-marker">' + marker + "</span>";
  const id = '<span class="task-tree-id">' + escapeHtml(node.id) + "</span>";
  const agent = '<span class="task-tree-agent">' + escapeHtml(node.agent || node.to || "?") + "</span>";
  const sc = '<span class="task-tree-status ' + statusClass(node.status) + '">' + escapeHtml(node.status || "?") + "</span>";
  const headline = '<span class="task-tree-headline">' + escapeHtml(shorten(node.headline || node.brief || "", 120)) + "</span>";
  const attr = isCurrent ? "" : ' data-open-task="' + escapeHtml(node.id) + '"';
  return '<div class="task-tree-node' + (isCurrent ? " is-current" : "") + '"' + attr + ">" + indent + dot + id + agent + sc + headline + "</div>";
}

export function renderTaskTree(chain: { ancestors?: TaskRow[]; task?: TaskRow; children?: TaskRow[] }): string {
  const ancestors = chain.ancestors || [];
  const children = chain.children || [];
  const task = chain.task;
  const rows: string[] = [];
  ancestors.forEach((a, i) => rows.push(renderTreeNode(a, i, i === 0 ? "◆" : "└", false)));
  const curDepth = ancestors.length;
  if (task) rows.push(renderTreeNode(task, curDepth, curDepth === 0 ? "●" : "└", true));
  children.forEach((c, j) => rows.push(renderTreeNode(c, curDepth + 1, j === children.length - 1 ? "└" : "├", false)));
  return rows.length ? '<div class="task-tree">' + rows.join("") + "</div>" : "";
}

// ── Panel card ────────────────────────────────────────────────────────────

export function renderPanelCard(card: TaskRow, isCurrent: boolean, currentTaskId: string | null, cache: TaskRow[]): string {
  if (!card) return "";
  const brief = (card.brief || "").trim();
  const summaryResponse = card.summary?.response ? String(card.summary.response).trim() : "";
  const ctx = card.context || [];
  const statusLower = (card.status || "").toLowerCase();
  const isTerminal = statusLower.startsWith("done") || statusLower.startsWith("failed") || statusLower === "escalated";
  const isClaimed = card.status === "claimed";
  const isWaitingUser = card.status === "waiting:on:user";
  const isPaused = card.status === "paused";
  const isClosed = !!(card.closed && card.closed.status);
  const envelopePath = card.envelopePath || ("agents/" + card.agent + "/tasks/" + (card.bucket || "open") + "/" + card.id + ".yaml");

  const ctxLines = ctx.map(c => {
    const safe = escapeHtml(c);
    if (/^https?:/i.test(c)) return '<div class="task-panel-context-item">↗ <a href="' + safe + '" target="_blank" rel="noopener">' + safe + "</a></div>";
    if (/^jira:/i.test(c)) return '<div class="task-panel-context-item">' + safe + "</div>";
    return '<div class="task-panel-context-item">📄 <button data-open-file="' + safe + '" data-from-task="' + escapeHtml(currentTaskId || "") + '" type="button">' + safe + "</button></div>";
  }).join("");

  const metaParts: string[] = [];
  metaParts.push(escapeHtml(card.from || "?") + ' <span class="task-panel-meta-arrow">→</span> ' + escapeHtml(card.to || "?"));
  if (card.kind) metaParts.push(escapeHtml(card.kind));
  if (card.priority) metaParts.push(escapeHtml(card.priority));
  const projectLabel = card.project ? card.project : "Unassigned";
  metaParts.push(
    '<span class="task-panel-project-chip' + (card.project ? "" : " is-unassigned") + '" ' +
    'data-project-edit="' + escapeHtml(card.id) + '" ' +
    'data-project-agent="' + escapeHtml(card.agent || card.to || "") + '" ' +
    'data-project-current="' + escapeHtml(card.project || "") + '" ' +
    'title="Click to change project">📁 ' + escapeHtml(projectLabel) + "</span>"
  );
  if (card.updated) metaParts.push(escapeHtml(timeAgo(card.updated)));
  const metaHtml = '<div class="task-panel-meta">' + metaParts.join(' <span class="task-panel-meta-sep">·</span> ') + "</div>";

  let sections = "";

  if (isCurrent && isTerminal && !isClosed) {
    const picker = renderNextTargetPicker(card.agent || "", []);
    const suggest = suggestChildHeadline(card.headline || card.id, "continue");
    sections += renderSection("⏳ Continue",
      '<div class="task-panel-unblock task-panel-next" data-next-agent="' + escapeHtml(card.agent || "") + '" data-next-id="' + escapeHtml(card.id) + '" data-next-source="continue">' +
      '<div class="task-panel-unblock-hint">Type new instructions; a child task picks up on the same session thread. The parent closes as superseded at dispatch.</div>' +
      '<input type="text" class="task-panel-next-headline-input" placeholder="Child task title" value="' + escapeHtml(suggest) + '" />' +
      '<textarea class="task-panel-unblock-input task-panel-next-input" rows="4" placeholder="New instructions for the worker…"></textarea>' +
      '<div class="task-panel-unblock-actions">' + picker +
      '<button type="button" class="is-primary task-panel-next-submit">↳ Continue</button>' +
      '<span class="task-panel-unblock-status task-panel-next-status"></span></div></div>',
      true
    );
  }

  if (brief) sections += renderSection("Brief", '<div class="task-panel-card-summary">' + escapeHtml(brief) + "</div>", true);
  if (summaryResponse) sections += renderSection("Result", '<div class="task-panel-card-summary">' + escapeHtml(summaryResponse) + "</div>", true);

  if (isCurrent && isClosed) {
    const closedAt = card.closed!.at ? timeAgo(card.closed!.at) : "";
    sections +=
      '<div class="task-panel-closed-banner">' +
      '<span class="task-panel-closed-pill">' + escapeHtml(card.closed!.status) + "</span>" +
      '<span class="task-panel-closed-meta">by ' + escapeHtml(card.closed!.by || "?") + (closedAt ? " · " + escapeHtml(closedAt) : "") + "</span>" +
      (card.closed!.reason ? '<div class="task-panel-closed-reason">' + escapeHtml(card.closed!.reason) + "</div>" : "") +
      "</div>";
  }

  const actions: string[] = [];
  if (isCurrent && !isClosed) actions.push('<button class="task-panel-action" data-followon-task="' + escapeHtml(card.id) + '" data-followon-agent="' + escapeHtml(card.agent || card.to || "") + '" type="button">↳ Next</button>');
  actions.push('<button class="task-panel-action" data-toggle-chat="' + escapeHtml(card.id) + '" type="button">💬 Chat</button>');
  if (isCurrent && !isClaimed && !isClosed) {
    if (isTerminal) {
      actions.push('<button class="task-panel-action is-primary task-panel-done-reading" data-done-reading-agent="' + escapeHtml(card.agent || "") + '" data-done-reading-id="' + escapeHtml(card.id) + '" type="button">✓ Done reading</button>');
    } else {
      actions.push('<button class="task-panel-action" data-toggle-close="' + escapeHtml(card.id) + '" type="button">✕ Cancel</button>');
    }
  }
  if (isCurrent && isClaimed && !isClosed) actions.push('<button class="task-panel-action task-panel-action-danger" data-toggle-abort="' + escapeHtml(card.id) + '" type="button">✕ Abort</button>');
  if (isCurrent && isClosed) actions.push('<button class="task-panel-action is-primary" data-reopen-agent="' + escapeHtml(card.agent || "") + '" data-reopen-task="' + escapeHtml(card.id) + '" type="button">↻ Reopen</button>');
  if (isCurrent && isPaused && !isClosed) actions.push('<button class="task-panel-action is-primary" data-resume-agent="' + escapeHtml(card.agent || "") + '" data-resume-task="' + escapeHtml(card.id) + '" type="button">▷ Resume</button>');
  if (!isCurrent) actions.push('<button class="task-panel-action" data-open-task="' + escapeHtml(card.id) + '" type="button">Open</button>');
  sections += '<div class="task-panel-card-actions">' + actions.join("") + "</div>";

  if (isCurrent) {
    const chatPicker = renderNextTargetPicker(card.agent || "", []);
    const chatTitle = card.headline ? String(card.headline).slice(0, 56) : "";
    sections +=
      '<div class="task-panel-rework task-panel-chat-form" data-chat-task-id="' + escapeHtml(card.id) + '" data-chat-parent-agent="' + escapeHtml(card.agent || "") + '" hidden>' +
      '<details class="task-panel-rework-warn"><summary>Continues on the worker\'s session thread.</summary><p>Chat opens on the same thread as the task worker, so the agent\'s prior context is in cache.</p></details>' +
      '<input type="text" class="task-panel-chat-title-input" placeholder="Chat title (auto if blank)" value="' + escapeHtml(chatTitle) + '" />' +
      '<textarea class="task-panel-chat-msg-input task-panel-unblock-input" rows="3" placeholder="Initial message (optional — staged into the chat input, send when ready)…"></textarea>' +
      '<div class="task-panel-unblock-actions">' + chatPicker +
      '<button type="button" class="is-primary task-panel-chat-submit">↳ Start chat</button>' +
      '<span class="task-panel-unblock-status task-panel-chat-status"></span></div></div>';
  }

  if (isCurrent && !isClaimed && !isClosed) {
    const defaultStatus = (statusLower === "done") ? "closed" : "cancelled";
    const activeCount = countActiveDescendants(card.id, cache);
    const closeWarnSum = isWaitingUser
      ? 'Record the outcome and mark <strong>cancelled</strong>.'
      : 'Marks <strong>' + defaultStatus + '</strong> — reversible, runner state kept.';
    const closeReasonPh = isWaitingUser
      ? 'What was the outcome? e.g. "decided to use approach B" — optional but helps trace decisions'
      : "Optional reason (e.g. 'rolled into TSK-X', 'no longer needed')…";
    sections +=
      '<div class="task-panel-close-form task-panel-rework" data-close-agent="' + escapeHtml(card.agent || "") + '" data-close-id="' + escapeHtml(card.id) + '" data-close-default-status="' + defaultStatus + '" hidden>' +
      '<details class="task-panel-rework-warn"><summary>' + closeWarnSum + '</summary></details>' +
      '<textarea class="task-panel-close-input task-panel-unblock-input" rows="2" placeholder="' + escapeHtml(closeReasonPh) + '"></textarea>' +
      (activeCount > 0 ? '<label class="task-panel-close-cascade"><input type="checkbox" class="task-panel-close-cascade-checkbox" /><span>Close family — cancel ' + activeCount + ' active descendant' + (activeCount === 1 ? "" : "s") + ' too</span></label>' : "") +
      '<div class="task-panel-unblock-actions"><button type="button" class="is-primary task-panel-close-submit">Confirm close</button>' +
      '<button type="button" class="task-panel-close-cancel">Dismiss</button>' +
      '<span class="task-panel-close-status task-panel-unblock-status"></span></div></div>';
  }

  if (isCurrent && isClaimed && !isClosed) {
    sections +=
      '<div class="task-panel-close-form task-panel-abort-form task-panel-rework" data-abort-agent="' + escapeHtml(card.agent || "") + '" data-abort-id="' + escapeHtml(card.id) + '" hidden>' +
      '<details class="task-panel-rework-warn task-panel-abort-warn"><summary><strong>⚠ Kills the live process. Not reversible.</strong></summary></details>' +
      '<textarea class="task-panel-close-input task-panel-abort-input task-panel-unblock-input" rows="2" placeholder="Optional reason…"></textarea>' +
      '<div class="task-panel-unblock-actions"><button type="button" class="is-primary task-panel-action-danger task-panel-abort-submit">Kill worker &amp; cancel</button>' +
      '<button type="button" class="task-panel-abort-cancel">Dismiss</button>' +
      '<span class="task-panel-abort-status task-panel-unblock-status"></span></div></div>';
  }

  let fileLinks = '<div class="task-panel-context-item">📄 <button data-open-file="' + escapeHtml(envelopePath) + '" data-from-task="' + escapeHtml(currentTaskId || "") + '" type="button">' + escapeHtml(envelopePath) + "</button></div>";
  if (card.reportPath) fileLinks += '<div class="task-panel-context-item">📄 <button data-open-file="' + escapeHtml(card.reportPath) + '" data-from-task="' + escapeHtml(currentTaskId || "") + '" type="button">' + escapeHtml(card.reportPath) + "</button></div>";
  sections += renderSection("Files", '<div class="task-panel-context-list">' + fileLinks + "</div>", false);
  if (ctxLines) sections += renderSection("Context (" + ctx.length + ")", '<div class="task-panel-context-list">' + ctxLines + "</div>", false);

  return '<div class="task-panel-card' + (isCurrent ? " is-current" : "") + '">' + metaHtml + sections + "</div>";
}

// ── Report pane ───────────────────────────────────────────────────────────

export function renderReportPane(card: TaskRow): string {
  if (!card || !card.reportPath) return "";
  const safeTaskId = escapeHtml(card.id || "");
  const allPaths = [card.reportPath];
  for (const d of card.deliverables || []) {
    if (d && !allPaths.includes(d)) allPaths.push(d);
  }
  function docNode(path: string, isActive: boolean, scanExtras: boolean): string {
    const fname = path.split("/").pop() || path;
    const folder = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : ".";
    const sp = escapeHtml(path);
    const sFolder = escapeHtml(folder);
    return (
      '<div class="task-panel-report-doc' + (isActive ? " is-active" : "") + '" data-doc-path="' + sp + '"' + (isActive ? "" : " hidden") + ">" +
      '<div class="task-panel-report-doc-head"><span class="task-panel-report-doc-title">' + escapeHtml(fname) + "</span>" +
      '<button class="task-panel-folder-btn" data-open-folder="' + sFolder + '" data-from-task="' + safeTaskId + '" type="button" title="Open containing folder" aria-label="Open containing folder">📁</button></div>' +
      '<div class="task-panel-report" data-report-path="' + sp + '" data-loaded="false"' + (scanExtras ? ' data-scan-extras="true"' : "") + ">" +
      '<div class="task-panel-report-loading">Loading report…</div></div></div>'
    );
  }
  const docsHtml = allPaths.map((p, i) => docNode(p, i === 0, i === 0)).join("");
  const pillsHidden = allPaths.length <= 1;
  const pillsHtml = pillsHidden ? "" : allPaths.map((p, i) =>
    '<button class="task-panel-doc-pill' + (i === 0 ? " is-active" : "") + '" data-doc-pill="' + escapeHtml(p) + '" type="button">' + escapeHtml(p.split("/").pop() || p) + "</button>"
  ).join("");
  return (
    '<div class="task-panel-report-pane" data-task-id="' + safeTaskId + '">' +
    '<div class="task-panel-doc-pills"' + (pillsHidden ? " hidden" : "") + ">" + pillsHtml + "</div>" +
    '<div class="task-panel-report-docs">' + docsHtml + "</div></div>"
  );
}

// ── Report path resolver (MUST survive intact — reading-pane depends on this) ──

const KNOWN_TOP_DIRS = ["Notes", "agents", "repos", "setup", "memory", ".claude", "src", "scripts", "plugin-cache"];

export function resolveReportPath(primaryPath: string, href: string): string | null {
  if (!href) return null;
  let clean = href.split("#")[0].split("?")[0];
  if (!clean) return null;
  if (/^https?:/i.test(clean) || clean.startsWith("mailto:")) return null;
  if (clean.charAt(0) === "/") clean = clean.replace(/^\/+/, "");
  const parts = clean.split("/");
  for (let k = parts.length - 1; k >= 0; k--) {
    if (KNOWN_TOP_DIRS.includes(parts[k]) && k < parts.length - 1) return parts.slice(k).join("/");
  }
  const lead = clean.replace(/^\.\//, "");
  const primaryDir = primaryPath.includes("/") ? primaryPath.substring(0, primaryPath.lastIndexOf("/")) : "";
  const baseParts = primaryDir.split("/").filter(Boolean);
  for (const p of lead.split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") { if (!baseParts.length) return null; baseParts.pop(); continue; }
    baseParts.push(p);
  }
  return baseParts.length ? baseParts.join("/") : null;
}

// ── Extra doc discovery ───────────────────────────────────────────────────

export function appendReportExtras(primaryNode: HTMLElement): void {
  const primaryPath = primaryNode.getAttribute("data-report-path") || "";
  const doc = primaryNode.closest(".task-panel-report-doc");
  if (!doc) return;
  const pane = doc.closest(".task-panel-report-pane");
  if (!pane) return;
  const docsHost = pane.querySelector<HTMLElement>(".task-panel-report-docs");
  const pills = pane.querySelector<HTMLElement>(".task-panel-doc-pills");
  if (!docsHost || !pills) return;

  const seen: Record<string, boolean> = { [primaryPath]: true };
  const anchors = primaryNode.querySelectorAll<HTMLAnchorElement>(".task-panel-report-md a[href]");
  const paths: string[] = [];
  for (const a of Array.from(anchors)) {
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#")) continue;
    const resolved = resolveReportPath(primaryPath, href);
    if (!resolved) continue;
    if (!/\.(md|markdown|pdf|docx|csv|txt|ya?ml|json)$/i.test(resolved)) continue;
    a.setAttribute("href", "#" + resolved);
    a.setAttribute("data-open-file", resolved);
    if (seen[resolved]) continue;
    seen[resolved] = true;
    paths.push(resolved);
  }
  if (!paths.length) return;

  for (const path of paths) {
    const fname = path.split("/").pop() || path;
    const folder = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : ".";
    const node = document.createElement("div");
    node.className = "task-panel-report-doc";
    node.setAttribute("data-doc-path", path);
    node.hidden = true;
    node.innerHTML =
      '<div class="task-panel-report-doc-head"><span class="task-panel-report-doc-title">' + escapeHtml(fname) + "</span>" +
      '<button class="task-panel-folder-btn" data-open-folder="' + escapeHtml(folder) + '" type="button" title="Open containing folder" aria-label="Open containing folder">📁</button></div>' +
      '<div class="task-panel-report" data-report-path="' + escapeHtml(path) + '" data-loaded="false"><div class="task-panel-report-loading">Loading…</div></div>';
    docsHost.appendChild(node);
  }

  const allPaths = [primaryPath, ...paths];
  pills.innerHTML = allPaths.map((p, i) =>
    '<button class="task-panel-doc-pill' + (i === 0 ? " is-active" : "") + '" data-doc-pill="' + escapeHtml(p) + '" type="button">' + escapeHtml(p.split("/").pop() || p) + "</button>"
  ).join("");
  pills.hidden = false;

  for (const reportEl of Array.from(docsHost.querySelectorAll<HTMLElement>(".task-panel-report-doc:not(.is-active) .task-panel-report"))) {
    loadReportNode(reportEl);
  }
}

export function setActiveReportDoc(pane: Element | null, path: string): void {
  if (!pane || !path) return;
  pane.querySelectorAll(".task-panel-report-doc").forEach(d => {
    const match = d.getAttribute("data-doc-path") === path;
    d.classList.toggle("is-active", match);
    (d as HTMLElement).hidden = !match;
  });
  pane.querySelectorAll(".task-panel-doc-pill").forEach(p => {
    p.classList.toggle("is-active", p.getAttribute("data-doc-pill") === path);
  });
}

// ── Lazy report loader ────────────────────────────────────────────────────

export function loadReportNode(node: HTMLElement): void {
  if (!node || node.getAttribute("data-loaded") !== "false") return;
  node.setAttribute("data-loaded", "loading");
  node.innerHTML = '<div class="task-panel-report-loading">Loading report…</div>';
  const path = node.getAttribute("data-report-path") || "";
  fetch("/api/files/read?path=" + encodeURIComponent(path), { cache: "no-store" })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) throw new Error(data.error || "failed");
      node.setAttribute("data-loaded", "true");
      if (data.markdown) {
        const raw = data.content || "";
        const { body } = stripFrontmatter(raw);
        const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
        const fmHtml = fmMatch ? '<pre class="task-panel-report-frontmatter">' + escapeHtml(fmMatch[1]) + "</pre>" : "";
        node.innerHTML = fmHtml + '<div class="task-panel-report-md files-md">' + renderMarkdown(body) + "</div>";
      } else {
        const pre = document.createElement("pre");
        pre.className = "task-panel-report-raw";
        pre.textContent = data.content;
        node.innerHTML = "";
        node.appendChild(pre);
      }
      if (node.getAttribute("data-scan-extras") === "true") appendReportExtras(node);
    })
    .catch(err => {
      node.setAttribute("data-loaded", "false");
      node.innerHTML = '<div class="task-panel-report-loading is-error">Error: ' + escapeHtml(String((err as Error).message || err)) + "</div>";
    });
}
