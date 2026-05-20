// WAL-63 Phase 3: read-only listing of project folders under
// Notes/Projects/. Powers the dashboard new-task form's project dropdown
// and (in Phase 4) the Projects view cards.
//
// A project here is any direct child directory of `Notes/Projects/`. We
// also pull a light bit of metadata from `<project>/README.md` frontmatter
// when it exists (doc_type: readme, title) so the dropdown can sort and
// label sensibly without forcing every caller to read the file itself.
// Sort order: alphabetical by slug — predictable for keyboard nav.

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = process.cwd();
const PROJECTS_DIR = join(PROJECT_ROOT, "Notes", "Projects");

export interface ProjectInfo {
  slug: string;
  hasReadme: boolean;
  title: string | null;
  jira: string | null;
  status: string | null;
}

function parseFrontmatter(content: string): Record<string, string> | null {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[kv[1]] = value;
  }
  return out;
}

export async function listProjects(): Promise<ProjectInfo[]> {
  if (!existsSync(PROJECTS_DIR)) return [];

  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."));

  const out: ProjectInfo[] = [];
  for (const d of dirs) {
    const slug = d.name;
    const readmePath = join(PROJECTS_DIR, slug, "README.md");
    let hasReadme = false;
    let title: string | null = null;
    let jira: string | null = null;
    let status: string | null = null;
    try {
      const st = await stat(readmePath);
      if (st.isFile()) {
        hasReadme = true;
        const content = await readFile(readmePath, "utf-8");
        const fm = parseFrontmatter(content);
        if (fm) {
          title = fm.title ?? null;
          jira = fm.jira ?? null;
          status = fm.status ?? null;
        }
      }
    } catch {
      // No README is fine — slug-only project listing.
    }
    out.push({ slug, hasReadme, title, jira, status });
  }

  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}
