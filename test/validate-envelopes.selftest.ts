/**
 * Self-test for scripts/validate-envelopes.ts (WAL-79 guard).
 *
 * The validator is itself a test — but nothing tested the validator. After the
 * 29-unparseable-envelope incident it became load-bearing, so it needs a proof
 * that (a) it passes a clean tree and (b) it fails loudly on a corrupt one,
 * naming the file. Spawns the script as a subprocess against fixture trees.
 *
 * Run with: bun run test/validate-envelopes.selftest.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "validate-envelopes.ts");

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, extra?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${extra ? `\n    ${extra}` : ""}`);
    failed++;
  }
}

async function runValidator(agentsDir: string) {
  const proc = Bun.spawn(["bun", "run", SCRIPT, "--agents-dir", agentsDir], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

// ── case 1: clean tree → exit 0 ──────────────────────────────────────────────

console.log("\nclean tree — validator passes:");

{
  const root = await mkdtemp(join(tmpdir(), "caravel-ve-clean-"));
  try {
    await mkdir(join(root, "alice", "tasks", "open"), { recursive: true });
    await mkdir(join(root, "bob", "tasks", "done"), { recursive: true });
    await writeFile(
      join(root, "alice", "tasks", "open", "TSK-ok-0001.yaml"),
      "id: TSK-ok-0001\nheadline: Fine\nstatus: open\n"
    );
    await writeFile(
      join(root, "bob", "tasks", "done", "TSK-ok-0002.yaml"),
      "id: TSK-ok-0002\nheadline: Also fine\nstatus: done\n"
    );

    const { stdout, exitCode } = await runValidator(root);
    assert(exitCode === 0, "exit 0 on clean tree", `exit=${exitCode}`);
    assert(stdout.includes("2 envelopes"), "reports the envelope count", stdout.trim());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// ── case 2: corrupt tree → exit 1, naming the bad file ───────────────────────

console.log("\ncorrupt tree — validator fails and names the file:");

{
  const root = await mkdtemp(join(tmpdir(), "caravel-ve-bad-"));
  try {
    await mkdir(join(root, "alice", "tasks", "open"), { recursive: true });
    await writeFile(
      join(root, "alice", "tasks", "open", "TSK-good.yaml"),
      "id: TSK-good\nheadline: Fine\nstatus: open\n"
    );
    // The WAL-79 shape: an unquoted colon in a scalar value.
    await writeFile(
      join(root, "alice", "tasks", "open", "TSK-bad.yaml"),
      "id: TSK-bad\nheadline: Continue: Re-run suite\nstatus: open\n"
    );

    const { stderr, exitCode } = await runValidator(root);
    assert(exitCode === 1, "exit 1 on corrupt tree", `exit=${exitCode}`);
    assert(
      stderr.includes("TSK-bad.yaml"),
      "output names the corrupt file",
      stderr.trim()
    );
    assert(
      !stderr.includes("TSK-good.yaml"),
      "does not flag the clean file",
      stderr.trim()
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// ── case 3: an unknown bucket dir is simply not scanned (no crash) ───────────

console.log("\nmissing agents dir — clean exit, no crash:");

{
  const root = await mkdtemp(join(tmpdir(), "caravel-ve-empty-"));
  try {
    // No agents/ subdir at all — validator treats it as zero envelopes.
    const { stdout, exitCode } = await runValidator(root);
    assert(exitCode === 0, "exit 0 when nothing to scan", `exit=${exitCode}`);
    assert(stdout.includes("0 envelopes"), "reports zero envelopes", stdout.trim());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
