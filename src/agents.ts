import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { existsSync, readdirSync, statSync } from "fs";

// Agent profiles live at <projectRoot>/agents/<name>/.
// Each profile contains:
//   - agent.json       (manifest; required)
//   - CLAUDE.md        (identity prompt; required)
//   - rules/*.md       (optional; replaces .claude/rules/* when agent is active)
//   - memory/          (optional; agent's persistent memory, scoped per agent)
const AGENTS_DIR = join(process.cwd(), "agents");

export interface AgentManifest {
  name: string;
  displayName: string;
  emoji?: string;
  description: string;
  mode: "resident" | "ephemeral";
  skills?: string[];
  allowedPaths?: string[];
  model?: string;
  compactThreshold?: number;
  // Anthropic-compatible base URL override (e.g. a LiteLLM proxy that maps
  // Anthropic protocol to Gemini / Ollama). Sets ANTHROPIC_BASE_URL for the
  // agent's child process. When set, the agent's traffic bypasses the
  // standard Anthropic endpoint entirely.
  apiBaseUrl?: string;
  // Dotted path into .claude/config.json holding the auth token for the proxy
  // (e.g. "openrouter.token"). Read at child-spawn time and forwarded as
  // ANTHROPIC_AUTH_TOKEN. Preferred over apiKeyEnv — keeps secrets in the
  // workspace config rather than the daemon environment.
  apiKeyConfig?: string;
  // Fallback: name of an env var that holds the auth token for the proxy. Read
  // from the daemon's environment at child-spawn time and forwarded as
  // ANTHROPIC_AUTH_TOKEN. Used only when apiKeyConfig is unset or unresolved.
  apiKeyEnv?: string;
}

export interface AgentSummary {
  name: string;
  displayName: string;
  emoji?: string;
  description: string;
  mode: "resident" | "ephemeral";
}

export interface LoadedAgent {
  manifest: AgentManifest;
  claudeMd: string;   // trimmed; empty string means "fall back to project CLAUDE.md"
  rules: string;      // concatenated rule files; empty string means "no agent rules"
}

function sanitizeAgentName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function validateManifest(raw: unknown, dirName: string): AgentManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const name = typeof m.name === "string" ? m.name.trim() : "";
  if (!name || name !== dirName) return null;
  const displayName = typeof m.displayName === "string" ? m.displayName.trim() : "";
  if (!displayName) return null;
  const description = typeof m.description === "string" ? m.description.trim() : "";
  if (!description) return null;
  const mode = m.mode === "ephemeral" ? "ephemeral" : "resident";

  const manifest: AgentManifest = { name, displayName, description, mode };
  if (typeof m.emoji === "string" && m.emoji.trim()) manifest.emoji = m.emoji.trim();
  if (Array.isArray(m.skills)) {
    manifest.skills = m.skills.filter((s): s is string => typeof s === "string");
  }
  if (Array.isArray(m.allowedPaths)) {
    manifest.allowedPaths = m.allowedPaths.filter((p): p is string => typeof p === "string");
  }
  if (typeof m.model === "string" && m.model.trim()) manifest.model = m.model.trim();
  if (typeof m.compactThreshold === "number" && Number.isFinite(m.compactThreshold)) {
    manifest.compactThreshold = m.compactThreshold;
  }
  if (typeof m.apiBaseUrl === "string" && m.apiBaseUrl.trim()) {
    manifest.apiBaseUrl = m.apiBaseUrl.trim();
  }
  if (typeof m.apiKeyConfig === "string" && m.apiKeyConfig.trim()) {
    manifest.apiKeyConfig = m.apiKeyConfig.trim();
  }
  if (typeof m.apiKeyEnv === "string" && m.apiKeyEnv.trim()) {
    manifest.apiKeyEnv = m.apiKeyEnv.trim();
  }
  return manifest;
}

export async function listAgents(): Promise<AgentSummary[]> {
  if (!existsSync(AGENTS_DIR)) return [];
  let entries: string[];
  try {
    entries = await readdir(AGENTS_DIR);
  } catch {
    return [];
  }

  const agents: AgentSummary[] = [];
  for (const name of entries) {
    const dir = join(AGENTS_DIR, name);
    try {
      const s = await stat(dir);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    const manifestPath = join(dir, "agent.json");
    try {
      const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
      const manifest = validateManifest(raw, name);
      if (!manifest) continue;
      agents.push({
        name: manifest.name,
        displayName: manifest.displayName,
        description: manifest.description,
        mode: manifest.mode,
        ...(manifest.emoji ? { emoji: manifest.emoji } : {}),
      });
    } catch {
      continue;
    }
  }

  // Alphabetical by display name. The dashboard applies its own default
  // selection (coordinator first); ordering here is just a stable catalog.
  return agents.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Synchronous roster lookup: the directory names under agents/ that contain
// an agent.json manifest. Used by the runner and dashboard services to derive
// the live roster from disk instead of a hardcoded list — add an agent profile
// and it shows up everywhere, no source edits required. Directories starting
// with "_" (e.g. _shared) are skipped. Returns names sorted alphabetically.
export function listAgentNamesSync(): string[] {
  if (!existsSync(AGENTS_DIR)) return [];
  let entries: string[];
  try {
    entries = readdirSync(AGENTS_DIR);
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const name of entries) {
    if (name.startsWith("_") || name.startsWith(".")) continue;
    try {
      if (!statSync(join(AGENTS_DIR, name)).isDirectory()) continue;
      if (!existsSync(join(AGENTS_DIR, name, "agent.json"))) continue;
      names.push(name);
    } catch {
      continue;
    }
  }
  return names.sort();
}

async function loadRules(dir: string): Promise<string> {
  const rulesDir = join(dir, "rules");
  if (!existsSync(rulesDir)) return "";
  let files: string[];
  try {
    files = await readdir(rulesDir);
  } catch {
    return "";
  }
  const parts: string[] = [];
  for (const name of files.sort()) {
    if (!name.endsWith(".md")) continue;
    try {
      const text = await readFile(join(rulesDir, name), "utf-8");
      if (text.trim()) parts.push(text.trim());
    } catch {}
  }
  return parts.join("\n\n");
}

export async function loadAgent(name: string): Promise<LoadedAgent | null> {
  const safeName = sanitizeAgentName(name);
  if (!safeName) return null;
  const dir = join(AGENTS_DIR, safeName);
  if (!existsSync(dir)) return null;

  const manifestPath = join(dir, "agent.json");
  let manifest: AgentManifest | null = null;
  try {
    const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
    manifest = validateManifest(raw, safeName);
  } catch {
    return null;
  }
  if (!manifest) return null;

  let claudeMd = "";
  const claudeMdPath = join(dir, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    try {
      claudeMd = (await readFile(claudeMdPath, "utf-8")).trim();
    } catch {}
  }

  const rules = await loadRules(dir);
  return { manifest, claudeMd, rules };
}
