#!/usr/bin/env node
// run.mjs — execute one or more authored spec files and aggregate a report.
//
// Each spec is a standalone .mjs that calls runTest(); running a spec is just
// `node <spec>`. This runner spawns each spec as its own node process (so a
// crash in one doesn't take down the batch), points it at a shared --out dir,
// collects the per-test result JSON, and writes report.md.
//
// Usage:
//   node run.mjs --out <dir> <spec.mjs> [<spec2.mjs> ...]
//   node run.mjs --out <dir> --dir <specsDir>     # run every *.mjs in a dir
//
// Zero model calls. The agent's work is authoring the specs; this just runs them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { out: null, specs: [], dir: null, headed: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--out') a.out = argv[++i];
    else if (k === '--dir') a.dir = argv[++i];
    else if (k === '--headed') a.headed = true;
    else a.specs.push(k);
  }
  return a;
}

const args = parseArgs(process.argv);
if (!args.out) { console.error('run.mjs: --out <dir> is required'); process.exit(2); }
if (args.dir) {
  for (const f of fs.readdirSync(args.dir)) {
    if (f.endsWith('.mjs') && !f.startsWith('_')) args.specs.push(path.join(args.dir, f));
  }
}
if (args.specs.length === 0) { console.error('run.mjs: no specs to run (pass spec files or --dir)'); process.exit(2); }

fs.mkdirSync(path.join(args.out, 'results'), { recursive: true });

const results = [];
for (const spec of args.specs) {
  console.log(`\n=== Running ${path.basename(spec)} ===`);
  const childArgs = [spec, '--out', args.out];
  if (args.headed) childArgs.push('--headed');
  const r = spawnSync('node', childArgs, {
    stdio: 'inherit',
    env: { ...process.env, UI_TEST_OUT: args.out },
  });
  results.push({ spec, exitCode: r.status });
}

// Collect every per-test result JSON written under results/.
const resultsDir = path.join(args.out, 'results');
const records = fs.readdirSync(resultsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')))
  .sort((a, b) => (a.test_id ?? 0) - (b.test_id ?? 0));

writeReport(args.out, records);
const passed = records.filter(r => r.status === 'pass').length;
console.log(`\nReport: ${path.join(args.out, 'report.md')}  (${passed}/${records.length} passed)`);
process.exitCode = records.every(r => r.status === 'pass') ? 0 : 1;

function writeReport(outDir, recs) {
  const lines = [];
  lines.push(`# UI Test Run (script engine)`, '');
  lines.push(`- Finished: ${new Date().toISOString()}`);
  if (recs[0]) lines.push(`- App: ${recs[0].app} — ${recs[0].url}`);
  lines.push('');
  const summary = recs.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  lines.push('## Summary', '', Object.entries(summary).map(([k, v]) => `- **${k}**: ${v}`).join('\n'), '');
  for (const r of recs) {
    lines.push(`## Test ${r.test_id} — ${r.test_name}`, '');
    lines.push(`Status: **${r.status}** · ${r.duration_ms} ms`);
    if (r.summary) lines.push('', r.summary);
    if (r.steps?.length) {
      lines.push('', '| # | Step | Status | Observation |', '|---|---|---|---|');
      for (const s of r.steps) {
        lines.push(`| ${s.n} | ${esc(s.name)} | ${s.status} | ${esc(s.observation).slice(0, 200)} |`);
      }
    }
    if (r.console_errors?.length) lines.push('', `Console errors: ${r.console_errors.length}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n'));
}

function esc(s) { return String(s || '').replace(/\|/g, '\\|'); }
