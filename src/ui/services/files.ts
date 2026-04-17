import { readFile, readdir, stat } from "fs/promises";
import { join, resolve, relative, extname } from "path";

const WORK_DIR = process.cwd();
const MAX_FILE_SIZE = 512 * 1024; // 512 KB

function safePath(requestedPath: string): string {
  const cleaned = requestedPath.replace(/\.\./g, "").replace(/\/+/g, "/");
  const full = resolve(WORK_DIR, cleaned);
  if (!full.startsWith(WORK_DIR)) {
    throw new Error("Path outside working directory");
  }
  return full;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: number;
  isSymlink?: boolean;
}

export async function listDirectory(dirPath: string): Promise<{ entries: FileEntry[]; path: string }> {
  const full = safePath(dirPath || ".");
  const rel = relative(WORK_DIR, full) || ".";

  const entries: FileEntry[] = [];
  const items = await readdir(full, { withFileTypes: true });

  for (const item of items) {
    if (item.name.startsWith(".") && item.name !== ".claude") continue;
    if (item.name === "node_modules") continue;

    const itemPath = join(full, item.name);
    const itemRel = relative(WORK_DIR, itemPath);
    const isSymlink = item.isSymbolicLink();

    // Resolve symlinks via stat() to classify their target; skip broken links.
    if (isSymlink) {
      try {
        const st = await stat(itemPath);
        if (st.isDirectory()) {
          entries.push({ name: item.name, path: itemRel, type: "directory", isSymlink: true });
        } else if (st.isFile()) {
          entries.push({
            name: item.name,
            path: itemRel,
            type: "file",
            size: st.size,
            modified: st.mtimeMs,
            isSymlink: true,
          });
        }
      } catch {
        // broken symlink — drop
      }
      continue;
    }

    if (item.isDirectory()) {
      entries.push({ name: item.name, path: itemRel, type: "directory" });
    } else if (item.isFile()) {
      try {
        const st = await stat(itemPath);
        entries.push({
          name: item.name,
          path: itemRel,
          type: "file",
          size: st.size,
          modified: st.mtimeMs,
        });
      } catch {
        entries.push({ name: item.name, path: itemRel, type: "file" });
      }
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { entries, path: rel };
}

export async function readFileContent(filePath: string): Promise<{ content: string; path: string; size: number }> {
  const full = safePath(filePath);
  const rel = relative(WORK_DIR, full);

  const st = await stat(full);
  if (!st.isFile()) throw new Error("Not a file");
  if (st.size > MAX_FILE_SIZE) throw new Error(`File too large (${(st.size / 1024).toFixed(0)} KB, max ${MAX_FILE_SIZE / 1024} KB)`);

  const content = await readFile(full, "utf-8");
  return { content, path: rel, size: st.size };
}

export function isMarkdown(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === ".md" || ext === ".markdown" || ext === ".mdx";
}
