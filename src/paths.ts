import { existsSync } from "fs";
import { join } from "path";

const STATE_DIR_NAME = ".caravel";
const LEGACY_DIR_NAME = "claudeclaw"; // inside .claude/ — pre-Caravel ClaudeClaw installs

/**
 * Resolves the on-disk state directory.
 *
 * New installs land in `<project>/.caravel/` — a top-level dotdir owned by
 * Caravel, independent of any coding-agent CLI. Existing ClaudeClaw installs
 * that have `.claude/claudeclaw/` are detected and used transparently so no
 * manual migration is needed. To migrate, run:
 *   mv .claude/claudeclaw .caravel
 */
export function resolveStateDir(): string {
  const projectRoot = process.cwd();
  const newPath = join(projectRoot, STATE_DIR_NAME);
  const legacyPath = join(projectRoot, ".claude", LEGACY_DIR_NAME);

  if (!existsSync(newPath) && existsSync(legacyPath)) {
    return legacyPath;
  }
  return newPath;
}

/**
 * Candidate state-directory paths in preference order, for callers that need
 * to probe multiple projects (e.g. `status --all`, `stop --all`).
 */
export function stateDirCandidates(projectRoot: string): string[] {
  return [
    join(projectRoot, STATE_DIR_NAME),
    join(projectRoot, ".claude", LEGACY_DIR_NAME),
  ];
}
