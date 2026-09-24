#!/usr/bin/env node
// Fixture stub for knowledge CLI — used by K4 mutation proof.
// Called by BridgeKnowledge.mark() via runCli() as:
//   node knowledge.mjs mark <node> <verdict> [--json]
// Writes a NDJSON entry to $KNOWLEDGE_ROOT/.caravel/knowledge-ratings.ndjson
// so K4 can assert the server-side mark path was exercised.

import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

const argv = process.argv.slice(2); // strip node + script path
const cmd = argv[0];

if (cmd === "mark") {
  const node = argv[1] ?? "";
  const verdict = argv[2] ?? "";
  const root = process.env.KNOWLEDGE_ROOT || process.cwd();
  const dir = join(root, ".caravel");
  mkdirSync(dir, { recursive: true });
  const entry = JSON.stringify({ ts: new Date().toISOString(), node, verdict });
  appendFileSync(join(dir, "knowledge-ratings.ndjson"), entry + "\n");
  if (argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ ok: true }) + "\n");
  }
}

process.exit(0);
