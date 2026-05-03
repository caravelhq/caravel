import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

(globalThis as any).markdownRender = (src: string): string => {
  if (!src) return "";
  return marked.parse(src) as string;
};
