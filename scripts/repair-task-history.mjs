#!/usr/bin/env node
// One-shot repair for legacy envelopes with mangled history blocks.
//
// The pre-fix appendHistory regex (`/^history:\s*\n?/m`) ate into the next
// list item's leading indent, then the replacement re-prefixed two spaces,
// accumulating an extra indent level per transition and stripping the next
// item's. Result: `- ts:` flush left and bodies at 4 spaces — broken YAML
// that line-oriented parsers tolerate but js-yaml rejects.
//
// Strategy: walk every history block, tokenise on the leading `-` (any
// indent), normalise to canonical 2-space dash + 4-space body fields, then
// verify the rewritten file round-trips through js-yaml. Files that already
// parse cleanly are left untouched.

import { load as yamlLoad } from "js-yaml";
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.argv[2] ?? join(process.cwd(), "agents");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && p.endsWith(".yaml")) out.push(p);
  }
  return out;
}

function tryParse(text) {
  try {
    yamlLoad(text);
    return true;
  } catch {
    return false;
  }
}

function repairHistoryBlock(text) {
  const lines = text.split("\n");

  // Find `history:` line and the next top-level key after it.
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^history:\s*$/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*:/.test(lines[i])) {
      end = i;
      break;
    }
  }

  // Tokenise the history body into entries. Each entry starts on the first
  // line containing `- ts:` (any indent). Everything between two such lines
  // is the entry's body (from/to/by/note).
  const body = lines.slice(start + 1, end);
  const entries = [];
  let cur = null;
  for (const raw of body) {
    if (raw.trim() === "") continue;
    const dashMatch = raw.match(/^\s*-\s*ts:\s*(.*)$/);
    if (dashMatch) {
      if (cur) entries.push(cur);
      cur = { ts: dashMatch[1].trim(), fields: {} };
      continue;
    }
    if (!cur) continue; // stray line before first dash
    const fieldMatch = raw.match(/^\s*([a-z_]+):\s*(.*)$/);
    if (fieldMatch) cur.fields[fieldMatch[1]] = fieldMatch[2].trim();
  }
  if (cur) entries.push(cur);
  if (entries.length === 0) return null;

  // Rebuild the block with canonical indentation.
  const rebuilt = ["history:"];
  for (const e of entries) {
    rebuilt.push(`  - ts: ${e.ts}`);
    for (const k of ["from", "to", "by", "note"]) {
      if (e.fields[k] !== undefined) rebuilt.push(`    ${k}: ${e.fields[k]}`);
    }
  }
  return [...lines.slice(0, start), ...rebuilt, ...lines.slice(end)].join("\n");
}

const files = walk(ROOT);
let okCount = 0;
let repaired = 0;
let stillBad = 0;
const failures = [];

for (const f of files) {
  const original = readFileSync(f, "utf-8");
  if (tryParse(original)) {
    okCount++;
    continue;
  }
  const fixed = repairHistoryBlock(original);
  if (!fixed) {
    stillBad++;
    failures.push({ file: f, reason: "no history block found" });
    continue;
  }
  if (!tryParse(fixed)) {
    stillBad++;
    failures.push({ file: f, reason: "still unparseable after repair" });
    continue;
  }
  writeFileSync(f, fixed);
  repaired++;
  console.log("repaired:", relative(ROOT, f));
}

console.log("---");
console.log("total:", files.length, "already-ok:", okCount, "repaired:", repaired, "still-bad:", stillBad);
for (const fail of failures) console.log("  FAIL", relative(ROOT, fail.file), "→", fail.reason);
