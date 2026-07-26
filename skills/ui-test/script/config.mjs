#!/usr/bin/env node
// config.mjs — shared loader for the ui-test skill's runtime configuration.
//
// Source of truth is `.claude/config.json` at the repo root under the `ui-test`
// key, shaped per-app:
//
//   "ui-test": {
//     "<appKey>": {
//       "run": "npm run dev",                // command to start the app (optional)
//       "cwd": ".",                          // dir to run it in (optional; default repo root)
//       "url": "http://localhost:3000/",     // app URL the tests drive
//       "credentials": [                     // login accounts
//         { "name": "Dev1", "email": "...", "password": "...", "roles": ["editor"] }
//       ]
//     }
//   }
//
// config/apps.json remains a fallback for the URL + viewport defaults when no
// config entry exists for an app. Prefer sourcing passwords from environment
// variables rather than committing them.
//
// CLI:
//   node config.mjs url <appKey>   -> prints the configured URL (empty if none)
//   node config.mjs run <appKey>   -> prints the configured run command
//   node config.mjs cwd <appKey>   -> prints the configured cwd
//   node config.mjs has <appKey>   -> prints "1" if an app config exists

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .claude/skills/ui-test/script -> repo root is four levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

export function repoRoot() {
  return REPO_ROOT;
}

export function loadUiTestConfig() {
  const p = path.join(REPO_ROOT, '.claude', 'config.json');
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j['ui-test'] || {};
  } catch {
    return {};
  }
}

export function appConfig(appKey) {
  return loadUiTestConfig()[appKey] || null;
}

// Pick a credential for a persona/role selector. Matches, in order:
//   1. credential `name` (case-insensitive),
//   2. membership in `roles`,
//   3. first credential as a default.
export function selectCredential(appCfg, selector) {
  const creds = appCfg?.credentials || [];
  if (creds.length === 0) return null;
  if (selector) {
    const sel = String(selector).toLowerCase();
    const byName = creds.find(c => String(c.name || '').toLowerCase() === sel);
    if (byName) return byName;
    const byRole = creds.find(c => (c.roles || []).some(r => String(r).toLowerCase() === sel));
    if (byRole) return byRole;
  }
  return creds[0];
}

// --- CLI ------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , cmd, appKey] = process.argv;
  const cfg = appConfig(appKey);
  let out = '';
  switch (cmd) {
    case 'url': out = cfg?.url || ''; break;
    case 'run': out = cfg?.run || ''; break;
    case 'cwd': out = cfg?.cwd || ''; break;
    case 'has': out = cfg ? '1' : ''; break;
    default: process.stderr.write(`config.mjs: unknown command "${cmd}"\n`); process.exit(2);
  }
  process.stdout.write(out);
}
