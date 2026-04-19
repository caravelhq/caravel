import { readFile, readdir, stat } from "fs/promises";
import { existsSync, statSync } from "fs";
import { join, resolve, relative, extname, dirname } from "path";

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
  fromGit?: boolean;
}

export interface RepoRoot {
  absPath: string;
  relPath: string;
  label: string;
}

// Walk up from absPath until we find a directory containing .git (a regular
// .git directory OR a .git file for worktrees/submodules) or we hit WORK_DIR.
function resolveRepoRoot(absPath: string): RepoRoot {
  let current = absPath;
  try {
    const st = statSync(current);
    if (!st.isDirectory()) current = dirname(current);
  } catch {
    current = dirname(current);
  }
  while (true) {
    if (existsSync(join(current, ".git"))) break;
    if (current === WORK_DIR || current === "/" || current === dirname(current)) {
      current = WORK_DIR;
      break;
    }
    current = dirname(current);
  }
  const rel = relative(WORK_DIR, current) || ".";
  const label = rel === "." ? "~/work" : rel;
  return { absPath: current, relPath: rel, label };
}

async function runGit(root: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["git", "-C", root, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}

async function runGitBuffer(root: string, args: string[]): Promise<{ code: number; stdout: Uint8Array; stderr: string }> {
  const proc = Bun.spawn(["git", "-C", root, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).bytes(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}

async function currentBranch(root: string): Promise<string> {
  const res = await runGit(root, ["branch", "--show-current"]);
  const branch = res.stdout.trim();
  if (branch) return branch;
  const sha = await runGit(root, ["rev-parse", "--short", "HEAD"]);
  return sha.stdout.trim();
}

export async function listBranchesForPath(requestedPath: string): Promise<{
  root: string;
  rootLabel: string;
  current: string;
  branches: string[];
}> {
  const absPath = safePath(requestedPath || ".");
  const root = resolveRepoRoot(absPath);
  const current = await currentBranch(root.absPath);
  const res = await runGit(root.absPath, ["branch", "--format=%(refname:short)", "--all"]);
  const seen = new Set<string>();
  const branches: string[] = [];
  for (const line of res.stdout.split("\n")) {
    const name = line.trim();
    if (!name) continue;
    if (name === "origin/HEAD") continue;
    if (name.startsWith("origin/HEAD ")) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    branches.push(name);
  }
  return {
    root: root.relPath,
    rootLabel: root.label,
    current,
    branches,
  };
}

async function listDirectoryFromFs(absPath: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  const items = await readdir(absPath, { withFileTypes: true });
  for (const item of items) {
    if (item.name.startsWith(".") && item.name !== ".claude") continue;
    if (item.name === "node_modules") continue;

    const itemPath = join(absPath, item.name);
    const itemRel = relative(WORK_DIR, itemPath);
    const isSymlink = item.isSymbolicLink();

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
      } catch {}
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
  return entries;
}

async function listDirectoryFromGit(
  root: RepoRoot,
  relToRoot: string,
  branch: string,
  dirRelToWork: string
): Promise<FileEntry[]> {
  const treeSpec = relToRoot === "." || relToRoot === ""
    ? `${branch}:`
    : `${branch}:${relToRoot}`;
  const res = await runGit(root.absPath, ["ls-tree", "-l", treeSpec]);
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || `ls-tree failed on ${branch}`);
  }
  const entries: FileEntry[] = [];
  for (const rawLine of res.stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // git ls-tree -l format: <mode> SP <type> SP <sha> SP <size> TAB <name>
    const tabIdx = line.indexOf("\t");
    if (tabIdx < 0) continue;
    const header = line.slice(0, tabIdx).split(/\s+/);
    const name = line.slice(tabIdx + 1);
    if (!name) continue;
    if (name.startsWith(".") && name !== ".claude") continue;
    if (name === "node_modules") continue;

    const mode = header[0] || "";
    const type = header[1] || "";
    const sizeStr = header[3] || "-";

    const entryPath = dirRelToWork === "." || dirRelToWork === ""
      ? name
      : `${dirRelToWork}/${name}`;

    if (mode === "120000") continue; // symlinks — skip
    if (type === "tree") {
      entries.push({ name, path: entryPath, type: "directory", fromGit: true });
    } else if (type === "blob") {
      const size = sizeStr === "-" ? undefined : Number.parseInt(sizeStr, 10);
      entries.push({
        name,
        path: entryPath,
        type: "file",
        size: Number.isFinite(size) ? size : undefined,
        fromGit: true,
      });
    }
  }
  return entries;
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export interface DirListing {
  entries: FileEntry[];
  path: string;
  root: string;
  rootLabel: string;
  current: string;
  activeBranch: string;
  readOnly: boolean;
}

export async function listDirectory(dirPath: string, branch?: string): Promise<DirListing> {
  const full = safePath(dirPath || ".");
  const rel = relative(WORK_DIR, full) || ".";
  const root = resolveRepoRoot(full);
  const current = await currentBranch(root.absPath);
  const requestedBranch = (branch || "").trim();
  const useGit = Boolean(requestedBranch) && requestedBranch !== current;

  let entries: FileEntry[];
  if (useGit) {
    const relToRoot = relative(root.absPath, full) || ".";
    entries = await listDirectoryFromGit(root, relToRoot, requestedBranch, rel);
  } else {
    entries = await listDirectoryFromFs(full);
  }
  return {
    entries: sortEntries(entries),
    path: rel,
    root: root.relPath,
    rootLabel: root.label,
    current,
    activeBranch: useGit ? requestedBranch : current,
    readOnly: useGit,
  };
}

function isLikelyBinary(buf: Uint8Array): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

export interface FileRead {
  content: string;
  path: string;
  size: number;
  root: string;
  rootLabel: string;
  current: string;
  activeBranch: string;
  readOnly: boolean;
}

export async function readFileContent(filePath: string, branch?: string): Promise<FileRead> {
  const full = safePath(filePath);
  const rel = relative(WORK_DIR, full);
  const root = resolveRepoRoot(full);
  const current = await currentBranch(root.absPath);
  const requestedBranch = (branch || "").trim();
  const useGit = Boolean(requestedBranch) && requestedBranch !== current;

  if (!useGit) {
    const st = await stat(full);
    if (!st.isFile()) throw new Error("Not a file");
    if (st.size > MAX_FILE_SIZE) {
      throw new Error(`File too large (${(st.size / 1024).toFixed(0)} KB, max ${MAX_FILE_SIZE / 1024} KB)`);
    }
    const content = await readFile(full, "utf-8");
    return {
      content,
      path: rel,
      size: st.size,
      root: root.relPath,
      rootLabel: root.label,
      current,
      activeBranch: current,
      readOnly: false,
    };
  }

  const relToRoot = relative(root.absPath, full);
  if (!relToRoot || relToRoot.startsWith("..")) {
    throw new Error("File outside resolved repo root");
  }
  const spec = `${requestedBranch}:${relToRoot}`;
  const sizeRes = await runGit(root.absPath, ["cat-file", "-s", spec]);
  if (sizeRes.code !== 0) {
    throw new Error(sizeRes.stderr.trim() || `not found on ${requestedBranch}`);
  }
  const size = Number.parseInt(sizeRes.stdout.trim(), 10) || 0;
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(size / 1024).toFixed(0)} KB, max ${MAX_FILE_SIZE / 1024} KB)`);
  }
  const buf = await runGitBuffer(root.absPath, ["show", spec]);
  if (buf.code !== 0) {
    throw new Error(buf.stderr.trim() || `show failed on ${requestedBranch}`);
  }
  if (isLikelyBinary(buf.stdout)) {
    throw new Error("Binary file — preview not supported");
  }
  const content = new TextDecoder("utf-8", { fatal: false }).decode(buf.stdout);
  return {
    content,
    path: rel,
    size,
    root: root.relPath,
    rootLabel: root.label,
    current,
    activeBranch: requestedBranch,
    readOnly: true,
  };
}

export function isMarkdown(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === ".md" || ext === ".markdown" || ext === ".mdx";
}
