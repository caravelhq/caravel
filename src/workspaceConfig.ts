import { join } from "path";

// The workspace config lives alongside the Claude Code project config at
// <projectRoot>/.claude/config.json. It holds sensitive workspace-level
// settings (API tokens, integration credentials) that the daemon and its
// agents need but that must never be committed. This is distinct from
// .claude/caravel/settings.json (daemon runtime settings — see config.ts).
const CONFIG_FILE = join(process.cwd(), ".claude", "config.json");

/**
 * Resolve a dotted path (e.g. "openrouter.token") from .claude/config.json.
 * Returns the trimmed string value, or null if the file is missing/unreadable,
 * the path doesn't resolve, or the value isn't a non-empty string.
 *
 * Read fresh on every call — no cache. The file is tiny and this lets a key
 * pasted into config.json take effect on the next agent spawn without a daemon
 * restart. Callers resolve at child-spawn time, so the cost is negligible.
 */
export async function resolveWorkspaceSecret(path: string): Promise<string | null> {
  let config: unknown;
  try {
    config = JSON.parse(await Bun.file(CONFIG_FILE).text());
  } catch {
    return null;
  }

  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  let node: any = config;
  for (const part of parts) {
    if (node == null || typeof node !== "object") return null;
    node = node[part];
  }

  return typeof node === "string" && node.trim() ? node.trim() : null;
}
