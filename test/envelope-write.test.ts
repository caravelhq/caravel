/**
 * Tests for src/envelope/write.ts (WAL-123 Phase A, step 2).
 *
 * T1: yamlLine quote rule — colons unquoted, newlines/leading-space/empty/leading-quote quoted
 * T2: ISO deadline round-trips through yamlLine + extractFrontmatter without being double-quoted
 * T3: writeAtomic creates temp file then renames (no half-written file visible)
 * T4: buildFrontmatter produces a valid frontmatter block readable by extractFrontmatter
 *
 * Run with: bun run test/envelope-write.test.ts
 */

import { mkdtemp, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { yamlLine, writeAtomic, buildFrontmatter } from "../src/envelope/write";

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, extra?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${extra ? `\n    ${extra}` : ""}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(actual)}`);
    failed++;
  }
}

// Minimal extractFrontmatter replica (same logic as multiAgent.ts — testing round-trip)
function extractFrontmatter(content: string): Record<string, string> | null {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  if (!m) return null;
  const block = m[1]!;
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2]!.trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[kv[1]!] = value;
  }
  return out;
}

// ── T1: quote rule ────────────────────────────────────────────────────────────

console.log("envelope-write (WAL-123 Phase A)");
console.log("\nT1 — yamlLine quote rule:");

// Plain values: no quoting
assertEqual(yamlLine("status", "done"), "status: done", "plain value unquoted");
assertEqual(yamlLine("reason", "budget"), "reason: budget", "plain reason unquoted");

// Colons: must NOT be quoted (ISO timestamps must stay readable)
const iso = "2026-10-18T09:34:39.827Z";
const isoLine = yamlLine("deadline", iso);
assertEqual(isoLine, `deadline: ${iso}`, "ISO deadline not quoted");
assert(!isoLine.includes('"'), "ISO deadline line has no quotes");

// Empty value: quoted
const emptyLine = yamlLine("summary", "");
assert(emptyLine.includes('"'), `empty value quoted: ${emptyLine}`);

// Leading/trailing space: quoted
const spaceLine = yamlLine("watch", "  has spaces  ");
assert(spaceLine.includes('"'), `leading/trailing space quoted: ${spaceLine}`);

// Newline: quoted
const newlineLine = yamlLine("body", "line1\nline2");
assert(newlineLine.includes('"'), `newline value quoted: ${newlineLine}`);

// Value starting with a quote: double-wrapped
const quotedStart = yamlLine("headline", '"already quoted"');
assert(quotedStart.includes('\\"'), `value starting with quote is escaped: ${quotedStart}`);

// Null/undefined: treated as empty (quoted)
const nullLine = yamlLine("field", null as unknown as string);
assert(nullLine.includes('"'), `null treated as empty (quoted): ${nullLine}`);

// ── T2: ISO deadline round-trip ───────────────────────────────────────────────

console.log("\nT2 — ISO deadline round-trip through buildFrontmatter + extractFrontmatter:");

const deadline = "2026-10-18T15:30:00.000Z";
const fm = buildFrontmatter({
  status: "waiting",
  waiting_on: "script",
  deadline,
  summary: "test park",
});

const parsed = extractFrontmatter(fm);
assert(parsed !== null, "frontmatter parses");
assertEqual(parsed?.["deadline"] ?? "", deadline, `deadline round-trips exactly: ${deadline}`);
assertEqual(parsed?.["status"] ?? "", "waiting", "status round-trips");
assertEqual(parsed?.["waiting_on"] ?? "", "script", "waiting_on round-trips");

// ── T3: writeAtomic atomicity ─────────────────────────────────────────────────

console.log("\nT3 — writeAtomic uses temp-file-plus-rename:");

const tmp = await mkdtemp(join(tmpdir(), "write-test-"));
const dest = join(tmp, "test.md");
const content = "---\nstatus: done\n---\n\nbody\n";

writeAtomic(dest, content);

assert(existsSync(dest), "destination file exists after writeAtomic");
// No temp file should remain
const entries = (await import("fs")).readdirSync(tmp);
const tmpFiles = entries.filter((f: string) => f.startsWith("test.md.tmp-"));
assert(tmpFiles.length === 0, `no temp files remain (found: ${tmpFiles.join(", ")})`);

const written = await readFile(dest, "utf8");
assertEqual(written, content, "written content matches");

// ── T4: buildFrontmatter produces readable block ──────────────────────────────

console.log("\nT4 — buildFrontmatter produces extractFrontmatter-readable block:");

const fields = {
  status: "done",
  summary: "completed the task",
  reason: undefined,
  report_path: "agents/bob/tasks/done/TSK-123.md",
};

const block = buildFrontmatter(fields);
const fm2 = extractFrontmatter(block);

assert(fm2 !== null, "buildFrontmatter output parses");
assertEqual(fm2?.["status"] ?? "", "done", "status field");
assertEqual(fm2?.["summary"] ?? "", "completed the task", "summary field");
// undefined fields are written as empty strings, then quoted
assert("reason" in (fm2 ?? {}), "undefined field is still written");
assertEqual(fm2?.["report_path"] ?? "", "agents/bob/tasks/done/TSK-123.md", "path field");

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
