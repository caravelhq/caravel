// WAL-79 — a headline is agent-authored prose. It must survive a strict YAML
// round-trip no matter which metacharacter it contains. Regression guard for
// cda73ae, which put a colon into an unquoted scalar and made nine envelopes
// invisible in the dashboard with no error anywhere.
import { load } from "js-yaml";

const q = (v: string) => JSON.stringify(v);
const unwrap = (v: string) =>
  /^".*"$/.test(v) || /^'.*'$/.test(v) ? v.slice(1, -1) : v;

function envelope(headline: string, project: string | null) {
  return [
    "id: TSK-2026-08-26-0099",
    `headline: ${q(headline)}`,
    "created: 2026-08-26T00:00:00.000Z",
    ...(project ? [`project: ${q(project)}`] : []),
    "status: open",
  ].join("\n");
}

let pass = 0, fail = 0;
const ck = (n: string, c: boolean, d = "") =>
  c ? (console.log(`  ✓ ${n}`), pass++) : (console.log(`  ✗ ${n} ${d}`), fail++);

const HEADLINES: Array<[string, string]> = [
  ["the exact regression", 'Continue: Re-run sc1xx suite to completion + report'],
  ["leading asterisk (YAML alias)", "*Endpoint tested on dev"],
  ["leading backtick", "`attributesByType()` getter fix"],
  ["leading ampersand (anchor)", "&anchor handling"],
  ["embedded double quotes", 'Continue: "Re-run sc1xx suite"'],
  ["leading hash", "# not a comment"],
  ["braces and brackets", "{flow: map} and [seq]"],
  ["percent and at", "%directive @reserved"],
  ["colon-space mid-value", "Adjudicate sc112: download never fires"],
  ["newline in value", "line one\nline two"],
  ["backslash", 'path\\to\\thing'],
  ["unicode em dash", "Briefing — 4 tasks landed"],
];

for (const [name, headline] of HEADLINES) {
  const yaml = envelope(headline, "TPD-267_Trakk-Cloud-Historian");
  let doc: any = null, err = "";
  try { doc = load(yaml); } catch (e: any) { err = e.message.split("\n")[0]; }
  ck(`parses: ${name}`, doc !== null, err);
  if (doc) ck(`round-trips intact: ${name}`, doc.headline === headline, `got ${JSON.stringify(doc.headline)}`);
}

// project field takes the same treatment
const weird = load(envelope("ok", "Proj: with colon")) as any;
ck("project with a colon round-trips", weird?.project === "Proj: with colon", JSON.stringify(weird?.project));

// null project omits the key rather than writing `project: null`
const noProj = load(envelope("ok", null)) as any;
ck("absent project omits the key", !("project" in noProj));

// unwrap strips a pre-quoted child headline exactly once
ck("unwrap strips wrapping double quotes", unwrap('"Re-run sc1xx"') === "Re-run sc1xx");
ck("unwrap strips wrapping single quotes", unwrap("'Re-run sc1xx'") === "Re-run sc1xx");
ck("unwrap leaves bare text alone", unwrap("Re-run sc1xx") === "Re-run sc1xx");
ck("unwrap leaves inner quotes alone", unwrap('say "hi" now') === 'say "hi" now');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
