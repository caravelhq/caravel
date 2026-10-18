/**
 * Frontmatter writer for task-envelope rendezvous files.
 *
 * Paired with extractFrontmatter (multiAgent.ts) — quote rule must stay in sync.
 *
 * Quote rule (ported verbatim from task-callback/script/callback.mjs):
 *   Quote only: newlines, leading/trailing space, empty values, values starting with a quote.
 *   Colons stay unquoted — an ISO deadline remains readable. This is deliberate: the
 *   first version quoted colons and only worked because extractFrontmatter happens to strip
 *   one layer of surrounding double-quotes.
 *
 * Nothing here pins paths at module load time.
 */

import { mkdirSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";

/** Render one YAML frontmatter line, applying the quote rule. */
export function yamlLine(key: string, value: string | undefined | null): string {
  const s = String(value ?? "");
  const needsQuote =
    /\n/.test(s) || s.trim() !== s || s === "" || /^["']/.test(s);
  if (needsQuote) {
    return `${key}: "${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return `${key}: ${s}`;
}

/** Write text atomically via temp-file-plus-rename. Never leaves a half-written file. */
export function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

/** Build a YAML frontmatter block from a flat key→value map. */
export function buildFrontmatter(fields: Record<string, string | undefined | null>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(yamlLine(key, value));
  }
  lines.push("---", "");
  return lines.join("\n");
}
