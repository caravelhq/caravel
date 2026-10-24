/**
 * caravel worktree list — read-only worktree reporting (WAL-123).
 *
 * Every scenario runs against a throwaway git repo under mkdtempSync(), never
 * the real workspace. The guard below asserts that explicitly: this suite
 * exercises a command that *reports on* worktrees, and an earlier iteration of
 * this feature could delete them, so "the tests cannot see the live trees" is
 * an invariant worth asserting rather than assuming.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

import { collectWorktreeReport } from "../src/cli/worktree";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function git(args: string[], cwd: string): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${r.stderr ?? ""}`);
  }
}

// ── fixture ──────────────────────────────────────────────────────────────────

const root = mkdtempSync(join(tmpdir(), "caravel-wt-test-"));

// Invariant: the fixture must not live inside the real workspace.
const realWs = "/home/walter/workspace";
if (resolve(root).startsWith(realWs)) {
  console.error(`FATAL: test root ${root} is inside the real workspace — aborting`);
  process.exit(1);
}

const repo = join(root, "repos", "caravel");
const wtDir = join(root, "repos", ".worktrees");
mkdirSync(repo, { recursive: true });
mkdirSync(wtDir, { recursive: true });

git(["init", "-q", "--initial-branch=local"], repo);
git(["config", "user.email", "test@example.com"], repo);
git(["config", "user.name", "Test"], repo);
writeFileSync(join(repo, "README.md"), "base\n");
git(["add", "."], repo);
git(["commit", "-q", "-m", "base"], repo);

// merged: a branch at the same commit as local — an ancestor, so merged.
git(["worktree", "add", "-q", "-b", "feature/merged", join(wtDir, "caravel-merged"), "local"], repo);

// unmerged: a branch with a commit local does not have.
git(["worktree", "add", "-q", "-b", "feature/unmerged", join(wtDir, "caravel-unmerged"), "local"], repo);
const unmergedTree = join(wtDir, "caravel-unmerged");
writeFileSync(join(unmergedTree, "new.txt"), "ahead\n");
git(["add", "."], unmergedTree);
git(["commit", "-q", "-m", "ahead of local"], unmergedTree);

// dirty: merged branch, but with uncommitted work in the tree.
git(["worktree", "add", "-q", "-b", "feature/dirty", join(wtDir, "caravel-dirty"), "local"], repo);
writeFileSync(join(wtDir, "caravel-dirty", "README.md"), "locally modified\n");

// a plain directory that is not a worktree at all
mkdirSync(join(wtDir, "caravel-bogus"), { recursive: true });

// a registration pointing somewhere that does not exist -> stale/missing
const ghost = join(root, "ghost-tree");
git(["worktree", "add", "-q", "-b", "feature/ghost", ghost, "local"], repo);
rmSync(ghost, { recursive: true, force: true });

const res = collectWorktreeReport(root);
const byName = new Map(res.worktrees.map((w) => [w.name, w]));

// ── W1: enumeration ──────────────────────────────────────────────────────────

console.log("\nW1 — enumerates every directory in repos/.worktrees/");
check("found 4 entries", res.worktrees.length === 4, `got ${res.worktrees.length}`);
for (const n of ["caravel-merged", "caravel-unmerged", "caravel-dirty", "caravel-bogus"]) {
  check(`${n} present`, byName.has(n));
}

// ── W2: merged detection ─────────────────────────────────────────────────────

console.log("\nW2 — merged vs unmerged against the default branch");
const merged = byName.get("caravel-merged")!;
const unmerged = byName.get("caravel-unmerged")!;
check("merged tree reports merged=true", merged.merged === true, `got ${merged.merged}`);
check("unmerged tree reports merged=false", unmerged.merged === false, `got ${unmerged.merged}`);
check("default branch detected as local", merged.defaultBranch === "local", `got ${merged.defaultBranch}`);
check("branch name captured", merged.branch === "feature/merged", `got ${merged.branch}`);
check("sha captured", typeof merged.sha === "string" && merged.sha!.length > 0);
check("backing repo resolved to repos/caravel", merged.repo === "repos/caravel", `got ${merged.repo}`);

// ── W3: dirty detection blocks reaping ───────────────────────────────────────

console.log("\nW3 — a dirty tree is never reapable, even when merged");
const dirty = byName.get("caravel-dirty")!;
check("dirty tree sees the modification", dirty.dirtyCount === 1, `got ${dirty.dirtyCount}`);
check("dirty tree is merged", dirty.merged === true, `got ${dirty.merged}`);
check("dirty tree is NOT reapable", dirty.reapable === false);
check("dirty tree has no remove command", dirty.removeCommand === null);
check("dirty file listed", dirty.dirtyFiles.some((f) => f.includes("README.md")));

// ── W4: reapable set and its command ─────────────────────────────────────────

console.log("\nW4 — reapable is clean AND merged, and carries an exact command");
check("merged+clean tree is reapable", merged.reapable === true);
check("unmerged tree is not reapable", unmerged.reapable === false);
check(
  "remove command is correct",
  merged.removeCommand === "git -C repos/caravel worktree remove repos/.worktrees/caravel-merged",
  `got ${merged.removeCommand}`
);
check("exactly one reapable", res.summary.reapable === 1, `got ${res.summary.reapable}`);

// ── W5: unreachable directories degrade, not crash ───────────────────────────

console.log("\nW5 — a non-worktree directory is labelled, not fatal");
const bogus = byName.get("caravel-bogus")!;
check("bogus marked unreachable", bogus.unreachable === true);
check("bogus not reapable", bogus.reapable === false);
check("bogus has no branch", bogus.branch === null);
check("unreachable counted", res.summary.unreachable === 1, `got ${res.summary.unreachable}`);

// ── W6: stale registrations ──────────────────────────────────────────────────

console.log("\nW6 — surfaces registrations whose path is gone");
const missing = res.stale.filter((s) => s.why === "missing");
check("one missing registration found", missing.length === 1, `got ${missing.length}`);
check("it is the ghost tree", missing[0]?.path.includes("ghost-tree") === true, missing[0]?.path);
check("attributed to repos/caravel", missing[0]?.repo === "repos/caravel", missing[0]?.repo);
check("stale counted in summary", res.summary.stale === res.stale.length);
const stalePaths = res.stale.map((s) => s.path);
check(
  "no duplicate stale paths",
  new Set(stalePaths).size === stalePaths.length,
  stalePaths.join(", ")
);
check("stale carries a commonDir for prune dedup", typeof missing[0]?.commonDir === "string");

// ── W7: read-only — nothing was removed ──────────────────────────────────────

console.log("\nW7 — the report mutates nothing");
const after = collectWorktreeReport(root);
check("still 4 worktrees after reporting", after.worktrees.length === 4, `got ${after.worktrees.length}`);
check(
  "the reapable tree still exists on disk",
  after.worktrees.find((w) => w.name === "caravel-merged")?.unreachable === false
);
check("repeat run is stable", after.summary.reapable === res.summary.reapable);

// ── W8: empty and absent worktree dirs ───────────────────────────────────────

console.log("\nW8 — degrades cleanly with no worktrees at all");
const bare = mkdtempSync(join(tmpdir(), "caravel-wt-bare-"));
const bareRes = collectWorktreeReport(bare);
check("no worktrees reported", bareRes.worktrees.length === 0);
check("no stale reported", bareRes.stale.length === 0);
check("summary all zero", bareRes.summary.total === 0 && bareRes.summary.reapable === 0);
rmSync(bare, { recursive: true, force: true });

// ── teardown ─────────────────────────────────────────────────────────────────

rmSync(root, { recursive: true, force: true });

console.log(`\n${pass + fail} assertions: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
process.exit(0);
