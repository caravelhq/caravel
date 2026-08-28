/**
 * Type-check gate (WAL-72 FDP v1.12).
 *
 * Runs `tsc --noEmit`, filters to diagnostics originating in src/ or test/,
 * and exits non-zero if any non-excluded errors remain.
 *
 * Why this exists: `tsc` reported the `fields` ReferenceError (WAL-72 Phase 2)
 * for the entire development cycle and nobody noticed because its output was
 * dominated by 160+ node_modules noise lines. Filtering to src/+test/ gives a
 * signal small enough to act on.
 *
 * Exclusion list: pre-existing issues outside WAL-72 Phase 2 scope. Every
 * entry is an explicit acknowledgement of a known unfixed error. To remove one:
 * fix the underlying issue in the source file and delete the entry here.
 * Do NOT add new entries to hide fresh errors — fix them instead.
 *
 * Run with: bun run test/type-check.test.ts
 * Exits 0 only when the non-excluded src/+test/ diagnostic count is zero.
 */

import { join } from "path";

const ROOT = join(import.meta.dir, "..");

// ── Pre-existing errors outside WAL-72 Phase 2 scope ─────────────────────────
//
// Each entry matches the start of a tsc diagnostic line. A line that contains
// any of these prefixes is excluded from the gate. Entries must be as specific
// as possible — don't exclude an entire file when only one line is the problem.
const KNOWN_PREEXISTING: string[] = [
  // TS2554: wrong argument count — pre-existing in config.ts
  "src/config.ts(",
  // CSS/Vue side-effect imports in voice island — missing type shims
  "src/ui/island/",
  // TS2322: number | undefined not assignable to number
  "src/ui/server.ts(",
  // TS2339: Property 'path' does not exist on Dirent<string> (Bun types drift)
  "src/whisper.ts(",
  // TS2352: cast needs `as unknown as` intermediate — pre-existing in WAL-76 suite
  "test/paused-status.test.ts(",
  // TS2345: probe() expects string|number, gets boolean — single line in Jess's suite
  "test/scheduler/graph-errors.test.ts(244,",
];

function isExcluded(line: string): boolean {
  return KNOWN_PREEXISTING.some((pat) => line.includes(pat));
}

// ── Sanity check: tsc must be available ──────────────────────────────────────
//
// In this project, tsc is bundled with Bun — `bunx tsc` resolves without a
// local node_modules. We verify it's reachable before the main run so a broken
// environment produces a loud failure rather than a silent pass (an exit 0 with
// empty output would look like "all clean").
const versionCheck = Bun.spawnSync(["bunx", "tsc", "--version"], { cwd: ROOT });
if (versionCheck.exitCode !== 0) {
  console.error("type-check: FAIL — `bunx tsc --version` failed; tsc is not available");
  console.error(new TextDecoder().decode(versionCheck.stderr));
  process.exit(1);
}
console.log(`type-check: using ${new TextDecoder().decode(versionCheck.stdout).trim()}`);

// ── Run tsc ───────────────────────────────────────────────────────────────────

const proc = Bun.spawn(["bunx", "tsc", "--noEmit"], {
  cwd: ROOT,
  stdout: "pipe",
  stderr: "pipe",
});

const [stdout, stderr] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
]);
const exitCode = await proc.exited;

// tsc exits 0 (clean) or 1 (errors present). Any other code means tsc crashed
// or was killed — treat as gate failure.
if (exitCode !== 0 && exitCode !== 1) {
  console.error(`type-check: FAIL — tsc exited unexpectedly (code=${exitCode})`);
  if (stderr) console.error(stderr.trimEnd());
  process.exit(1);
}

// ── Filter and classify ───────────────────────────────────────────────────────

const output = stdout + (stderr ? `\n${stderr}` : "");
const srcTestLines = output
  .split("\n")
  .filter((l) => /^(src|test)\//.test(l) && l.includes("error TS"));

const excluded = srcTestLines.filter(isExcluded);
const newErrors = srcTestLines.filter((l) => !isExcluded(l));

console.log(`type-check: tsc exit=${exitCode}`);
console.log(
  `  src/+test/ errors: ${srcTestLines.length} total, ` +
    `${excluded.length} excluded (pre-existing), ${newErrors.length} new`
);

if (excluded.length > 0) {
  console.log("  pre-existing (excluded):");
  for (const l of excluded) console.log(`    [skip] ${l.split(":")[0]}`);
}

// ── Environment-broken guard ──────────────────────────────────────────────────
//
// A genuinely clean program exits 0. If tsc exits non-zero but zero diagnostics
// were attributed to src/ or test/, it means tsc aborted before type-checking
// the program — typically because a required type definition (e.g. bun-types)
// couldn't be resolved in a worktree without node_modules. This is exactly the
// failure the gate is supposed to prevent: a broken environment silently passing
// as "0 new errors".
if (exitCode !== 0 && srcTestLines.length === 0) {
  const isMissingTypes =
    output.includes("TS2688") ||
    output.includes("TS6053") ||
    output.includes("Cannot find type definition file") ||
    output.includes("Cannot find module");
  if (isMissingTypes) {
    console.error(
      "type-check: FAIL — tsc could not complete (missing type definitions).\n" +
        "  In a worktree: run `bun install` or run this gate from the live checkout.\n" +
        "  Raw tsc output (first 3 lines):\n" +
        output.split("\n").slice(0, 3).map((l) => `    ${l}`).join("\n")
    );
  } else {
    console.error(
      `type-check: FAIL — tsc exited ${exitCode} but no src/+test/ diagnostics were attributed.\n` +
        "  Environment may be broken. Raw tsc output (first 3 lines):\n" +
        output.split("\n").slice(0, 3).map((l) => `    ${l}`).join("\n")
    );
  }
  process.exit(1);
}

if (newErrors.length > 0) {
  console.error("type-check: FAIL — new errors detected in src/ or test/:");
  for (const l of newErrors) console.error(`  ${l}`);
  process.exit(1);
}

console.log("type-check: PASS");
process.exit(0);
