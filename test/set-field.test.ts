/**
 * Regression tests for setField / setNestedField YAML corruption (WAL-63 fix).
 *
 * Verifies that writing a scalar value over a block-mapping key (or adding a
 * nested field under a scalar/flow parent) produces output that parses cleanly
 * under strict js-yaml — no orphaned indented children.
 *
 * Run with: bun run test/set-field.test.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import { load as yamlLoad } from "js-yaml";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// chdir to a tmpdir so multiAgent's module-level AGENTS_DIR resolves cleanly.
const testDir = await mkdtemp(join(tmpdir(), "caravel-setfield-"));
process.chdir(testDir);

const ma = (await import("../src/multiAgent.ts")) as {
  __testing: {
    setField: (yaml: string, key: string, value: string) => string;
    setNestedField: (yaml: string, parent: string, key: string, value: string) => string;
  };
};
const { setField, setNestedField } = ma.__testing;

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

function assertParseable(yaml: string, label: string) {
  try {
    const doc = yamlLoad(yaml);
    assert(doc !== null && typeof doc === "object", label);
  } catch (e) {
    assert(false, label, `YAML parse error: ${(e as Error).message}\n    Output:\n${yaml.split("\n").map(l => "      " + l).join("\n")}`);
  }
}

// ── Baseline envelope fragments ──────────────────────────────────────────────

const BLOCK_LEASE = `status: claimed\nlease:\n  holder: runner-1234\n  expires: 2026-08-25T00:00:00.000Z\nhistory: []\n`;
const SCALAR_LEASE = `status: claimed\nlease: null\nhistory: []\n`;
const FLOW_LEASE = `status: claimed\nlease: {holder: null, expires: null}\nhistory: []\n`;
const PLAIN_SCALAR = `status: open\nupdated: 2026-01-01T00:00:00.000Z\nlease:\n  holder: null\n  expires: null\n`;

// ── setField tests ───────────────────────────────────────────────────────────

console.log("\nsetField — writing scalar over block-mapping key:");

{
  // Block → scalar: the block children must be stripped.
  const result = setField(BLOCK_LEASE, "lease", "null");
  assertParseable(result, "block → scalar: output parses");
  const doc = yamlLoad(result) as any;
  assert(doc?.lease === null, "block → scalar: lease is null");
  assert(doc?.status === "claimed", "block → scalar: status preserved");
}

console.log("\nsetField — writing scalar over existing scalar key:");

{
  // Scalar → scalar: standard replacement.
  const result = setField(SCALAR_LEASE, "lease", "cleared");
  assertParseable(result, "scalar → scalar: output parses");
  const doc = yamlLoad(result) as any;
  assert(doc?.lease === "cleared", "scalar → scalar: value updated");
}

console.log("\nsetField — writing scalar over flow-mapping key:");

{
  // Flow → scalar: the flow mapping is replaced.
  const result = setField(FLOW_LEASE, "lease", "null");
  assertParseable(result, "flow → scalar: output parses");
  const doc = yamlLoad(result) as any;
  assert(doc?.lease === null, "flow → scalar: lease is null");
}

// ── setNestedField tests ─────────────────────────────────────────────────────

console.log("\nsetNestedField — updating existing child under block parent:");

{
  // Block parent, key exists: standard in-place update.
  const result = setNestedField(BLOCK_LEASE, "lease", "holder", "runner-9999");
  assertParseable(result, "block parent, key exists: output parses");
  const doc = yamlLoad(result) as any;
  assert(doc?.lease?.holder === "runner-9999", "block parent, key exists: holder updated");
  assert(doc?.lease?.expires != null, "block parent, key exists: expires preserved");
}

console.log("\nsetNestedField — adding child under scalar parent (was: `lease: null`):");

{
  // Scalar parent — the known offender. Must convert to block form.
  const result = setNestedField(SCALAR_LEASE, "lease", "holder", "runner-9999");
  assertParseable(result, "scalar parent: output parses");
  const doc = yamlLoad(result) as any;
  assert(doc?.lease?.holder === "runner-9999", "scalar parent: holder written");
}

console.log("\nsetNestedField — adding child under flow-mapping parent:");

{
  // Flow-mapping parent — another form that causes corruption without the fix.
  const result = setNestedField(FLOW_LEASE, "lease", "holder", "runner-9999");
  assertParseable(result, "flow parent: output parses");
  const doc = yamlLoad(result) as any;
  assert(doc?.lease?.holder === "runner-9999", "flow parent: holder written");
}

// ── Full claim cycle regression ───────────────────────────────────────────────

console.log("\nclaim cycle — scalar lease through full claim + clear:");

{
  // Simulates claimTask on an envelope with `lease: null` (scalar).
  let yaml = SCALAR_LEASE;
  yaml = setField(yaml, "status", "claimed");
  yaml = setNestedField(yaml, "lease", "holder", "runner-5555");
  yaml = setNestedField(yaml, "lease", "expires", "2026-08-25T01:00:00.000Z");
  assertParseable(yaml, "after claim: output parses");
  const claimed = yamlLoad(yaml) as any;
  assert(claimed?.lease?.holder === "runner-5555", "after claim: holder set");
  assert(claimed?.lease?.expires != null, "after claim: expires set");

  // Now clear the lease (transitionToWaiting path).
  yaml = setNestedField(yaml, "lease", "holder", "null");
  yaml = setNestedField(yaml, "lease", "expires", "null");
  assertParseable(yaml, "after clear: output parses");
  const cleared = yamlLoad(yaml) as any;
  assert(cleared?.lease?.holder === null, "after clear: holder is null");
  assert(cleared?.lease?.expires === null, "after clear: expires is null");
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
