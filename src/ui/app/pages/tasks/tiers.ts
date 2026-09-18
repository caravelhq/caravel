// tiers.ts — attention tier rendering for the Tasks page sidebar.
// Ported from client.js:5688–5785.

import { escapeHtml, shorten } from "./helpers";
import type { AttentionTiers, AttentionTierRow } from "../../stores/attention";

function shortId(id: string): string {
  return String(id || "").replace(/^TSK-\d{4}-/, "");
}

function tierRow(rowCls: string, row: AttentionTierRow, showCheckbox: boolean): string {
  const full = escapeHtml(row.id || "");
  const shrt = escapeHtml(shortId(row.id));
  const headline = escapeHtml(row.headline || row.id || "");
  const label = escapeHtml(shorten(row.label || row.headline || row.id || "", 120));
  const checkbox = showCheckbox
    ? '<input type="checkbox" class="tier-report-select current-row-select" data-task-id="' + full + '" data-task-agent="' + escapeHtml(row.agent || "") + '" aria-label="Select ' + full + '" />'
    : "";
  return (
    '<div class="tasks-tier-row ' + rowCls + '" data-open-task="' + full + '" title="' + full + " — " + headline + '">' +
    checkbox +
    '<span class="tasks-tier-id">' + shrt + "</span>" +
    '<span class="tasks-tier-label">' + label + "</span>" +
    "</div>"
  );
}

function renderTierSection(
  tier: { count: number; rows: AttentionTierRow[] } | undefined,
  headCls: string, rowCls: string, glyph: string, verb: string, showCheckbox: boolean
): string {
  const count = (tier && tier.count) || 0;
  const rows = (tier && tier.rows) || [];
  const selectAll = (showCheckbox && count > 0)
    ? '<input type="checkbox" class="tier-report-select-all current-group-select-all" title="Select all reports" />'
    : "";
  let h = '<div class="tasks-tier-head ' + headCls + '">' + selectAll + glyph + " " + verb + " (" + count + ")</div>";
  for (const row of rows) {
    h += tierRow(rowCls, row, showCheckbox);
  }
  if (count > rows.length) {
    h += '<div class="tasks-tier-more">+ ' + (count - rows.length) + " more — open Tasks to see all</div>";
  }
  return h;
}

export function renderAttentionTiers(el: HTMLElement, tiers: AttentionTiers | null): void {
  if (!el) return;
  if (!tiers) {
    el.hidden = true;
    return;
  }
  let html = "";
  // Precedence: Unclassified → Failed → Blocked → Paused → Reports
  html += renderTierSection(tiers.unclassified, "tasks-tier-head-unclassified", "tasks-tier-row-unclassified", "⚠", "Unclassified", false);
  html += renderTierSection(tiers.failed,       "tasks-tier-head-failed",       "tasks-tier-row-failed",       "✗", "Triage",       false);
  html += renderTierSection(tiers.blocked,      "tasks-tier-head-blocked",      "tasks-tier-row-blocked",      "⊘", "Unblock",      false);
  html += renderTierSection(tiers.paused,       "tasks-tier-head-paused",       "tasks-tier-row-paused",       "⏸", "Paused",       false);
  html += renderTierSection(tiers.reports,      "tasks-tier-head-reports",      "tasks-tier-row-reports",      "▶", "Read",         true);
  el.innerHTML = html;
  el.hidden = (html === "");
}
