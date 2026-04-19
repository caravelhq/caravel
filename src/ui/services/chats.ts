import { mkdir, readFile, writeFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { CHATS_DIR } from "../constants";

export interface ChatMessage {
  role: string;
  text: string;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  preview: string;
  name?: string;
}

export interface ChatListEntry {
  id: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  name?: string;
}

const MAX_CHAT_NAME_LENGTH = 80;

function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().replace(/[\r\n\t]+/g, " ");
  return trimmed.slice(0, MAX_CHAT_NAME_LENGTH);
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function chatPath(id: string): string {
  return join(CHATS_DIR, `${sanitizeId(id)}.json`);
}

function buildPreview(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "(empty)";
  return first.text.slice(0, 80) + (first.text.length > 80 ? "..." : "");
}

export async function listChats(): Promise<ChatListEntry[]> {
  await mkdir(CHATS_DIR, { recursive: true });
  let files: string[];
  try {
    files = await readdir(CHATS_DIR);
  } catch {
    return [];
  }

  const entries = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (name) => {
        const path = join(CHATS_DIR, name);
        try {
          const s = await stat(path);
          const data = JSON.parse(await readFile(path, "utf-8"));
          const customName = sanitizeName(data.name);
          return {
            id: data.id || name.replace(".json", ""),
            preview: data.preview || "(empty)",
            messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
            createdAt: data.createdAt || s.birthtime.toISOString(),
            updatedAt: data.updatedAt || s.mtime.toISOString(),
            ...(customName ? { name: customName } : {}),
            mtime: s.mtimeMs,
          };
        } catch {
          return null;
        }
      })
  );

  return entries
    .filter((x): x is ChatListEntry & { mtime: number } => Boolean(x))
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ mtime: _, ...rest }) => rest)
    .slice(0, 50);
}

export async function getChatMeta(
  id: string
): Promise<{ id: string; updatedAt: string; messageCount: number } | null> {
  const path = chatPath(id);
  try {
    const s = await stat(path);
    const data = JSON.parse(await readFile(path, "utf-8"));
    return {
      id: data.id || id,
      updatedAt: data.updatedAt || s.mtime.toISOString(),
      messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
    };
  } catch {
    return null;
  }
}

export async function loadChat(id: string): Promise<ChatSession | null> {
  const path = chatPath(id);
  try {
    const data = JSON.parse(await readFile(path, "utf-8"));
    const customName = sanitizeName(data.name);
    return {
      id: data.id || id,
      messages: Array.isArray(data.messages) ? data.messages : [],
      createdAt: data.createdAt || "",
      updatedAt: data.updatedAt || "",
      preview: data.preview || "",
      ...(customName ? { name: customName } : {}),
    };
  } catch {
    return null;
  }
}

export async function saveChat(
  id: string,
  messages: ChatMessage[]
): Promise<ChatSession> {
  await mkdir(CHATS_DIR, { recursive: true });
  const safeId = sanitizeId(id);
  const path = chatPath(safeId);

  let createdAt: string;
  let preservedName = "";
  try {
    const existing = JSON.parse(await readFile(path, "utf-8"));
    createdAt = existing.createdAt || new Date().toISOString();
    preservedName = sanitizeName(existing.name);
  } catch {
    createdAt = new Date().toISOString();
  }

  const session: ChatSession = {
    id: safeId,
    messages,
    createdAt,
    updatedAt: new Date().toISOString(),
    preview: buildPreview(messages),
    ...(preservedName ? { name: preservedName } : {}),
  };

  await writeFile(path, JSON.stringify(session, null, 2), "utf-8");
  return session;
}

export async function renameChat(
  id: string,
  nameInput: unknown
): Promise<ChatSession | null> {
  const safeId = sanitizeId(id);
  const path = chatPath(safeId);
  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }

  const name = sanitizeName(nameInput);
  const session: ChatSession = {
    id: safeId,
    messages: Array.isArray(existing.messages) ? (existing.messages as ChatMessage[]) : [],
    createdAt: String(existing.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    preview: String(existing.preview || ""),
    ...(name ? { name } : {}),
  };

  await writeFile(path, JSON.stringify(session, null, 2), "utf-8");
  return session;
}

export async function deleteChat(id: string): Promise<void> {
  const path = chatPath(id);
  await Bun.file(path).delete();
}
