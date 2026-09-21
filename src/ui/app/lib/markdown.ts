import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(src: string): string {
  if (!src) return "";
  return marked.parse(src) as string;
}

export function stripFrontmatter(src: string): { fm: string; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: "", body: src };
  return { fm: m[1], body: src.slice(m[0].length) };
}
