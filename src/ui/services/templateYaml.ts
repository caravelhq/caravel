// Comment-preserving YAML load/save for schedule templates.
// Uses eemeli's `yaml` package (parseDocument) instead of js-yaml so that
// hand-written comments inside recurrence: blocks survive round-trips.
// js-yaml remains the parser everywhere else in the codebase.
import { parseDocument, type Document } from "yaml";
import { readFile, writeFile } from "node:fs/promises";

export async function loadTemplate(path: string): Promise<Document> {
  const content = await readFile(path, "utf-8");
  return parseDocument(content);
}

export async function saveTemplate(path: string, doc: Document): Promise<void> {
  await writeFile(path, doc.toString());
}
