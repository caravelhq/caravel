import { marked } from "marked";

marked.setOptions({
  gfm: true,
  // CommonMark default: a single newline is whitespace, only blank lines
  // start a new paragraph. Lets word-wrap handle layout instead of
  // mid-sentence breaks from agents that hard-wrap their source.
  breaks: false,
});

(globalThis as any).markdownRender = (src: string): string => {
  if (!src) return "";
  return marked.parse(src) as string;
};
