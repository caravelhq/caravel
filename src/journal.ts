import { existsSync } from "fs";
import { mkdir, writeFile, readFile, open } from "fs/promises";
import { join } from "path";
import { resolveStateDir } from "./paths";

/**
 * Per-agent append-only journal for cross-chat shared learnings (WAL-61 Phase A).
 *
 * Each agent owns `agents/<name>/journal.ndjson`. Concurrent chats append entries
 * via O_APPEND (atomic for writes ≤ PIPE_BUF on POSIX, ~4 KiB on Linux). Each
 * chat tracks its own read cursor so it sees each entry exactly once across
 * sessions and daemon restarts.
 *
 * Entries are emitted opt-in by the agent via `<journal kind="…">…</journal>`
 * directives in its response. The runner strips the directives from the displayed
 * text and persists the entries.
 */

export type JournalKind = "learn" | "decide" | "todo" | "fact";

export interface JournalEntry {
  ts: string;          // ISO-8601
  chatId: string;      // source chat thread ID
  kind: JournalKind;
  text: string;        // ≤280 chars
  tags?: string[];
}

const VALID_KINDS = new Set<JournalKind>(["learn", "decide", "todo", "fact"]);
const MAX_TEXT_LEN = 280;
const MAX_INJECT_ENTRIES = 30;
const MAX_INJECT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CURSORS_DIR = join(resolveStateDir(), "journal-cursors");

function agentJournalPath(agentName: string): string {
  return join(process.cwd(), "agents", agentName, "journal.ndjson");
}

function cursorPath(chatId: string): string {
  const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, "");
  return join(CURSORS_DIR, `${safe}.json`);
}

function clipText(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= MAX_TEXT_LEN) return trimmed;
  return trimmed.slice(0, MAX_TEXT_LEN - 1) + "…";
}

/**
 * Atomic append using O_APPEND. POSIX guarantees writes shorter than PIPE_BUF
 * are atomic — single-line entries fit easily, so concurrent appenders never
 * tear each other's lines.
 */
export async function appendEntry(agentName: string, entry: JournalEntry): Promise<void> {
  const dir = join(process.cwd(), "agents", agentName);
  if (!existsSync(dir)) return;
  const path = agentJournalPath(agentName);
  const line = JSON.stringify(entry) + "\n";
  const fh = await open(path, "a");
  try {
    await fh.write(line);
  } finally {
    await fh.close();
  }
}

export async function readEntries(agentName: string): Promise<JournalEntry[]> {
  const path = agentJournalPath(agentName);
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return [];
  }
  const out: JournalEntry[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t) as JournalEntry;
      if (e && typeof e.ts === "string" && typeof e.text === "string") out.push(e);
    } catch {}
  }
  return out;
}

export async function getCursor(chatId: string): Promise<string | null> {
  const path = cursorPath(chatId);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf-8");
    const obj = JSON.parse(raw) as { ts?: unknown };
    return typeof obj.ts === "string" ? obj.ts : null;
  } catch {
    return null;
  }
}

export async function setCursor(chatId: string, ts: string): Promise<void> {
  await mkdir(CURSORS_DIR, { recursive: true });
  await writeFile(cursorPath(chatId), JSON.stringify({ ts }));
}

/**
 * Returns entries for the agent that are newer than the cursor, excluding the
 * current chat's own entries. Capped to MAX_INJECT_ENTRIES and entries no older
 * than MAX_INJECT_AGE_MS to keep the system prompt bounded.
 */
export async function loadRecentEntriesForChat(
  agentName: string,
  chatId: string
): Promise<JournalEntry[]> {
  const cursor = await getCursor(chatId);
  const cutoffByAge = new Date(Date.now() - MAX_INJECT_AGE_MS).toISOString();
  const cutoff = cursor && cursor > cutoffByAge ? cursor : cutoffByAge;
  const all = await readEntries(agentName);
  const fresh = all.filter((e) => e.ts > cutoff && e.chatId !== chatId);
  // Take the most recent N, then sort oldest-first for chronological reading.
  const recent = fresh.slice(-MAX_INJECT_ENTRIES);
  return recent;
}

/**
 * Format entries as a system-prompt block. Empty string when no entries.
 */
export function formatEntriesForPrompt(entries: JournalEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map((e) => {
    const when = e.ts.slice(0, 16).replace("T", " ");
    const tagSuffix = e.tags && e.tags.length > 0 ? ` [${e.tags.join(",")}]` : "";
    return `- [${when}] (${e.kind}) ${e.text}${tagSuffix}`;
  });
  return [
    "# Recent shared learnings (from other chats with this agent)",
    "These were journaled by parallel chats since you last looked. Use them as context; don't repeat them back unless asked.",
    "",
    ...lines,
  ].join("\n");
}

/**
 * Stateful streaming filter that strips `<journal …>…</journal>` directives
 * from text emitted to the UI and collects matched entries for persistence.
 *
 * Handles partial directives split across chunks: any unclosed `<journal` at
 * the tail of a chunk is held back until the next feed (or flush).
 */
export class JournalFilter {
  private buf = "";
  private rawEntries: { attrs: string; body: string }[] = [];

  feed(chunk: string): string {
    this.buf += chunk;
    let out = "";
    const re = /<journal\s*([^>]*)>([\s\S]*?)<\/journal>/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buf)) !== null) {
      out += this.buf.slice(lastIdx, m.index);
      this.rawEntries.push({ attrs: m[1] ?? "", body: m[2] ?? "" });
      lastIdx = m.index + m[0].length;
    }
    const tail = this.buf.slice(lastIdx);
    const openIdx = tail.indexOf("<journal");
    if (openIdx === -1) {
      out += tail;
      this.buf = "";
    } else {
      out += tail.slice(0, openIdx);
      this.buf = tail.slice(openIdx);
    }
    return out;
  }

  /** Flush any held-back text. Call once when the response stream ends. */
  flush(): string {
    const tail = this.buf;
    this.buf = "";
    // If the tail looks like an unterminated journal directive, drop it
    // rather than leaking it into the chat (the model meant for it to be
    // hidden). Anything else is regular text we held back conservatively.
    if (/^<journal\b/.test(tail) && !tail.includes("</journal>")) return "";
    return tail;
  }

  drainEntries(): { kind: JournalKind; text: string; tags?: string[] }[] {
    const out: { kind: JournalKind; text: string; tags?: string[] }[] = [];
    for (const r of this.rawEntries) {
      const kindMatch = /\bkind\s*=\s*["']?([a-z]+)["']?/.exec(r.attrs);
      const tagsMatch = /\btags\s*=\s*["']([^"']*)["']/.exec(r.attrs);
      const rawKind = kindMatch?.[1]?.toLowerCase() ?? "learn";
      const kind = (VALID_KINDS.has(rawKind as JournalKind) ? rawKind : "learn") as JournalKind;
      const text = clipText(r.body);
      if (!text) continue;
      const tags = tagsMatch?.[1]
        ? tagsMatch[1].split(/[,\s]+/).filter((t) => t.length > 0)
        : undefined;
      out.push({ kind, text, ...(tags ? { tags } : {}) });
    }
    this.rawEntries = [];
    return out;
  }
}

/**
 * Rotate the active journal into agents/<name>/journal-archive/YYYY-MM.ndjson
 * when it grows beyond `maxBytes`. Existing archive content is preserved
 * (subsequent rotations append to the same monthly file).
 */
export async function rotateIfLarge(agentName: string, maxBytes = 256 * 1024): Promise<boolean> {
  const path = agentJournalPath(agentName);
  if (!existsSync(path)) return false;
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return false;
  }
  if (Buffer.byteLength(raw, "utf-8") < maxBytes) return false;

  const archiveDir = join(process.cwd(), "agents", agentName, "journal-archive");
  await mkdir(archiveDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 7);
  const archivePath = join(archiveDir, `${stamp}.ndjson`);
  let existing = "";
  if (existsSync(archivePath)) {
    try { existing = await readFile(archivePath, "utf-8"); } catch {}
  }
  const merged = existing.endsWith("\n") || existing === "" ? existing + raw : existing + "\n" + raw;
  await writeFile(archivePath, merged);
  await writeFile(path, "");
  return true;
}

// Re-exported so tests / Phase B can locate cursor files.
export const _internal = { agentJournalPath, cursorPath, CURSORS_DIR };
