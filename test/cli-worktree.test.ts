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

// ── W9: the actual bug — origin/HEAD wrong, config override fixes it ──────────
//
// This is the regression for WAL-150. The caravel fork's origin/HEAD resolves
// to origin/master (upstream's branch). A worktree merged into "local" was
// reported as unmerged because isAncestor(branch, "master", repo) returned
// false — master doesn't share history with local in the fork.
//
// Scenario:
//   - Repo named "bugrepro" (not in built-in defaults).
//   - origin/HEAD → master (the wrong branch, set via symbolic-ref).
//   - Integration branch is "local".
//   - A worktree created from "local" (so it IS merged into local).
//
// Without config: defaultBranch = "master" → merged = false (the bug).
// With config (worktree.defaultBranch.bugrepro = "local"): merged = true (the fix).

console.log("\nW9 — bug regression: origin/HEAD→wrong branch, config override fixes it");

const bugRoot = mkdtempSync(join(tmpdir(), "caravel-wt-bug-"));
if (resolve(bugRoot).startsWith(realWs)) {
  console.error(`FATAL: bugRoot ${bugRoot} is inside the real workspace — aborting`);
  process.exit(1);
}

const bugRepos = join(bugRoot, "repos");
const bugRepo = join(bugRepos, "bugrepro");
const bugWtDir = join(bugRepos, ".worktrees");
mkdirSync(bugRepo, { recursive: true });
mkdirSync(bugWtDir, { recursive: true });

git(["init", "-q", "--initial-branch=local"], bugRepo);
git(["config", "user.email", "t@t.com"], bugRepo);
git(["config", "user.name", "T"], bugRepo);
writeFileSync(join(bugRepo, "f"), "base");
git(["add", "."], bugRepo);
git(["commit", "-q", "-m", "base"], bugRepo);

// Simulate the fork's wrong origin/HEAD without a real remote clone.
git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/master"], bugRepo);

// A feature branch at the same commit as local — merged into local.
git(["worktree", "add", "-q", "-b", "feature/done", join(bugWtDir, "bugrepro-done"), "local"], bugRepo);
// A feature branch with a new commit — NOT merged into local.
git(["worktree", "add", "-q", "-b", "feature/ahead", join(bugWtDir, "bugrepro-ahead"), "local"], bugRepo);
writeFileSync(join(bugWtDir, "bugrepro-ahead", "new.txt"), "extra");
git(["add", "."], join(bugWtDir, "bugrepro-ahead"));
git(["commit", "-q", "-m", "extra"], join(bugWtDir, "bugrepro-ahead"));

// ── W9a: without config — origin/HEAD (master) is used → merged=false (the bug) ──
const bugResNoConfig = collectWorktreeReport(bugRoot);
const bugDoneNoConfig = bugResNoConfig.worktrees.find((w) => w.name === "bugrepro-done");
check(
  "W9a: without config, defaultBranch resolves from origin/HEAD (master)",
  bugDoneNoConfig?.defaultBranch === "master",
  `got ${bugDoneNoConfig?.defaultBranch}`,
);
check(
  "W9a: without config, merged=false — the bug (master != ancestor)",
  bugDoneNoConfig?.merged === false,
  `got ${bugDoneNoConfig?.merged}`,
);
check("W9a: without config, not reapable", bugDoneNoConfig?.reapable === false);

// ── W9b: with config override — correct branch used → merged=true (the fix) ──
mkdirSync(join(bugRoot, ".caravel"), { recursive: true });
writeFileSync(
  join(bugRoot, ".caravel", "settings.json"),
  JSON.stringify({ worktree: { defaultBranch: { bugrepro: "local" } } }),
);
const bugResConfig = collectWorktreeReport(bugRoot);
const bugDoneConfig = bugResConfig.worktrees.find((w) => w.name === "bugrepro-done");
const bugAheadConfig = bugResConfig.worktrees.find((w) => w.name === "bugrepro-ahead");
check(
  "W9b: with config, defaultBranch is local (from settings.json)",
  bugDoneConfig?.defaultBranch === "local",
  `got ${bugDoneConfig?.defaultBranch}`,
);
check(
  "W9b: with config, merged worktree reports merged=true (the fix)",
  bugDoneConfig?.merged === true,
  `got ${bugDoneConfig?.merged}`,
);
check("W9b: with config, merged+clean worktree is reapable", bugDoneConfig?.reapable === true);
check(
  "W9b: unmerged worktree still reports merged=false",
  bugAheadConfig?.merged === false,
  `got ${bugAheadConfig?.merged}`,
);

// ── W10: config absent/malformed → built-in applies, no crash ────────────────

console.log("\nW10 — config absent/malformed falls back to built-in without crashing");

// Malformed JSON in settings.json → fallback to built-in.
writeFileSync(join(bugRoot, ".caravel", "settings.json"), "{not: valid json");
const bugResMalformed = collectWorktreeReport(bugRoot);
check("W10a: malformed JSON, no crash (worktrees still collected)", bugResMalformed.worktrees.length >= 0);
// "bugrepro" not in built-in → falls back to origin/HEAD (master).
const bugDoneMalformed = bugResMalformed.worktrees.find((w) => w.name === "bugrepro-done");
check(
  "W10a: malformed JSON → falls back to origin/HEAD (master)",
  bugDoneMalformed?.defaultBranch === "master",
  `got ${bugDoneMalformed?.defaultBranch}`,
);

// Missing worktree key in valid JSON → fallback to built-in.
writeFileSync(join(bugRoot, ".caravel", "settings.json"), JSON.stringify({ model: "opus" }));
const bugResMissingKey = collectWorktreeReport(bugRoot);
check("W10b: missing worktree key, no crash", bugResMissingKey.worktrees.length >= 0);
const bugDoneMissingKey = bugResMissingKey.worktrees.find((w) => w.name === "bugrepro-done");
check(
  "W10b: missing key → falls back to origin/HEAD (master)",
  bugDoneMissingKey?.defaultBranch === "master",
  `got ${bugDoneMissingKey?.defaultBranch}`,
);

// ── W11: non-override repo resolves origin/HEAD normally (no regression) ─────

console.log("\nW11 — non-override repo resolves origin/HEAD correctly (app/servers shape)");

// A repo named "normalrepo" with correct origin/HEAD → main.
// Uses the settings.json with the bugrepro override — "normalrepo" is NOT in it,
// so it falls through to origin/HEAD → main. This proves the override is an
// exception path, not a replacement.
writeFileSync(
  join(bugRoot, ".caravel", "settings.json"),
  JSON.stringify({ worktree: { defaultBranch: { bugrepro: "local" } } }),
);

const normalRepoDir = join(bugRepos, "normalrepo");
mkdirSync(normalRepoDir, { recursive: true });
git(["init", "-q", "--initial-branch=main"], normalRepoDir);
git(["config", "user.email", "t@t.com"], normalRepoDir);
git(["config", "user.name", "T"], normalRepoDir);
writeFileSync(join(normalRepoDir, "f"), "base");
git(["add", "."], normalRepoDir);
git(["commit", "-q", "-m", "base"], normalRepoDir);
// Correct origin/HEAD → main.
git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"], normalRepoDir);

const normalWt = join(bugWtDir, "normalrepo-merged");
git(["worktree", "add", "-q", "-b", "feature/nr", normalWt, "main"], normalRepoDir);

const normalRes = collectWorktreeReport(bugRoot);
const normalMerged = normalRes.worktrees.find((w) => w.name === "normalrepo-merged");
check(
  "W11: non-override repo picks up origin/HEAD correctly (main)",
  normalMerged?.defaultBranch === "main",
  `got ${normalMerged?.defaultBranch}`,
);
check(
  "W11: merged worktree in non-override repo reports merged=true",
  normalMerged?.merged === true,
  `got ${normalMerged?.merged}`,
);
check("W11: built-in still has no effect on non-caravel, non-bugrepro repo", normalMerged?.reapable === true);

rmSync(bugRoot, { recursive: true, force: true });

// ── teardown ─────────────────────────────────────────────────────────────────

rmSync(root, { recursive: true, force: true });

console.log(`\n${pass + fail} assertions: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
process.exit(0);
