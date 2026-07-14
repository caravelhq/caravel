import { existsSync } from "fs";
import { join } from "path";

const LEGACY_SUBDIR = "claudeclaw";
const NEW_SUBDIR = "caravel";

/**
 * Resolves the on-disk state directory.
 *
 * New installs land in `.claude/caravel/`. Existing installs that have
 * `.claude/claudeclaw/` but not `.claude/caravel/` keep using their current
 * directory transparently — no manual migration required. Once `.claude/caravel/`
 * exists (after first start with a fresh install or after a manual mv), the
 * legacy path is no longer consulted.
 */
export function resolveStateDir(): string {
  const base = join(process.cwd(), ".claude");
  const newPath = join(base, NEW_SUBDIR);
  const legacyPath = join(base, LEGACY_SUBDIR);

  if (!existsSync(newPath) && existsSync(legacyPath)) {
    return legacyPath;
  }
  return newPath;
}

/**
 * Both candidate state-directory paths, for callers that need to probe
 * multiple projects (e.g. `status --all`).
 */
export function stateDirCandidates(projectRoot: string): string[] {
  const base = join(projectRoot, ".claude");
  return [join(base, NEW_SUBDIR), join(base, LEGACY_SUBDIR)];
}
