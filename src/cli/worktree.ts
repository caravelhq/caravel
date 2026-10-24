/**
 * caravel worktree <subcommand>
 *
 *   list [--json] [--root DIR]
 *
 * Read-only reporting over the git worktrees in repos/.worktrees/.
 *
 * Why read-only: WAL-123 Phase C originally shipped a worktree CLI that could
 * also create and delete trees, with a runner hook that reaped a tree when its
 * envelope went terminal. That was abandoned (TSK-2026-10-22-0002.01) for two
 * reasons — the `tree:` field it depended on was never registered in the
 * envelope schema, and the dirty-check meant the reaper declined on most
 * Caravel trees anyway because src/ui/app-dist/ is tracked. Carrying 400 lines
 * of deletion-capable code for a reaper that mostly declines was a bad trade.
 *
 * What survived is the part that was actually useful: the report. This command
 * tells a daily/weekly cleanup agent which trees are safe to remove and prints
 * the exact command to remove them — but never removes anything itself. The
 * decision to delete stays with a human, or with an agent acting on an
 * explicit instruction, which is where it belongs for an operation that can
 * destroy uncommitted work.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const WORKTREES_SUBDIR = "repos/.worktrees";
const LIVE_REL_PATH = "repos/caravel-live";

/**
 * Branches we treat as a repo's integration branch, in priority order.
 * Consulted only when origin/HEAD is unset — the common case here, since these
 * repos are cloned without a default-branch symref. `local` leads because that
 * is Caravel's integration branch; the Trakk repos use develop or master.
 */
const DEFAULT_BRANCH_CANDIDATES = ["local", "develop", "main", "master"];

/**
 * Built-in per-repo default-branch overrides — applies when the workspace has
 * no .caravel/settings.json or when the worktree.defaultBranch key is absent.
 * Keyed by the repo directory's basename.
 *
 * caravel → local: the fork's origin/HEAD points at upstream's master; the
 * integration branch Kelly merges into is local.
 */
const BUILT_IN_DEFAULT_BRANCH: Record<string, string> = {
  caravel: "local",
};

/**
 * Read worktree.defaultBranch overrides from wsRoot/.caravel/settings.json.
 * Config wins on any key that appears; the built-in fills the rest.
 * Any parse/read failure silently falls back to the built-in defaults, so a
 * missing or malformed settings file never prevents the command from running.
 *
 * Config shape:
 *   { "worktree": { "defaultBranch": { "reponame": "branchname" } } }
 */
function readDefaultBranchConfig(wsRoot: string): Record<string, string> {
  try {
    const raw = readFileSync(join(wsRoot, ".caravel", "settings.json"), "utf8");
    const parsed = JSON.parse(raw);
    const override = parsed?.worktree?.defaultBranch;
    if (override && typeof override === "object" && !Array.isArray(override)) {
      const fromConfig: Record<string, string> = {};
      for (const [k, v] of Object.entries(override)) {
        if (typeof v === "string" && v.trim()) fromConfig[k] = v.trim();
      }
      if (Object.keys(fromConfig).length > 0) {
        return { ...BUILT_IN_DEFAULT_BRANCH, ...fromConfig };
      }
    }
  } catch {
    // file missing, unreadable, or malformed — fall through
  }
  return BUILT_IN_DEFAULT_BRANCH;
}

const MAX_DIRTY_SHOWN = 5;

export type WorktreeReport = {
  name: string;
  path: string; // workspace-relative
  sha: string | null;
  branch: string | null;
  /** Capped at MAX_DIRTY_SHOWN entries; dirtyCount carries the true total. */
  dirtyFiles: string[];
  dirtyCount: number;
  /** null when undeterminable — detached HEAD, no default branch, is the default branch. */
  merged: boolean | null;
  /** Main checkout backing this worktree, workspace-relative. */
  repo: string | null;
  defaultBranch: string | null;
  /** Path is gone, or exists but git knows nothing about it. */
  unreachable: boolean;
  /** Clean AND merged AND not the live tree — safe to remove. */
  reapable: boolean;
  /** The removal command; present only when reapable. */
  removeCommand: string | null;
};

export type StaleRegistration = {
  repo: string; // workspace-relative main checkout that reported it
  path: string; // absolute path git has registered
  why: "missing" | "outside-workspace";
  /**
   * The shared .git dir this registration lives in. Several repos under repos/
   * are themselves worktrees of one another, so they all report the same
   * registration list — one prune against the shared metadata fixes every
   * copy. Prune hints are deduped on this.
   */
  commonDir: string;
};

export type WorktreeListResult = {
  worktrees: WorktreeReport[];
  stale: StaleRegistration[];
  summary: {
    total: number;
    reapable: number;
    dirty: number;
    unreachable: number;
    stale: number;
  };
};

function gitCapture(args: string[], cwd: string): string | null {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (r.error || r.status !== 0) return null;
  const out = (r.stdout ?? "").trim();
  return out.length > 0 ? out : null;
}

function isLivePath(wsRoot: string, p: string): boolean {
  return resolve(p) === resolve(join(wsRoot, LIVE_REL_PATH));
}

function relToWs(wsRoot: string, p: string): string {
  const r = resolve(wsRoot);
  const a = resolve(p);
  return a.startsWith(r + "/") ? a.slice(r.length + 1) : a;
}

/** Locate the main checkout backing a worktree. Returns an absolute path. */
function findMainWorktree(treePath: string): string | null {
  let common = gitCapture(
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    treePath
  );
  // --path-format needs git >= 2.31; fall back to resolving by hand.
  if (!common) {
    const raw = gitCapture(["rev-parse", "--git-common-dir"], treePath);
    if (!raw) return null;
    common = resolve(treePath, raw);
  }
  const normalised = common.replace(/\/+$/, "");
  if (!normalised.endsWith("/.git")) {
    // Bare or unusual layout — not something we can map to a checkout.
    return null;
  }
  return resolve(normalised, "..");
}

function defaultBranchFor(repoPath: string, overrides: Record<string, string>): string | null {
  const repoName = repoPath.split("/").filter(Boolean).at(-1) ?? "";
  const override = overrides[repoName];
  if (override) return override;
  const head = gitCapture(
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    repoPath
  );
  if (head) return head.replace(/^origin\//, "");
  for (const c of DEFAULT_BRANCH_CANDIDATES) {
    if (gitCapture(["rev-parse", "--verify", "--quiet", `refs/heads/${c}`], repoPath)) {
      return c;
    }
  }
  return null;
}

function dirtyFiles(treePath: string): string[] {
  const r = spawnSync("git", ["status", "--porcelain"], {
    cwd: treePath,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (r.error || r.status !== 0) return [];
  return (r.stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function isAncestor(ref: string, of: string, cwd: string): boolean {
  const r = spawnSync("git", ["merge-base", "--is-ancestor", ref, of], {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return r.status === 0;
}

function unreachableEntry(name: string, relPath: string): WorktreeReport {
  return {
    name,
    path: relPath,
    sha: null,
    branch: null,
    dirtyFiles: [],
    dirtyCount: 0,
    merged: null,
    repo: null,
    defaultBranch: null,
    unreachable: true,
    reapable: false,
    removeCommand: null,
  };
}

/**
 * Registrations git still holds that point at a path which is gone, or sits
 * outside this workspace entirely. The latter is WSL-migration residue: two
 * trees under /home/walter/caravel were still registered months after the move
 * to /home/walter/workspace, and nothing surfaced them. That stale main-worktree
 * registration also makes `git worktree add ../relative/path` resolve outside
 * the workspace — so this is not cosmetic.
 */
function collectStale(wsRoot: string): StaleRegistration[] {
  const out: StaleRegistration[] = [];
  const seen = new Set<string>();
  const reposDir = join(wsRoot, "repos");
  if (!existsSync(reposDir)) return out;

  let repoNames: string[];
  try {
    repoNames = readdirSync(reposDir).sort();
  } catch {
    return out;
  }

  for (const repoName of repoNames) {
    if (repoName === ".worktrees") continue;
    const repoPath = join(reposDir, repoName);
    try {
      if (!statSync(repoPath).isDirectory()) continue;
    } catch {
      continue;
    }
    if (!existsSync(join(repoPath, ".git"))) continue;

    const porcelain = gitCapture(["worktree", "list", "--porcelain"], repoPath);
    if (!porcelain) continue;

    const commonDir =
      gitCapture(["rev-parse", "--path-format=absolute", "--git-common-dir"], repoPath) ??
      join(repoPath, ".git");

    for (const line of porcelain.split("\n")) {
      if (!line.startsWith("worktree ")) continue;
      const p = line.slice("worktree ".length).trim();
      if (!p) continue;

      const abs = resolve(p);
      // Sibling worktree-repos share one metadata store and each reports the
      // whole list, so the same path arrives many times. Report it once.
      if (seen.has(abs)) continue;

      if (!existsSync(p)) {
        seen.add(abs);
        out.push({ repo: relToWs(wsRoot, repoPath), path: p, why: "missing", commonDir });
      } else if (!abs.startsWith(resolve(wsRoot) + "/")) {
        seen.add(abs);
        out.push({ repo: relToWs(wsRoot, repoPath), path: p, why: "outside-workspace", commonDir });
      }
    }
  }
  return out;
}

/** Build the full read-only report. Performs no writes of any kind. */
export function collectWorktreeReport(wsRoot: string): WorktreeListResult {
  const defaultBranchOverrides = readDefaultBranchConfig(wsRoot);
  const worktrees: WorktreeReport[] = [];
  const wtDir = join(wsRoot, WORKTREES_SUBDIR);

  let names: string[] = [];
  if (existsSync(wtDir)) {
    try {
      names = readdirSync(wtDir).sort();
    } catch {
      names = [];
    }
  }

  for (const name of names) {
    const full = join(wtDir, name);
    const relPath = `${WORKTREES_SUBDIR}/${name}`;

    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      worktrees.push(unreachableEntry(name, relPath));
      continue;
    }

    const sha = gitCapture(["rev-parse", "--short", "HEAD"], full);
    const branch = gitCapture(["rev-parse", "--abbrev-ref", "HEAD"], full);
    if (!sha && !branch) {
      worktrees.push(unreachableEntry(name, relPath));
      continue;
    }

    const mainRepo = findMainWorktree(full);
    const repoRel = mainRepo ? relToWs(wsRoot, mainRepo) : null;
    const defaultBranch = mainRepo ? defaultBranchFor(mainRepo, defaultBranchOverrides) : null;

    let merged: boolean | null = null;
    if (mainRepo && branch && branch !== "HEAD" && defaultBranch && branch !== defaultBranch) {
      merged = isAncestor(branch, defaultBranch, mainRepo);
    }

    const dirty = dirtyFiles(full);
    const reapable = !isLivePath(wsRoot, full) && dirty.length === 0 && merged === true;

    worktrees.push({
      name,
      path: relPath,
      sha,
      branch,
      dirtyFiles: dirty.slice(0, MAX_DIRTY_SHOWN),
      dirtyCount: dirty.length,
      merged,
      repo: repoRel,
      defaultBranch,
      unreachable: false,
      reapable,
      removeCommand:
        reapable && repoRel ? `git -C ${repoRel} worktree remove ${relPath}` : null,
    });
  }

  const stale = collectStale(wsRoot);

  return {
    worktrees,
    stale,
    summary: {
      total: worktrees.length,
      reapable: worktrees.filter((w) => w.reapable).length,
      dirty: worktrees.filter((w) => w.dirtyCount > 0).length,
      unreachable: worktrees.filter((w) => w.unreachable).length,
      stale: stale.length,
    },
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printHuman(res: WorktreeListResult): void {
  if (res.worktrees.length === 0) {
    console.log(`no worktrees in ${WORKTREES_SUBDIR}/`);
  } else {
    const plural = res.worktrees.length === 1 ? "" : "s";
    console.log(`${WORKTREES_SUBDIR}/ — ${res.worktrees.length} worktree${plural}\n`);
    const nameW = Math.max(...res.worktrees.map((w) => w.name.length), 4);
    const mergedW = Math.max(
      ...res.worktrees.map((w) => {
        if (w.merged === null) return 1;
        const base = w.merged ? "merged" : "unmerged";
        return w.defaultBranch ? base.length + 1 + w.defaultBranch.length : base.length;
      }),
      9
    );
    for (const w of res.worktrees) {
      if (w.unreachable) {
        console.log(`  ${pad(w.name, nameW)}  [unreachable — not a git worktree]`);
        continue;
      }
      const state = w.dirtyCount > 0 ? `dirty(${w.dirtyCount})` : "clean";
      const mergedLabel =
        w.merged === true
          ? w.defaultBranch ? `merged/${w.defaultBranch}` : "merged"
          : w.merged === false
          ? w.defaultBranch ? `unmerged/${w.defaultBranch}` : "unmerged"
          : "—";
      const flag = w.reapable ? "  <- reapable" : "";
      console.log(
        `  ${pad(w.name, nameW)}  ${pad(w.sha ?? "?", 9)} ${pad(state, 11)} ${pad(mergedLabel, mergedW)} ${w.branch ?? "?"}${flag}`
      );
    }
  }

  const reapable = res.worktrees.filter((w) => w.reapable);
  if (reapable.length > 0) {
    const bases = [...new Set(reapable.map((w) => w.defaultBranch).filter((b): b is string => b !== null))];
    const vsLabel = bases.length > 0 ? ` (vs ${bases.join(", ")})` : "";
    console.log(`\nReapable — clean and merged into the default branch${vsLabel} (${reapable.length}):`);
    for (const w of reapable) console.log(`  ${w.removeCommand}`);
  }

  const dirty = res.worktrees.filter((w) => w.dirtyCount > 0);
  if (dirty.length > 0) {
    console.log(`\nDirty — uncommitted work, left alone (${dirty.length}):`);
    for (const w of dirty) {
      const more =
        w.dirtyCount > MAX_DIRTY_SHOWN ? ` ... +${w.dirtyCount - MAX_DIRTY_SHOWN} more` : "";
      console.log(`  ${w.name}: ${w.dirtyFiles.join(", ")}${more}`);
    }
  }

  if (res.stale.length > 0) {
    console.log(
      `\nStale registrations — path missing or outside this workspace (${res.stale.length}):`
    );
    const pruneTargets = new Map<string, string>();
    for (const s of res.stale) {
      console.log(`  ${s.path}  [${s.why}]`);
      // One prune per shared metadata store, not per repo that reported it.
      if (!pruneTargets.has(s.commonDir)) pruneTargets.set(s.commonDir, s.repo);
    }
    for (const r of pruneTargets.values()) console.log(`  -> git -C ${r} worktree prune`);
  }

  const s = res.summary;
  console.log(
    `\n${s.total} total · ${s.reapable} reapable · ${s.dirty} dirty · ${s.unreachable} unreachable · ${s.stale} stale`
  );
  console.log("\nThis command never removes anything. Run the commands above yourself.");
}

function findWorkspaceRoot(startPath: string): string {
  let dir = resolve(startPath);
  while (true) {
    if (existsSync(join(dir, ".caravel"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return startPath;
}

function doList(argv: string[]): void {
  const rootIdx = argv.indexOf("--root");
  const wsRoot =
    rootIdx >= 0 && argv[rootIdx + 1] ? resolve(argv[rootIdx + 1]!) : findWorkspaceRoot(process.cwd());

  const res = collectWorktreeReport(wsRoot);

  if (argv.includes("--json")) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  printHuman(res);
}

export function runWorktreeCli(argv: string[]): void {
  const [action, ...rest] = argv;
  switch (action) {
    case "list":
    case undefined:
      doList(rest);
      break;
    default:
      console.error(`caravel worktree: unknown subcommand "${action}"`);
      console.error("usage: caravel worktree list [--json] [--root DIR]");
      process.exit(2);
  }
}
