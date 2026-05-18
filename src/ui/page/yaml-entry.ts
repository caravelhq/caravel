import { load } from "js-yaml";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Render a parsed YAML value to HTML. Recursive — emits a tree of <div>s with
// classes the stylesheet picks up. Long string values render as block scalars
// (preserved newlines); short ones inline next to their key.
function renderValue(value: unknown, depth: number): string {
  if (value === null || value === undefined) {
    return '<span class="yaml-null">null</span>';
  }
  if (typeof value === "boolean") {
    return `<span class="yaml-bool">${value}</span>`;
  }
  if (typeof value === "number") {
    return `<span class="yaml-num">${value}</span>`;
  }
  if (typeof value === "string") {
    if (value.includes("\n")) {
      return `<pre class="yaml-block">${escapeHtml(value)}</pre>`;
    }
    return `<span class="yaml-str">${escapeHtml(value)}</span>`;
  }
  // js-yaml's load() auto-parses ISO-8601 timestamp strings into JavaScript
  // Date instances (YAML 1.1 timestamp tag). Without this branch, Date
  // objects fall through to renderObject (they pass typeof === "object"
  // and !Array.isArray) where Object.entries(date) returns [], so every
  // timestamp in the envelope renders as `{}`. Restore the ISO string.
  if (value instanceof Date) {
    if (Number.isFinite(value.getTime())) {
      return `<span class="yaml-str">${escapeHtml(value.toISOString())}</span>`;
    }
    return '<span class="yaml-null">invalid date</span>';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="yaml-empty">[]</span>';
    const items = value
      .map((item) => {
        if (isPlainObject(item) || Array.isArray(item)) {
          return `<li class="yaml-item">${renderValue(item, depth + 1)}</li>`;
        }
        return `<li class="yaml-item">${renderValue(item, depth + 1)}</li>`;
      })
      .join("");
    return `<ul class="yaml-array">${items}</ul>`;
  }
  if (isPlainObject(value)) {
    return renderObject(value, depth + 1);
  }
  return `<span class="yaml-str">${escapeHtml(String(value))}</span>`;
}

function renderStatusPill(value: string): string {
  const lower = value.toLowerCase();
  let cls = "yaml-status-open";
  if (lower === "done") cls = "yaml-status-done";
  else if (lower.startsWith("failed")) cls = "yaml-status-failed";
  else if (lower.startsWith("waiting")) cls = "yaml-status-waiting";
  else if (lower === "claimed") cls = "yaml-status-claimed";
  return `<span class="yaml-status ${cls}">${escapeHtml(value)}</span>`;
}

function renderObject(obj: Record<string, unknown>, depth: number): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return '<span class="yaml-empty">{}</span>';
  const rows = entries
    .map(([key, value]) => {
      const keyHtml = `<span class="yaml-key">${escapeHtml(key)}</span>`;
      const isComplex =
        isPlainObject(value) ||
        (Array.isArray(value) && value.length > 0) ||
        (typeof value === "string" && value.includes("\n"));
      // Special-case: render the `status:` field as a coloured pill.
      if (key === "status" && typeof value === "string" && !isComplex) {
        return `<div class="yaml-row yaml-row-simple" data-depth="${depth}">${keyHtml}<span class="yaml-colon">:</span> ${renderStatusPill(value)}</div>`;
      }
      if (isComplex) {
        return `<div class="yaml-row yaml-row-complex" data-depth="${depth}"><div class="yaml-key-line">${keyHtml}<span class="yaml-colon">:</span></div><div class="yaml-value-block">${renderValue(value, depth)}</div></div>`;
      }
      return `<div class="yaml-row yaml-row-simple" data-depth="${depth}">${keyHtml}<span class="yaml-colon">:</span> ${renderValue(value, depth)}</div>`;
    })
    .join("");
  return `<div class="yaml-object">${rows}</div>`;
}

(globalThis as any).yamlRender = (src: string): string => {
  if (!src) return "";
  try {
    const parsed = load(src);
    if (parsed === null || parsed === undefined) {
      return '<div class="yaml-empty">empty document</div>';
    }
    if (isPlainObject(parsed) || Array.isArray(parsed)) {
      return `<div class="yaml-doc">${renderValue(parsed, 0)}</div>`;
    }
    return `<div class="yaml-doc">${renderValue(parsed, 0)}</div>`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<div class="yaml-error">YAML parse error: ${escapeHtml(msg)}</div><pre class="yaml-raw">${escapeHtml(src)}</pre>`;
  }
};
