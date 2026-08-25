#!/usr/bin/env bun
/**
 * Validate all task envelopes under agents/(agent)/tasks/(bucket)/(id).yaml.
 *
 * Reports any that fail strict js-yaml parsing and exits non-zero if any are
 * found. Cheap regression guard — Alice used an ad-hoc version of this to
 * locate the 57 corrupted envelopes in 2026-08 (WAL-63 follow-up).
 *
 * Run from the workspace root:
 *   bun repos/caravel/scripts/validate-envelopes.ts [--agents-dir /path/to/agents]
 */

import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { load as yamlLoad } from "js-yaml";

const args = process.argv.slice(2);
const flagIdx = args.indexOf("--agents-dir");
const AGENTS_DIR = flagIdx >= 0 ? args[flagIdx + 1]! : join(process.cwd(), "agents");

if (!existsSync(AGENTS_DIR)) {
  console.error(`agents dir not found: ${AGENTS_DIR}`);
  process.exit(1);
}

const BUCKETS = ["open", "waiting", "done", "failed", "archived", "scheduled"];

let total = 0;
let failures = 0;
const bad: string[] = [];

const agents = await readdir(AGENTS_DIR).catch(() => [] as string[]);
for (const agent of agents) {
  for (const bucket of BUCKETS) {
    const dir = join(AGENTS_DIR, agent, "tasks", bucket);
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".yaml"));
    for (const f of files) {
      total++;
      const filePath = join(dir, f);
      const content = await readFile(filePath, "utf-8").catch(() => null);
      if (content === null) {
        failures++;
        const rel = `${agent}/tasks/${bucket}/${f}`;
        bad.push(`${rel}: (could not read file)`);
        continue;
      }
      try {
        const doc = yamlLoad(content);
        if (!doc || typeof doc !== "object") {
          failures++;
          bad.push(`${agent}/tasks/${bucket}/${f}: parsed as non-object (${typeof doc})`);
        }
      } catch (e) {
        failures++;
        bad.push(`${agent}/tasks/${bucket}/${f}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  }
}

if (failures === 0) {
  console.log(`✓ All ${total} envelopes parse cleanly.`);
  process.exit(0);
} else {
  console.error(`✗ ${failures}/${total} envelopes failed strict YAML parsing:\n`);
  for (const line of bad) {
    console.error(`  ${line}`);
  }
  process.exit(1);
}
