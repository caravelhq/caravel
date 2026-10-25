/**
 * caravel task <subcommand> [opts]
 *
 * Phase A (WAL-123 steps 3–4) — callback surface:
 *   park     --task ID --agent NAME [--on script] [--deadline-mins N] [--watch DESC] --summary S [--body-file F | --body S]
 *   done     --task ID --agent NAME --summary S [--report-path P] [--body-file F | --body S]
 *   failed   --task ID --agent NAME --summary S [--reason R] [--body-file F | --body S]
 *   wrap     --task ID --agent NAME --summary S [--deadline-mins N] [--on script] -- <command...>
 *
 * Phase B step 8 (WAL-123) — dispatch surface:
 *   new      --target AGENT --yaml DRAFT.yaml [--parent TSK-...] [--project SLUG] [--headline "..."] [--from AGENT] [--reply-to AGENT] [--chat ID] [--force]
 *   next-id  --target AGENT [--parent TSK-...]
 *   list     --agent NAME [--status BUCKET]
 *   summary
 *
 * Phase B step 9 (WAL-123) — policy lint:
 *   lint     --yaml ENVELOPE.yaml [--force]
 *
 * Phase C v2 (WAL-123) — batch dispatch:
 *   batch    --yaml BATCH-SPEC.yaml [--force]
 *
 * Phase A preserves: park-before-launch, envelope validation, temp-file-plus-rename,
 * the deadline default with a warn threshold at 6 hours.
 *
 * Phase B adopts ALLOCATION_SCAN_DIRS (seven buckets) instead of task.mjs's five-bucket
 * SCAN_BUCKETS — a deliberate behaviour change (F6). task.mjs's five-bucket scan can
 * reissue an id whose highest sibling sits in paused/ or blocked/, both populated today.
 * Preserving it would be preserving a bug. cli-dispatch.test.ts has one fixture per
 * dated incident fix ported from task.mjs.
 *
 * The CLI runs from repos/caravel-live so it versions with the runner.
 * task.mjs shim delegates here for one release (spawn, forward argv/stdout/exit code).
 * SKILL.md: .claude/skills/task/SKILL.md
 */

import { existsSync, openSync, appendFileSync, readFileSync, readdirSync } from "fs";
import { spawn } from "child_process";
import { join, resolve } from "path";
import { parse as parseYaml } from "yaml";
import {
  VALID_FAILURE_REASONS,
  WORKER_WAITING_SPECS,
  VALID_WAITING_SPECS,
  ASSERT_ENVELOPE_BUCKETS,
  ALLOCATION_SCAN_DIRS,
  DISPATCH_LIST_BUCKETS,
  DISPATCH_SUMMARY_COUNT_BUCKETS,
  REQUIRED_FIELDS,
  UNSATISFIABLE_DELEGATE_BUCKETS,
} from "../envelope/schema.js";
import { yamlLine, writeAtomic } from "../envelope/write.js";

const DEFAULT_DEADLINE_MINS = 60;
const DEADLINE_WARN_HOURS = 6;
const LOG_TAIL_LINES = 40;

// Resolve workspace root from env or by walking up from the CLI entry point.
function workspaceRoot(): string {
  if (process.env.CARAVEL_WORKSPACE) return process.env.CARAVEL_WORKSPACE;
  // caravel-live/src/cli/task.ts → caravel-live/  (4 levels up from this file at runtime)
  // In dev: repos/caravel/src/cli/task.ts → up 4 levels is /home/walter (wrong)
  // So prefer env var; fall back to cwd, which is set by the caller.
  return process.cwd();
}

function tasksDir(root: string, agent: string, bucket: string): string {
  return join(root, "agents", agent, "tasks", bucket);
}

function assertEnvelope(root: string, agent: string, task: string): void {
  const candidates = ASSERT_ENVELOPE_BUCKETS.map(
    (b) => join(tasksDir(root, agent, b), `${task}.yaml`)
  );
  if (!candidates.some(existsSync)) {
    die(
      `no envelope found for ${agent}/${task}.\n  Looked for ${task}.yaml in agents/${agent}/tasks/{open,waiting,done,failed,blocked,paused}/.\n  Check --task and --agent; this is almost always a typo.`
    );
  }
}

function die(msg: string): never {
  console.error(`caravel task: ${msg}`);
  process.exit(1);
}

type ParsedArgs = Record<string, string | true | string[]> & { _: string[]; cmd: string[] };

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { _: [], cmd: [] };
  let i = 0;
  (out as Record<string, unknown>).action = argv[i++];
  for (; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      out.cmd = argv.slice(i + 1);
      break;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--") || next === "--") {
        (out as Record<string, unknown>)[key] = true;
      } else {
        (out as Record<string, unknown>)[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const shellQuote = (a: string) =>
  /^[A-Za-z0-9_/.:=-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`;

function resolveBody(args: ParsedArgs, root: string): string {
  const bodyFile = args["body-file"];
  if (bodyFile && bodyFile !== true) {
    const p = resolve(String(bodyFile));
    if (!existsSync(p)) die(`--body-file not found: ${p}`);
    return readFileSync(p, "utf8");
  }
  const body = args.body;
  if (body && body !== true) return String(body);
  return "";
}

function requireFlags(args: ParsedArgs, names: string[]): void {
  for (const n of names) {
    const v = args[n];
    if (!v || v === true) die(`--${n} is required for \`${String(args.action)}\``);
  }
}

// ── park ──────────────────────────────────────────────────────────────────────

function writePark(
  args: ParsedArgs,
  root: string,
  extraBody = ""
): { path: string; deadline: string; spec: string } {
  const task = String(args.task);
  const agent = String(args.agent);

  const spec = args.on && args.on !== true ? String(args.on) : "script";
  if (!WORKER_WAITING_SPECS.has(spec)) {
    die(
      `--on must be one of ${[...WORKER_WAITING_SPECS].join(", ")} (got "${spec}"). \`limits\` is runner-internal and workers cannot emit it.`
    );
  }

  const minsRaw = args["deadline-mins"];
  const mins =
    minsRaw && minsRaw !== true ? Number(minsRaw) : DEFAULT_DEADLINE_MINS;
  if (!Number.isFinite(mins) || mins <= 0)
    die(`--deadline-mins must be a positive number (got "${String(minsRaw)}")`);

  if (mins > DEADLINE_WARN_HOURS * 60) {
    // Warn and proceed — this is a threshold, not a ceiling.
    console.warn(
      `caravel task: warning — deadline is ${(mins / 60).toFixed(1)}h. A long deadline means a wedged park stays invisible for that long. Keep it tight enough to notice.`
    );
  }

  const deadline = new Date(Date.now() + mins * 60_000).toISOString();
  const watchRaw = args.watch;
  const watch =
    watchRaw && watchRaw !== true ? String(watchRaw) : `terminal rendezvous for ${task}`;
  const body = (resolveBody(args, root) || extraBody || "").trim();

  const text = [
    "---",
    "status: waiting",
    yamlLine("waiting_on", spec),
    yamlLine("deadline", deadline),
    yamlLine("watch", watch),
    yamlLine("summary", String(args.summary)),
    "---",
    "",
    body || "# Context\n\n(Launched external work; see `watch` above.)",
    "",
  ].join("\n");

  const path = join(tasksDir(root, agent, "waiting"), `${task}.md`);
  writeAtomic(path, text);
  return { path, deadline, spec };
}

// ── terminal (done / failed) ──────────────────────────────────────────────────

function writeTerminal(args: ParsedArgs, root: string, kind: "done" | "failed"): string {
  const task = String(args.task);
  const agent = String(args.agent);

  const fm: string[] = ["---", `status: ${kind}`];

  if (kind === "failed") {
    const reasonRaw = args.reason;
    const reason =
      reasonRaw && reasonRaw !== true ? String(reasonRaw) : "other";
    if (!(VALID_FAILURE_REASONS as readonly string[]).includes(reason)) {
      die(`--reason must be one of ${VALID_FAILURE_REASONS.join(", ")} (got "${reason}")`);
    }
    fm.push(yamlLine("reason", reason));
  }

  fm.push(yamlLine("summary", String(args.summary)));

  const reportPath = args["report-path"];
  if (reportPath && reportPath !== true) {
    fm.push(yamlLine("report_path", String(reportPath)));
  }

  fm.push("---", "");

  const body = resolveBody(args, root).trim();
  const text = `${fm.join("\n")}\n${body || "(no additional detail)"}\n`;
  const path = join(tasksDir(root, agent, kind), `${task}.md`);
  writeAtomic(path, text);
  return path;
}

// ── wrap ──────────────────────────────────────────────────────────────────────

function doWrap(args: ParsedArgs, root: string): void {
  requireFlags(args, ["task", "agent", "summary"]);
  assertEnvelope(root, String(args.agent), String(args.task));
  if (!args.cmd.length) die("wrap needs a command after `--`, e.g. `-- bun run script.mjs`");

  const logDir = join(root, ".caravel", "callback-logs");
  const logPath = join(logDir, `${String(args.task)}.log`);
  const cmdDisplay = args.cmd.map(shellQuote).join(" ");

  // Write the park record first — before any external process starts.
  const park = writePark(
    args,
    root,
    `# Context\n\nLaunched: \`${cmdDisplay}\`\n\nLog: \`${logPath.replace(root + "/", "")}\`\n\nThe wrapper writes the done/failed rendezvous when the command exits.\n`
  );

  // Shell shim: run the command, capture exit code, write the terminal rendezvous.
  const cliPath = import.meta.path;
  const shim = [
    "set -o pipefail",
    `"$@" >> ${JSON.stringify(logPath)} 2>&1`,
    "rc=$?",
    `tail -n ${LOG_TAIL_LINES} ${JSON.stringify(logPath)} > ${JSON.stringify(logPath + ".tail")} 2>/dev/null || true`,
    "if [ $rc -eq 0 ]; then",
    `  bun run ${JSON.stringify(cliPath)} done --task ${JSON.stringify(String(args.task))} --agent ${JSON.stringify(String(args.agent))} --summary ${JSON.stringify(String(args.summary) + " — completed (exit 0)")} --body-file ${JSON.stringify(logPath + ".tail")}`,
    "else",
    `  bun run ${JSON.stringify(cliPath)} failed --task ${JSON.stringify(String(args.task))} --agent ${JSON.stringify(String(args.agent))} --reason other --summary "${String(args.summary).replace(/"/g, "'")} — exited $rc" --body-file ${JSON.stringify(logPath + ".tail")}`,
    "fi",
  ].join("\n");

  const fd = openSync(logPath, "a");
  appendFileSync(fd, `\n=== caravel task wrap ${new Date().toISOString()} :: ${cmdDisplay} ===\n`);

  const child = spawn("bash", ["-c", shim, "bash", ...args.cmd], {
    cwd: root,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  child.unref();

  const rel = (p: string) => p.replace(root + "/", "");
  console.log(
    [
      `caravel task: parked ${String(args.agent)}/${String(args.task)} as waiting:on:${park.spec}`,
      `  park record : ${rel(park.path)}`,
      `  deadline    : ${park.deadline}`,
      `  launched    : ${cmdDisplay} (pid ${child.pid}, detached)`,
      `  log         : ${rel(logPath)}`,
      "",
      "Your turn's last action is this park — do NOT also write a done report,",
      "or it will shadow the real one and close the task early.",
    ].join("\n")
  );
}

// ── dispatch helpers ──────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Agent listing derived from disk (agents/<name>/agent.json). Matches listAgentNamesSync
 *  but scoped to a given workspace root rather than process.cwd(). */
function listLocalAgents(wsRoot: string): string[] {
  const dir = join(wsRoot, "agents");
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter(
        (name) =>
          !name.startsWith("_") &&
          !name.startsWith(".") &&
          existsSync(join(dir, name, "agent.json"))
      )
      .sort();
  } catch {
    return [];
  }
}

/** Extract a scalar value from a YAML string. Unwraps single- and double-quoted values.
 *  Ported from task.mjs with the 2026-08-26 quote-unwrap fix: a draft carrying
 *  `headline: "Foo"` must not round-trip to `headline: "\"Foo\""`. */
function extractField(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  if (!m) return null;
  let v = (m[1] ?? "").trim();
  if (
    v.length >= 2 &&
    ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))
  ) {
    const inner = v.slice(1, -1);
    if (v[0] === '"') {
      try { v = JSON.parse(v); } catch { v = inner; }
    } else {
      v = inner.replace(/''/g, "'");
    }
  }
  return v;
}

/** Extract Notes/Projects/<slug> entries from a YAML context: block-list. */
function extractContextProjects(yaml: string): string[] {
  const blockRe = /^context:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m;
  const m = blockRe.exec(yaml);
  if (!m) return [];
  const out: string[] = [];
  for (const line of (m[1] ?? "").split("\n")) {
    const lm = /^[ \t]+-\s*(.*)$/.exec(line);
    if (!lm) continue;
    let v = (lm[1] ?? "").trim();
    if (!v) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    const pm = /^Notes\/Projects\/([^/]+)\//.exec(v);
    if (pm) out.push(pm[1]!);
  }
  return out;
}

function inferProjectFromContext(contextProjects: string[]): string | null {
  if (contextProjects.length === 0) return null;
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const p of contextProjects) {
    if (!counts.has(p)) order.push(p);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best = order[0]!;
  let bestCount = counts.get(best) ?? 0;
  for (const p of order) {
    const c = counts.get(p) ?? 0;
    if (c > bestCount) { best = p; bestCount = c; }
  }
  return best;
}

/** Locate an envelope YAML by id across all agents and all scan buckets. Synchronous. */
function findEnvelopeByIdSync(id: string, agents: string[], wsRoot: string): string | null {
  for (const a of agents) {
    for (const bucket of ALLOCATION_SCAN_DIRS) {
      const p = join(wsRoot, "agents", a, "tasks", bucket, `${id}.yaml`);
      if (existsSync(p)) {
        try { return readFileSync(p, "utf8"); } catch { return null; }
      }
    }
  }
  return null;
}

/** Allocate the next available task ID using the seven-bucket scan (ALLOCATION_SCAN_DIRS).
 *  Deliberate improvement over task.mjs's five-bucket scan: prevents id reuse when the
 *  highest sibling sits in paused/ or blocked/ — both populated today. (F6) */
function allocateId(target: string, parent: string | null, wsRoot: string): string {
  const agents = listLocalAgents(wsRoot);

  if (parent) {
    const rootId = parent.split(".")[0]!;
    const childRe = new RegExp(`^${escapeRegex(rootId)}\\.(\\d+)$`);
    let maxN = 0;
    for (const a of agents) {
      for (const bucket of ALLOCATION_SCAN_DIRS) {
        const dir = join(wsRoot, "agents", a, "tasks", bucket);
        if (!existsSync(dir)) continue;
        for (const fname of readdirSync(dir)) {
          if (!fname.endsWith(".yaml")) continue;
          const id = fname.slice(0, -5);
          const m = childRe.exec(id);
          if (!m) continue;
          const n = parseInt(m[1]!, 10);
          if (Number.isFinite(n) && n > maxN) maxN = n;
        }
      }
    }
    return `${rootId}.${String(maxN + 1).padStart(2, "0")}`;
  }

  const d = new Date();
  const prefix =
    `TSK-${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}-`;
  const re = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`);
  let maxN = 0;
  for (const a of agents) {
    for (const bucket of ALLOCATION_SCAN_DIRS) {
      const dir = join(wsRoot, "agents", a, "tasks", bucket);
      if (!existsSync(dir)) continue;
      for (const fname of readdirSync(dir)) {
        if (!fname.endsWith(".yaml")) continue;
        const id = fname.slice(0, -5);
        const m = re.exec(id);
        if (!m) continue;
        const n = parseInt(m[1]!, 10);
        if (Number.isFinite(n) && n > maxN) maxN = n;
      }
    }
  }
  return prefix + String(maxN + 1).padStart(4, "0");
}

function journalAppend(
  wsRoot: string,
  agent: string,
  entry: Record<string, unknown>
): void {
  const path = join(wsRoot, "agents", agent, "tasks", "journal.ndjson");
  appendFileSync(path, JSON.stringify(entry) + "\n", { flag: "a" });
}

// ── policy lint (WAL-123 Phase B step 9) ─────────────────────────────────────

/** Extract a YAML block-sequence value (list items) from raw YAML text. */
function extractBlockList(yaml: string, key: string): string[] {
  const re = new RegExp(`^${key}:\\s*\\n((?:[ \\t]+-[^\\n]*\\n?)*)`, "m");
  const m = re.exec(yaml);
  if (!m) return [];
  const out: string[] = [];
  for (const line of (m[1] ?? "").split("\n")) {
    const lm = /^[ \t]+-\s*(.+)$/.exec(line);
    if (!lm) continue;
    let v = (lm[1] ?? "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out.push(v);
  }
  return out;
}

/** Extract a block scalar (|) or inline value for a given key. Returns null if absent. */
function extractLargeField(yaml: string, key: string): string | null {
  // Inline value
  const inlineRe = new RegExp(`^${key}:\\s+([^|>\\n][^\\n]*)$`, "m");
  const im = inlineRe.exec(yaml);
  if (im) return (im[1] ?? "").trim() || null;

  // Block scalar (|)
  const blockRe = new RegExp(`^${key}:\\s*\\|[^\\n]*\\n`, "m");
  const bm = blockRe.exec(yaml);
  if (!bm) return null;

  const afterKey = yaml.slice(bm.index + bm[0].length);
  const lines = afterKey.split("\n");
  const blockLines: string[] = [];
  let indent = -1;
  for (const line of lines) {
    if (line.trim() === "") {
      if (indent !== -1) blockLines.push("");
      continue;
    }
    const leading = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (indent === -1) {
      indent = leading;
      if (indent === 0) break;
    }
    if (leading < indent) break;
    blockLines.push(line.slice(indent));
  }
  return blockLines.join("\n").trim() || null;
}

/** Check whether any child of parentId exists anywhere in the workspace. */
function hasSiblingChild(parentId: string, agents: string[], wsRoot: string): boolean {
  const rootId = parentId.split(".")[0]!;
  const childRe = new RegExp(`^${escapeRegex(rootId)}\\.\\d+\\.yaml$`);
  for (const a of agents) {
    for (const bucket of ALLOCATION_SCAN_DIRS) {
      const dir = join(wsRoot, "agents", a, "tasks", bucket);
      if (!existsSync(dir)) continue;
      try {
        for (const fname of readdirSync(dir)) {
          if (childRe.test(fname)) return true;
        }
      } catch { continue; }
    }
  }
  return false;
}

/** Load all open/waiting sibling tasks (same parent) as {id, yaml} pairs. */
function loadSiblings(parentId: string, agents: string[], wsRoot: string): Array<{ id: string; yaml: string }> {
  const rootId = parentId.split(".")[0]!;
  const childRe = new RegExp(`^${escapeRegex(rootId)}\\.\\d+$`);
  const out: Array<{ id: string; yaml: string }> = [];
  for (const a of agents) {
    for (const bucket of ["open", "waiting"] as const) {
      const dir = join(wsRoot, "agents", a, "tasks", bucket);
      if (!existsSync(dir)) continue;
      try {
        for (const fname of readdirSync(dir)) {
          if (!fname.endsWith(".yaml")) continue;
          const id = fname.slice(0, -5);
          if (!childRe.test(id)) continue;
          try {
            const yaml = readFileSync(join(dir, fname), "utf8");
            out.push({ id, yaml });
          } catch { continue; }
        }
      } catch { continue; }
    }
  }
  return out;
}

/** Load all open tasks in the named project as {id, yaml} pairs. */
function loadOpenTasksInProject(project: string, agents: string[], wsRoot: string): Array<{ id: string; yaml: string }> {
  const out: Array<{ id: string; yaml: string }> = [];
  for (const a of agents) {
    const dir = join(wsRoot, "agents", a, "tasks", "open");
    if (!existsSync(dir)) continue;
    try {
      for (const fname of readdirSync(dir)) {
        if (!fname.endsWith(".yaml")) continue;
        try {
          const yaml = readFileSync(join(dir, fname), "utf8");
          const p = (extractField(yaml, "project") ?? "").trim();
          if (p === project) out.push({ id: fname.slice(0, -5), yaml });
        } catch { continue; }
      }
    } catch { continue; }
  }
  return out;
}

/** Check the budget against historical median (n ≥ 5 guard). Returns a warning string or null. */
function checkBudgetWarn(body: string, agents: string[], wsRoot: string): string | null {
  const budgetTurnsRe = /^budget:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+max_turns:\s*(\d+)/m;
  const bm = budgetTurnsRe.exec(body);
  if (!bm) return null;
  const budgetTurns = parseInt(bm[1]!, 10);
  if (!Number.isFinite(budgetTurns) || budgetTurns <= 0) return null;

  const kind = (extractField(body, "kind") ?? "other").trim();
  const to = (extractField(body, "to") ?? "").trim();

  const usages: number[] = [];
  for (const a of agents) {
    for (const bucket of ["done", "failed"] as const) {
      const dir = join(wsRoot, "agents", a, "tasks", bucket);
      if (!existsSync(dir)) continue;
      try {
        for (const fname of readdirSync(dir)) {
          if (!fname.endsWith(".yaml")) continue;
          try {
            const yaml = readFileSync(join(dir, fname), "utf8");
            if ((extractField(yaml, "kind") ?? "other").trim() !== kind) continue;
            if ((extractField(yaml, "to") ?? "").trim() !== to) continue;
            const usageTurnsRe = /^usage:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+turns:\s*(\d+)/m;
            const um = usageTurnsRe.exec(yaml);
            if (!um) continue;
            const turns = parseInt(um[1]!, 10);
            if (Number.isFinite(turns) && turns > 0) usages.push(turns);
          } catch { continue; }
        }
      } catch { continue; }
    }
  }

  if (usages.length < 5) return null; // n ≥ 5 guard — dormant until data accumulates

  usages.sort((a, b) => a - b);
  const median = usages[Math.floor(usages.length / 2)]!;
  if (budgetTurns > median * 1.5) {
    return `budget max_turns ${budgetTurns} is more than 1.5× the median (${median}) for ${kind}/${to} over ${usages.length} recorded tasks`;
  }
  if (budgetTurns < median * 0.5) {
    return `budget max_turns ${budgetTurns} is under 0.5× the median (${median}) for ${kind}/${to} over ${usages.length} recorded tasks`;
  }
  return null;
}

/** Extract path-like references from text that look like agent rule paths or Notes/repos paths. */
function extractRuleAndDocPaths(text: string): string[] {
  const paths: string[] = [];
  const pathRe = /\b(agents\/[^\s,;`'"()[\]{}\n]+\.(?:md|ts|js|yaml|json)|Notes\/Projects\/[^\s,;`'"()[\]{}\n]+(?:\.md)?|repos\/[^\s,;`'"()[\]{}\n]+\.(?:md|ts|js|yaml|json))\b/g;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(text)) !== null) {
    paths.push(m[1]!);
  }
  return [...new Set(paths)];
}

/** Return true if the repo directory has a recognisable lint configuration. */
function repoHasLintConfig(repoPath: string): boolean {
  const lintFiles = [
    ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml",
    "biome.json", ".biome.json", "eslint.config.js", "eslint.config.mjs", "eslint.config.ts",
  ];
  if (lintFiles.some((f) => existsSync(join(repoPath, f)))) return true;
  const pkgPath = join(repoPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      const s = pkg.scripts ?? {};
      if (s["lint"] || s["lint:check"] || s["lint:fix"]) return true;
    } catch { /* ignore */ }
  }
  return false;
}

export type LintResult = {
  hardFails: string[];
  warnings: string[];
  /** True when --force bypassed the second-retry hard-fail. Must be logged by the caller. */
  forceBypassed: boolean;
};

/**
 * Policy lint for a new envelope. Warn by default; four absolute hard-fails plus one
 * escapable hard-fail (second retry, bypassable with --force).
 *
 * Called by doNew before writing, and available standalone as `caravel task lint`.
 * A lint that fails *after* a partial write is worse than no lint — this always
 * runs on the in-memory body before writeAtomic().
 */
export function doLintNewEnvelope(
  body: string,
  wsRoot: string,
  opts?: { force?: boolean }
): LintResult {
  const hardFails: string[] = [];
  const warnings: string[] = [];
  let forceBypassed = false;

  const agents = listLocalAgents(wsRoot);

  // ── H1: Unknown agent (to: field) ──────────────────────────────────────────
  const toField = (extractField(body, "to") ?? "").trim();
  if (toField && agents.length > 0 && !agents.includes(toField)) {
    hardFails.push(`unknown agent "${toField}". known: ${agents.join(", ")}`);
  }

  // ── H2: Missing required fields for status ──────────────────────────────────
  const status = (extractField(body, "status") ?? "open").trim();
  const required = (REQUIRED_FIELDS[status] ?? REQUIRED_FIELDS["open"]!) as readonly string[];
  for (const f of required) {
    const v = (extractField(body, f) ?? "").trim();
    if (!v || v === "null") {
      hardFails.push(`missing required field "${f}" for status "${status}"`);
    }
  }

  // ── H3: Headline > 10 words ─────────────────────────────────────────────────
  const rawHeadline = (extractField(body, "headline") ?? "").trim();
  const headline = rawHeadline.replace(/^"|"$/g, "").trim();
  const wordCount = headline ? headline.split(/\s+/).filter(Boolean).length : 0;
  if (headline && wordCount > 10) {
    hardFails.push(`headline too long (${wordCount} words; max 10): ${rawHeadline}`);
  }

  // ── H4: waiting_on not in allow-list ────────────────────────────────────────
  const waitingOn = (extractField(body, "waiting_on") ?? "").trim();
  if (waitingOn && !VALID_WAITING_SPECS.has(waitingOn)) {
    hardFails.push(
      `waiting_on "${waitingOn}" is not valid. allowed: ${[...VALID_WAITING_SPECS].join(", ")}`
    );
  }

  // ── H5: Second retry (escapable with --force, bypass must be logged) ─────────
  const parent = (extractField(body, "parent") ?? "").trim();
  if (parent && parent !== "null") {
    if (hasSiblingChild(parent, agents, wsRoot)) {
      if (!opts?.force) {
        hardFails.push(
          `second retry of ${parent}: a prior child task already exists. Use --force to dispatch anyway (bypass will be logged).`
        );
      } else {
        forceBypassed = true;
        console.warn(
          `caravel task lint: WARNING — second retry of ${parent} dispatched with --force (logged in journal)`
        );
      }
    }
  }

  // ── W1: Overlapping touches: with no needs: edge (F2 row 1) ─────────────────
  const myTouches = extractBlockList(body, "touches");
  if (myTouches.length > 0 && parent && parent !== "null") {
    const siblings = loadSiblings(parent, agents, wsRoot);
    for (const { id: sibId, yaml: sibYaml } of siblings) {
      const sibTouches = extractBlockList(sibYaml, "touches");
      const overlap = myTouches.filter((t) => sibTouches.includes(t));
      if (overlap.length === 0) continue;
      const myNeeds = extractBlockList(body, "needs");
      if (!myNeeds.includes(sibId)) {
        const sample = overlap.slice(0, 3).join(", ") + (overlap.length > 3 ? ` (+${overlap.length - 3} more)` : "");
        warnings.push(
          `touches: overlaps with ${sibId} on ${sample}; chain with needs: or sequence the work`
        );
      }
    }
  }

  // ── W2: ≥2 parallel siblings in same project, none declares touches: ─────────
  // companion warn — makes the W1 silence-on-missing-touches degrade loudly
  if (myTouches.length === 0) {
    const project = (extractField(body, "project") ?? "").trim();
    if (project && project !== "null") {
      const openInProject = loadOpenTasksInProject(project, agents, wsRoot);
      if (openInProject.length >= 1) {
        const anyHasTouches = openInProject.some(
          ({ yaml }) => extractBlockList(yaml, "touches").length > 0
        );
        if (!anyHasTouches) {
          warnings.push(
            `≥2 parallel tasks in project "${project}" and none declares touches: — collision check can't run; declare touches: or chain with needs:`
          );
        }
      }
    }
  }

  // ── W3: Budget outside 0.5×–1.5× median (n ≥ 5 guard — dormant until data accumulates) ──
  const budgetWarn = checkBudgetWarn(body, agents, wsRoot);
  if (budgetWarn) warnings.push(budgetWarn);

  // ── W4: Brief references rule/doc path absent from context: (F2 row 5) ──────
  const briefText = extractLargeField(body, "brief");
  const contextPaths = extractBlockList(body, "context");
  if (briefText) {
    for (const refPath of extractRuleAndDocPaths(briefText)) {
      const inContext = contextPaths.some((cp) => {
        const a = cp.replace(/^["']|["']$/g, "").trim();
        return a === refPath || a.endsWith("/" + refPath) || refPath.startsWith(a.split("/").slice(0, 3).join("/"));
      });
      if (!inContext) {
        warnings.push(`brief references "${refPath}" but it's absent from context:`);
      }
    }
  }

  // ── W5: Brief mentions "lint" for a repo with no lint config (F2 row 4) ──────
  if (briefText && /\blint\b/i.test(briefText)) {
    const touchedRepos = myTouches
      .filter((t) => t.startsWith("repos/"))
      .map((t) => t.split("/")[1])
      .filter((r): r is string => !!r);
    for (const repo of [...new Set(touchedRepos)]) {
      const repoPath = join(wsRoot, "repos", repo);
      if (existsSync(repoPath) && !repoHasLintConfig(repoPath)) {
        warnings.push(
          `brief mentions "lint" but repos/${repo} has no lint config. Did you mean \`tsc --noEmit\`?`
        );
      }
    }
  }

  // ── W6: No output_format or no named artefact path ───────────────────────────
  const outputFormat = extractLargeField(body, "output_format");
  if (!outputFormat) {
    warnings.push(
      "no output_format field — add one naming the artefact path (e.g. agents/bob/tasks/done/<id>.md)"
    );
  } else if (!outputFormat.includes("/")) {
    warnings.push(
      "output_format has no named artefact path — include the file the worker should produce (e.g. agents/bob/tasks/done/<id>.md)"
    );
  }

  return { hardFails, warnings, forceBypassed };
}

// ── standalone lint subcommand ─────────────────────────────────────────────────

function doLint(args: ParsedArgs, root: string): void {
  const yamlPath = args.yaml;
  if (!yamlPath || yamlPath === true) {
    die("usage: task lint --yaml <envelope.yaml> [--force]");
  }
  const p = resolve(String(yamlPath));
  if (!existsSync(p)) die(`file not found: ${p}`);
  const body = readFileSync(p, "utf8");
  const force = !!args.force;

  const result = doLintNewEnvelope(body, root, { force });

  const hf = result.hardFails.length;
  const wn = result.warnings.length;
  console.log(
    `caravel task lint: ${hf} hard-fail${hf !== 1 ? "s" : ""}, ${wn} warning${wn !== 1 ? "s" : ""}`
  );
  for (const f of result.hardFails) console.error(`  ✗ ${f}`);
  for (const w of result.warnings) console.log(`  ⚠ ${w}`);

  if (hf > 0) {
    console.error("\nFAIL");
    process.exit(1);
  }
  console.log(wn > 0 ? "\nOK (with warnings)" : "\nOK");
}

// ── new ───────────────────────────────────────────────────────────────────────

function doNew(args: ParsedArgs, root: string): void {
  const target = args.target;
  const draftPath = args.yaml;

  if (!target || target === true || !draftPath || draftPath === true) {
    die(
      'usage: task new --target <agent> --yaml <draft.yaml> [--parent TSK-...] [--project <slug>] [--headline "..."]'
    );
  }

  const targetStr = String(target);
  const agents = listLocalAgents(root);
  if (!agents.includes(targetStr)) {
    die(`unknown target agent: ${targetStr}. known: ${agents.join(", ")}`);
  }

  const draftPathStr = String(draftPath);
  if (!existsSync(draftPathStr)) {
    die(`draft not found: ${draftPathStr}`);
  }

  const draft = readFileSync(draftPathStr, "utf8");

  // Headline is required, ≤10 words. CLI flag wins over the YAML field so
  // dispatchers can supply it without rewriting the draft.
  const headlineFromFlag = args.headline && args.headline !== true ? String(args.headline) : null;
  const headlineFromYaml = extractField(draft, "headline");
  const headline = (headlineFromFlag ?? headlineFromYaml ?? "").trim();
  if (!headline) {
    die('headline is required (≤10 words). Pass --headline "…" or add `headline:` to the YAML.');
  }
  const wordCount = headline.split(/\s+/).filter(Boolean).length;
  if (wordCount > 10) {
    die(`headline is too long (${wordCount} words; max 10). Tighten it.`);
  }

  // Parent is taken from --parent flag or the YAML's `parent:` field.
  // Drives decimal sub-id allocation. null/empty means top-level.
  const parentFlag = args.parent && args.parent !== true ? String(args.parent) : null;
  const parentFromYaml = extractField(draft, "parent");
  const parentRaw = parentFlag ?? parentFromYaml;
  const parent =
    parentRaw && parentRaw !== "null" && parentRaw !== "" ? parentRaw.trim() : null;

  const id = allocateId(targetStr, parent, root);
  const now = new Date().toISOString();

  // Replace the id/headline/created/updated fields if present, else prepend.
  let body = draft;
  body = body.replace(/^id:\s*.*$/m, `id: ${id}`);

  // Quote the headline (JSON.stringify → valid YAML scalar) so a colon in
  // the title ("Follow-on: X") can't make the envelope unparseable to js-yaml
  // (→ invisible in the UI), and DEDUPE it: drafts have historically carried
  // `headline:` twice (header + a stray one in the body block), which is a
  // duplicate-key error under strict parsers. Keep exactly one, quoted. (2026-08-26)
  const hl = JSON.stringify(headline);
  let sawHeadline = false;
  body = body.replace(/^headline:[ \t]*.*$/gm, () => {
    if (sawHeadline) return "\u0000HL_DROP\u0000";
    sawHeadline = true;
    return `headline: ${hl}`;
  });
  body = body.split("\n").filter((l) => l !== "\u0000HL_DROP\u0000").join("\n");

  body = body.replace(/^created:\s*.*$/m, `created: ${now}`);
  body = body.replace(/^updated:\s*.*$/m, `updated: ${now}`);

  // Prepend only the header fields the draft is actually missing. Injecting
  // the whole block unconditionally is what produced duplicate `headline:`
  // keys on TSK-2026-08-26-0001: the draft led with `headline:` and no `id:`,
  // so the dedupe pass above kept the draft's one and this prepend added a
  // second — a duplicate-key error under strict YAML parsers, which is the
  // exact corruption class validate-envelopes exists to catch. (2026-08-26)
  if (!/^id:\s/m.test(body)) {
    let header = `id: ${id}\n`;
    if (!/^headline:\s/m.test(body)) header += `headline: ${hl}\n`;
    if (!/^created:\s/m.test(body)) header += `created: ${now}\n`;
    if (!/^updated:\s/m.test(body)) header += `updated: ${now}\n`;
    body = header + body;
  }
  if (!/^headline:\s/m.test(body)) {
    body = body.replace(/^id:\s.*$/m, (m) => `${m}\nheadline: ${hl}`);
  }
  // Force status to open and clear lease.
  body = body.replace(/^status:\s*.*$/m, "status: open");

  // Authoritative identity block — the CLI OWNS from/to/parent/reply_to,
  // NOT the draft. Previously these were only whatever the draft happened to
  // contain, so a draft that omitted `parent:` (while passing --parent for the
  // decimal id) produced a malformed `<root>.NN` envelope with no parent field.
  // The dashboard family-tree is built off `parent`, so such a task can't be
  // placed and goes invisible (the TSK-2026-07-03-0001.10 / .12 bug). Now we
  // always write a complete, correct identity block regardless of the draft.
  const fromRaw = args.from && args.from !== true ? String(args.from) : null;
  const replyToRaw = args["reply-to"] && args["reply-to"] !== true ? String(args["reply-to"]) : null;
  const fromVal = (fromRaw ?? extractField(draft, "from") ?? "alice").trim() || "alice";
  const replyToVal = (replyToRaw ?? extractField(draft, "reply_to") ?? fromVal).trim() || fromVal;

  // Strip any existing top-level identity lines (dedupe / drop stale values),
  // then insert one authoritative block right after the id/created header.
  body = body.replace(/^(from|to|parent|reply_to):[^\n]*\n?/gm, "");
  const identityBlock =
    `from: ${fromVal}\n` +
    `to: ${targetStr}\n` +
    `parent: ${parent ?? "null"}\n` +
    `reply_to: ${replyToVal}\n`;

  let idInserted = false;
  for (const anchor of [/^(updated:[^\n]*\n)/m, /^(headline:[^\n]*\n)/m, /^(id:[^\n]*\n)/m]) {
    if (anchor.test(body)) {
      body = body.replace(anchor, (_m, g1: string) => `${g1}\n${identityBlock}\n`);
      idInserted = true;
      break;
    }
  }
  if (!idInserted) body = identityBlock + "\n" + body;
  body = body.replace(/\n{3,}/g, "\n\n");

  // Project tag: --project flag wins, then draft YAML, then parent task, then context inference.
  const projectFlag = args.project && args.project !== true ? String(args.project) : null;
  const projectFromYaml = extractField(body, "project");
  let project = (projectFlag ?? projectFromYaml ?? "").trim();
  if (project === "null") project = "";

  // Inherit the parent task's project when the dispatcher didn't set one.
  if (!project && parent) {
    const parentYaml = findEnvelopeByIdSync(parent, agents, root);
    if (parentYaml) {
      const pp = (extractField(parentYaml, "project") ?? "").trim();
      if (pp && pp !== "null") project = pp;
    }
  }
  if (!project) {
    const inferred = inferProjectFromContext(extractContextProjects(body));
    if (inferred) project = inferred;
  }
  if (project) {
    if (/^project:\s*.*$/m.test(body)) {
      body = body.replace(/^project:\s*.*$/m, `project: ${project}`);
    } else {
      for (const anchor of [/^priority:\s*.*$/m, /^kind:\s*.*$/m, /^deadline:\s*.*$/m]) {
        if (anchor.test(body)) {
          body = body.replace(anchor, (m) => `${m}\nproject: ${project}`);
          break;
        }
      }
    }
  }

  // Stamp originating chat thread (if any) so the runner can post the
  // result back to the chat that spawned the task.
  const chatId =
    (args.chat && args.chat !== true ? String(args.chat) : null) ??
    process.env.CARAVEL_CHAT_ID ??
    null;
  if (chatId && !/^dispatch:/m.test(body)) {
    const dispatchBlock = `\ndispatch:\n  chat_id: ${chatId}\n  chat_ts: ${now}\n`;
    body = body.trimEnd() + "\n" + dispatchBlock;
  }

  // Policy lint: runs on the complete body before writing. Hard-fails reject before
  // writeAtomic() so a lint failure never touches disk. --force bypasses the
  // second-retry check only; its use is recorded in the journal entry below.
  const force = !!args.force;
  const lintResult = doLintNewEnvelope(body, root, { force });

  for (const w of lintResult.warnings) {
    console.warn(`caravel task lint: ⚠ ${w}`);
  }
  if (lintResult.hardFails.length > 0) {
    for (const f of lintResult.hardFails) {
      console.error(`caravel task lint: ✗ ${f}`);
    }
    die("lint failed — fix the issues above before dispatching");
  }

  const openDir = join(root, "agents", targetStr, "tasks", "open");
  writeAtomic(join(openDir, `${id}.yaml`), body);

  const fromField = extractField(body, "from") ?? "unknown";
  const kindField = extractField(body, "kind") ?? "other";
  const journalParent = extractField(body, "parent");
  journalAppend(root, targetStr, {
    ts: now,
    id,
    status: "open",
    kind: kindField,
    from: fromField,
    to: targetStr,
    parent: journalParent === "null" || journalParent === null ? null : journalParent,
    summary: "",
    ...(lintResult.forceBypassed ? { lint_force_bypass: true } : {}),
  });

  console.log(id);
}

// ── next-id ───────────────────────────────────────────────────────────────────

function doNextId(args: ParsedArgs, root: string): void {
  const target = args.target;
  if (!target || target === true) {
    die("usage: task next-id --target <agent> [--parent TSK-...]");
  }
  const targetStr = String(target);
  const agents = listLocalAgents(root);
  if (!agents.includes(targetStr)) {
    die(`usage: task next-id --target <agent> [--parent TSK-...]. known: ${agents.join(", ")}`);
  }
  const parentRaw = args.parent && args.parent !== true ? String(args.parent) : null;
  console.log(allocateId(targetStr, parentRaw, root));
}

// ── list ──────────────────────────────────────────────────────────────────────

function doList(args: ParsedArgs, root: string): void {
  const agent = args.agent;
  if (!agent || agent === true) {
    die("usage: task list --agent <name> [--status open|done|failed]");
  }
  const agentStr = String(agent);
  const statusFilter = args.status && args.status !== true ? String(args.status) : null;
  const buckets: readonly string[] = statusFilter ? [statusFilter] : DISPATCH_LIST_BUCKETS;
  const out: Array<{ agent: string; bucket: string; file: string }> = [];
  for (const b of buckets) {
    const dir = join(root, "agents", agentStr, "tasks", b);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"))
      .sort();
    for (const f of files) {
      out.push({ agent: agentStr, bucket: b, file: f });
    }
  }
  console.log(JSON.stringify(out, null, 2));
}

// ── summary ───────────────────────────────────────────────────────────────────

function doSummary(root: string): void {
  const agents = listLocalAgents(root);
  const out: {
    byAgent: Record<string, Record<string, number>>;
    escalated: Array<{ agent: string; file: string }>;
    waitingUser: Array<{ agent: string; file: string; summary: string }>;
    totals: Record<string, number>;
  } = {
    byAgent: {},
    escalated: [],
    waitingUser: [],
    totals: { open: 0, waiting: 0, done: 0, failed: 0, archived: 0 },
  };

  for (const a of agents) {
    const counts: Record<string, number> = { open: 0, waiting: 0, done: 0, failed: 0, archived: 0 };
    for (const b of DISPATCH_SUMMARY_COUNT_BUCKETS) {
      const dir = join(root, "agents", a, "tasks", b);
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
      counts[b] = files.length;
      if (out.totals[b] !== undefined) out.totals[b]! += files.length;
      if (b === "waiting") {
        for (const f of files) {
          try {
            const yaml = readFileSync(join(dir, f), "utf8");
            const status = extractField(yaml, "status") ?? "";
            const summaryBrief = extractField(yaml, "brief") ?? "";
            if (status === "waiting:on:user") {
              out.waitingUser.push({ agent: a, file: f, summary: summaryBrief });
            }
          } catch {
            // skip unreadable files
          }
        }
      }
      if (b === "failed") {
        for (const f of files) {
          try {
            const yaml = readFileSync(join(dir, f), "utf8");
            const status = extractField(yaml, "status") ?? "";
            if (status === "escalated") {
              out.escalated.push({ agent: a, file: f });
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }
    out.byAgent[a] = counts;
  }

  console.log(JSON.stringify(out, null, 2));
}

// ── batch dispatch (WAL-123 Phase C v2) ───────────────────────────────────────

type BatchTaskSpec = {
  headline?: unknown;
  to?: unknown;
  from?: unknown;
  kind?: unknown;
  project?: unknown;
  deadline?: unknown;
  priority?: unknown;
  budget?: unknown;
  needs?: unknown;
  after?: unknown;
  context?: unknown;
  touches?: unknown;
  brief?: unknown;
  output_format?: unknown;
  [key: string]: unknown;
};

type BatchSpec = {
  from?: unknown;
  to?: unknown;
  project?: unknown;
  tasks?: unknown;
};

/** Allocate N consecutive TSK IDs from the current on-disk max. Never touches disk. */
function allocateIdBatch(count: number, wsRoot: string): string[] {
  if (count <= 0) return [];
  const agents = listLocalAgents(wsRoot);
  const d = new Date();
  const prefix =
    `TSK-${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}-`;
  const re = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`);
  let maxN = 0;
  for (const a of agents) {
    for (const bucket of ALLOCATION_SCAN_DIRS) {
      const dir = join(wsRoot, "agents", a, "tasks", bucket);
      if (!existsSync(dir)) continue;
      for (const fname of readdirSync(dir)) {
        if (!fname.endsWith(".yaml")) continue;
        const id = fname.slice(0, -5);
        const m = re.exec(id);
        if (!m) continue;
        const n = parseInt(m[1]!, 10);
        if (Number.isFinite(n) && n > maxN) maxN = n;
      }
    }
  }
  return Array.from({ length: count }, (_, i) => prefix + String(maxN + 1 + i).padStart(4, "0"));
}

/**
 * Build an envelope YAML body string from a batch task spec.
 * Local labels in needs:/after: are substituted using labelToId.
 */
function buildBatchEnvelope(
  id: string,
  spec: BatchTaskSpec,
  labelToId: Map<string, string>,
  defaults: { from?: string; to?: string; project?: string },
  now: string
): string {
  const headline = JSON.stringify(String(spec.headline ?? "").trim());
  const from = String(spec.from ?? defaults.from ?? "alice").trim();
  const to = String(spec.to ?? defaults.to ?? "alice").trim();
  const kind = String(spec.kind ?? "code").trim();
  const project = String(spec.project ?? defaults.project ?? "null").trim() || "null";
  const deadline = spec.deadline != null ? String(spec.deadline) : "null";
  const priority = spec.priority != null ? String(spec.priority) : "P3";

  const rawNeeds = Array.isArray(spec.needs) ? spec.needs.map(String) : [];
  const rawAfter = Array.isArray(spec.after) ? spec.after.map(String) : [];
  const resolvedNeeds = rawNeeds.map((l) => labelToId.get(l) ?? l);
  const resolvedAfter = rawAfter.map((l) => labelToId.get(l) ?? l);

  const lines: string[] = [
    `id: ${id}`,
    `headline: ${headline}`,
    `created: ${now}`,
    `updated: ${now}`,
    "",
    `from: ${from}`,
    `to: ${to}`,
    "parent: null",
    `reply_to: ${from}`,
    "",
    `kind: ${kind}`,
    `project: ${project}`,
    `deadline: ${deadline}`,
    `priority: ${priority}`,
    "",
  ];

  const bSpec =
    spec.budget != null && typeof spec.budget === "object"
      ? (spec.budget as Record<string, unknown>)
      : {};
  lines.push("budget:");
  lines.push(`  max_turns: ${bSpec.max_turns ?? 50}`);
  lines.push(`  max_subagents: ${bSpec.max_subagents ?? 0}`);
  lines.push(`  max_usd: ${bSpec.max_usd ?? "null"}`);
  lines.push("");

  if (resolvedNeeds.length > 0) {
    lines.push("needs:");
    for (const dep of resolvedNeeds) lines.push(`  - ${dep}`);
    lines.push("");
  }

  if (resolvedAfter.length > 0) {
    lines.push("after:");
    for (const dep of resolvedAfter) lines.push(`  - ${dep}`);
    lines.push("");
  }

  const context = Array.isArray(spec.context) ? spec.context.map(String) : [];
  if (context.length > 0) {
    lines.push("context:");
    for (const c of context) lines.push(`  - ${JSON.stringify(c)}`);
    lines.push("");
  }

  const touches = Array.isArray(spec.touches) ? spec.touches.map(String) : [];
  if (touches.length > 0) {
    lines.push("touches:");
    for (const t of touches) lines.push(`  - ${JSON.stringify(t)}`);
    lines.push("");
  }

  const brief = String(spec.brief ?? "").trim();
  if (brief) {
    lines.push("brief: |");
    for (const line of brief.split("\n")) lines.push(`  ${line}`);
    lines.push("");
  }

  const outputFormat = String(spec.output_format ?? "").trim();
  if (outputFormat) {
    if (outputFormat.includes("\n")) {
      lines.push("output_format: |");
      for (const line of outputFormat.split("\n")) lines.push(`  ${line}`);
    } else {
      lines.push(`output_format: ${outputFormat}`);
    }
    lines.push("");
  }

  lines.push("status: open");
  return lines.join("\n").trimEnd() + "\n";
}

/**
 * Topological sort via Kahn's algorithm.
 * allDeps maps label → list of labels it depends on (must complete before it).
 * Returns the sorted order, or null if a cycle exists.
 */
function topoSort(labels: string[], allDeps: Map<string, string[]>): string[] | null {
  const successors = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const l of labels) {
    successors.set(l, []);
    inDeg.set(l, 0);
  }
  for (const [label, deps] of allDeps) {
    for (const dep of deps) {
      successors.get(dep)?.push(label);
      inDeg.set(label, (inDeg.get(label) ?? 0) + 1);
    }
  }
  const queue = labels.filter((l) => (inDeg.get(l) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const s of successors.get(node) ?? []) {
      const d = (inDeg.get(s) ?? 0) - 1;
      inDeg.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  return order.length === labels.length ? order : null;
}

/**
 * Dispatch a connected set of tasks from a batch spec YAML.
 *
 * The spec must have a `tasks:` map. Each task may reference sibling tasks in
 * the batch by label in `needs:` and `after:`. The whole graph is linted and
 * validated before any file is written — a single failure aborts the entire
 * batch. This prevents the "first task is already running when I found the
 * mistake in a later task" problem.
 *
 * Usage: caravel task batch --yaml batch-spec.yaml [--force]
 */
function doBatch(args: ParsedArgs, root: string): void {
  const specPath = args.yaml && args.yaml !== true ? String(args.yaml) : null;
  if (!specPath) {
    die("usage: task batch --yaml <batch-spec.yaml> [--force]");
  }
  if (!existsSync(specPath)) {
    die(`batch spec not found: ${specPath}`);
  }

  const raw = readFileSync(specPath, "utf8");
  let spec: BatchSpec;
  try {
    spec = parseYaml(raw) as BatchSpec;
  } catch (e: unknown) {
    die(`batch spec YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!spec || typeof spec !== "object" || typeof spec.tasks !== "object" || spec.tasks === null) {
    die("batch spec must have a `tasks:` map at the top level");
  }

  const tasksMap = spec.tasks as Record<string, unknown>;
  const labels = Object.keys(tasksMap);

  if (labels.length === 0) {
    die("batch spec has no tasks");
  }

  const defaults = {
    from: spec.from != null ? String(spec.from) : undefined,
    to: spec.to != null ? String(spec.to) : undefined,
    project: spec.project != null ? String(spec.project) : undefined,
  };

  // ── 1. validate structure and collect deps ────────────────────────────────
  const taskSpecs = new Map<string, BatchTaskSpec>();
  const allDeps = new Map<string, string[]>();
  const structErrors: string[] = [];

  for (const [label, raw] of Object.entries(tasksMap)) {
    if (!raw || typeof raw !== "object") {
      structErrors.push(`task "${label}": must be an object`);
      continue;
    }
    const ts = raw as BatchTaskSpec;
    taskSpecs.set(label, ts);

    const needs = Array.isArray(ts.needs) ? ts.needs.map(String) : [];
    const after = Array.isArray(ts.after) ? ts.after.map(String) : [];
    const deps: string[] = [];

    for (const ref of [...needs, ...after]) {
      if (!labels.includes(ref)) {
        structErrors.push(`task "${label}": references unknown label "${ref}" in needs:/after: — must be another task label in this batch`);
      } else {
        deps.push(ref);
      }
    }
    allDeps.set(label, deps);
  }

  if (structErrors.length > 0) {
    for (const e of structErrors) console.error(`caravel task batch: ✗ ${e}`);
    die("batch aborted — fix structural errors above");
  }

  // ── 2. cycle detection ────────────────────────────────────────────────────
  const topoOrder = topoSort(labels, allDeps);
  if (topoOrder === null) {
    const cyclic = labels.filter((l) => {
      const visited = new Set<string>();
      const stack = [...(allDeps.get(l) ?? [])];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (cur === l) return true;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const dep of allDeps.get(cur) ?? []) stack.push(dep);
      }
      return false;
    });
    die(`batch has a dependency cycle involving: ${cyclic.join(", ")}`);
  }

  // ── 3. lint each task before any file is written ──────────────────────────
  // Local labels in needs:/after: are passed through as-is — the lint rules
  // don't inspect those fields, so leaving them as local labels is safe here.
  const force = !!args.force;
  const lintErrors: Array<{ label: string; fails: string[] }> = [];
  const lintWarnings: Array<{ label: string; warns: string[] }> = [];

  // Placeholder map: local labels → themselves (substituted with real IDs later).
  const placeholderMap = new Map<string, string>();
  for (const l of labels) placeholderMap.set(l, l);

  const now = new Date().toISOString();

  for (const label of labels) {
    const ts = taskSpecs.get(label)!;
    const body = buildBatchEnvelope("TSK-BATCH-LINT", ts, placeholderMap, defaults, now);
    const result = doLintNewEnvelope(body, root, { force });
    if (result.hardFails.length > 0) lintErrors.push({ label, fails: result.hardFails });
    if (result.warnings.length > 0) lintWarnings.push({ label, warns: result.warnings });
  }

  for (const { label, warns } of lintWarnings) {
    for (const w of warns) console.warn(`caravel task batch lint [${label}]: ⚠ ${w}`);
  }

  if (lintErrors.length > 0) {
    for (const { label, fails } of lintErrors) {
      for (const f of fails) console.error(`caravel task batch lint [${label}]: ✗ ${f}`);
    }
    die(`batch lint failed — ${lintErrors.length} task(s) have errors. Fix them before dispatching`);
  }

  // ── 4. allocate IDs (no disk writes yet) ─────────────────────────────────
  const ids = allocateIdBatch(labels.length, root);
  const labelToId = new Map<string, string>();
  for (let i = 0; i < labels.length; i++) {
    labelToId.set(labels[i]!, ids[i]!);
  }

  // ── 5. build final envelope bodies with real IDs substituted ─────────────
  const envelopes: Array<{ id: string; to: string; body: string }> = [];
  for (const label of labels) {
    const ts = taskSpecs.get(label)!;
    const id = labelToId.get(label)!;
    const body = buildBatchEnvelope(id, ts, labelToId, defaults, now);
    const to = String(ts.to ?? defaults.to ?? "alice").trim();
    envelopes.push({ id, to, body });
  }

  // ── 6. write all envelopes ────────────────────────────────────────────────
  const agents = listLocalAgents(root);
  for (const { id, to, body } of envelopes) {
    if (!agents.includes(to)) {
      die(`batch: cannot write task ${id} — unknown agent "${to}". known: ${agents.join(", ")}`);
    }
    const openDir = join(root, "agents", to, "tasks", "open");
    writeAtomic(join(openDir, `${id}.yaml`), body);

    const fromField = extractField(body, "from") ?? "unknown";
    const kindField = extractField(body, "kind") ?? "other";
    journalAppend(root, to, {
      ts: now,
      id,
      status: "open",
      kind: kindField,
      from: fromField,
      to,
      parent: null,
      summary: "",
    });

    console.log(id);
  }

  if (envelopes.length > 1) {
    process.stderr.write(
      `caravel task batch: dispatched ${envelopes.length} tasks (${ids[0]} – ${ids[ids.length - 1]})\n`
    );
  }
}

// ── delegate ──────────────────────────────────────────────────────────────────

/** Read a YAML list field handling both inline [a, b] and block-sequence form.
 *  Strips surrounding quotes from items. Returns [] when absent or empty. */
function readListFromYaml(yaml: string, key: string): string[] {
  function stripQ(s: string) {
    return s.length >= 2 &&
      ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))
      ? s.slice(1, -1)
      : s;
  }
  const iM = new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m").exec(yaml);
  if (iM) {
    const inner = (iM[1] ?? "").trim();
    return inner ? inner.split(",").map((s) => stripQ(s.trim())).filter(Boolean) : [];
  }
  const bM = new RegExp(`^${key}:\\s*\\n((?:[ \\t]+-[ \\t]+[^\\n]+\\n?)*)`, "m").exec(yaml);
  if (bM) {
    return (bM[1] ?? "")
      .split("\n")
      .map((l) => {
        const m = /^[ \t]+-[ \t]+(.+)$/.exec(l);
        return m ? stripQ(m[1]!.trim()) : "";
      })
      .filter(Boolean);
  }
  return [];
}

/**
 * Rewrite one entry in a YAML list field (inline or block form).
 * mode "replace": replaces oldId with newId in the list.
 * mode "add": inserts newId after oldId, keeping oldId.
 */
function rewriteListEntry(
  yaml: string,
  fieldName: string,
  oldId: string,
  newId: string,
  mode: "replace" | "add"
): { yaml: string; changed: boolean } {
  function stripQ(s: string) {
    return s.length >= 2 &&
      ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))
      ? s.slice(1, -1)
      : s;
  }
  // Inline form: key: [a, b, c]
  const inlineRe = new RegExp(`^(${fieldName}:\\s*\\[)([^\\]]*)(\\])`, "m");
  const iM = inlineRe.exec(yaml);
  if (iM) {
    const items = (iM[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const idx = items.findIndex((i) => stripQ(i) === oldId);
    if (idx === -1) return { yaml, changed: false };
    if (mode === "replace") items.splice(idx, 1, newId);
    else items.splice(idx + 1, 0, newId);
    return {
      yaml:
        yaml.slice(0, iM.index) +
        iM[1] +
        items.join(", ") +
        iM[3] +
        yaml.slice(iM.index + iM[0].length),
      changed: true,
    };
  }
  // Block form: key:\n  - a\n  - b
  const blockRe = new RegExp(`(^${fieldName}:\\s*\\n)((?:[ \\t]+-[^\\n]*\\n?)*)`, "m");
  const bM = blockRe.exec(yaml);
  if (!bM) return { yaml, changed: false };
  const lines = (bM[2] ?? "").split("\n");
  let found = false;
  const out: string[] = [];
  for (const line of lines) {
    const lm = /^([ \t]+-[ \t]+)(.+)$/.exec(line);
    if (!lm) { out.push(line); continue; }
    if (stripQ(lm[2]!.trim()) === oldId) {
      found = true;
      if (mode === "replace") out.push(`${lm[1]}${newId}`);
      else { out.push(line); out.push(`${lm[1]}${newId}`); }
    } else {
      out.push(line);
    }
  }
  if (!found) return { yaml, changed: false };
  return {
    yaml:
      yaml.slice(0, bM.index) +
      bM[1] +
      out.join("\n") +
      yaml.slice(bM.index + bM[0].length),
    changed: true,
  };
}

/** Add or replace a top-level scalar YAML field. Appends if absent. */
function addOrReplaceField(yaml: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:[^\\n]*(?:\\n[ \\t]+[^\\n]*)*`, "m");
  if (re.test(yaml)) return yaml.replace(re, `${key}: ${value}`);
  return yaml.trimEnd() + `\n${key}: ${value}\n`;
}

/**
 * Rewrite needs:/after: edges referencing originalId across all agents and
 * buckets. Returns the count of envelope files modified.
 * Exported so the runner can call it from the <task-delegate> directive path.
 */
export function rewriteDelegationEdges(
  root: string,
  originalId: string,
  delegateId: string,
  mode: "replace" | "add"
): number {
  const agents = listLocalAgents(root);
  let count = 0;
  const now = new Date().toISOString();
  for (const a of agents) {
    for (const bucket of ALLOCATION_SCAN_DIRS) {
      const dir = join(root, "agents", a, "tasks", bucket);
      if (!existsSync(dir)) continue;
      let fnames: string[];
      try { fnames = readdirSync(dir); } catch { continue; }
      for (const fname of fnames) {
        if (!fname.endsWith(".yaml")) continue;
        const id = fname.slice(0, -5);
        if (id === originalId || id === delegateId) continue;
        const p = join(dir, fname);
        let y: string;
        try { y = readFileSync(p, "utf8"); } catch { continue; }
        if (
          !readListFromYaml(y, "needs").includes(originalId) &&
          !readListFromYaml(y, "after").includes(originalId)
        ) continue;
        let newY = y;
        const r1 = rewriteListEntry(newY, "needs", originalId, delegateId, mode);
        if (r1.changed) newY = r1.yaml;
        const r2 = rewriteListEntry(newY, "after", originalId, delegateId, mode);
        if (r2.changed) newY = r2.yaml;
        newY = newY.replace(/^updated:\s*.*$/m, `updated: ${now}`);
        writeAtomic(p, newY);
        count++;
      }
    }
  }
  return count;
}

/**
 * caravel task delegate --original <id> --to <id> [--add]
 *
 * Transfer the obligations of originalId to delegateId: rewrites all
 * needs:/after: edges referencing originalId to point at delegateId instead
 * (or adds delegateId alongside with --add). Records delegated_to: on the
 * original and journals the change. Does NOT change the original's status —
 * a failed task stays failed; the audit trail must say "X delegated to X'",
 * never "X mysteriously succeeded".
 *
 * Blocked dependants are released by sweepBlocked on the next runner tick
 * when it finds that all their needs: deps are now in done/.
 */
function doDelegate(args: ParsedArgs, root: string): void {
  const originalId = args.original && args.original !== true ? String(args.original) : null;
  const delegateId = args.to && args.to !== true ? String(args.to) : null;
  const mode: "replace" | "add" = args.add === true ? "add" : "replace";

  if (!originalId || !delegateId) {
    die("usage: task delegate --original <id> --to <id> [--add]");
  }
  if (originalId === delegateId) {
    die("delegate: --original and --to must be different ids (self-reference)");
  }

  const agents = listLocalAgents(root);

  // Locate the original envelope (any agent, any bucket)
  let originalPath: string | null = null;
  let originalYaml: string | null = null;
  let originalBucket: string | null = null;
  outer1: for (const a of agents) {
    for (const bucket of ALLOCATION_SCAN_DIRS) {
      const p = join(root, "agents", a, "tasks", bucket, `${originalId}.yaml`);
      if (existsSync(p)) {
        try {
          originalYaml = readFileSync(p, "utf8");
          originalPath = p;
          originalBucket = bucket;
        } catch { /* skip unreadable */ }
        break outer1;
      }
    }
  }
  if (!originalPath || !originalYaml) {
    die(`delegate: original task ${originalId} not found in any agent/bucket`);
  }

  // Locate the delegate envelope — must exist and must not be terminal
  let delegateBucket: string | null = null;
  outer2: for (const a of agents) {
    for (const bucket of ALLOCATION_SCAN_DIRS) {
      const p = join(root, "agents", a, "tasks", bucket, `${delegateId}.yaml`);
      if (existsSync(p)) { delegateBucket = bucket; break outer2; }
    }
  }
  if (!delegateBucket) {
    die(`delegate: delegate task ${delegateId} not found in any agent/bucket`);
  }
  // Refuse permanently-terminal buckets (UNSATISFIABLE_DELEGATE_BUCKETS): failed/archived
  // can never satisfy a `needs:` edge. done/ is allowed — sweepBlocked releases blocked
  // dependants immediately on the next tick (this is the incident-recovery case).
  if ((UNSATISFIABLE_DELEGATE_BUCKETS as readonly string[]).includes(delegateBucket)) {
    die(
      `delegate: ${delegateId} is in ${delegateBucket}/ — cannot delegate to a permanently-failed task`
    );
  }

  // Collect the set of tasks that reference originalId in needs:/after:
  const dependantIds = new Set<string>();
  for (const a of agents) {
    for (const bucket of ALLOCATION_SCAN_DIRS) {
      const dir = join(root, "agents", a, "tasks", bucket);
      if (!existsSync(dir)) continue;
      try {
        for (const fname of readdirSync(dir)) {
          if (!fname.endsWith(".yaml")) continue;
          const id = fname.slice(0, -5);
          if (id === originalId || id === delegateId) continue;
          try {
            const y = readFileSync(join(dir, fname), "utf8");
            if (
              readListFromYaml(y, "needs").includes(originalId) ||
              readListFromYaml(y, "after").includes(originalId)
            ) dependantIds.add(id);
          } catch { continue; }
        }
      } catch { continue; }
    }
  }

  if (dependantIds.size === 0) {
    console.warn(
      `caravel task: delegate warning — no tasks reference ${originalId} in needs:/after: (nothing to repoint)`
    );
  }

  // Cycle check: does delegate transitively depend on any of the dependants?
  // If yes, after rewriting the dependants would form a cycle with delegateId.
  const visited = new Set<string>();
  const queue = [delegateId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    let curYaml: string | null = null;
    outer3: for (const a of agents) {
      for (const bucket of ALLOCATION_SCAN_DIRS) {
        const p = join(root, "agents", a, "tasks", bucket, `${cur}.yaml`);
        if (existsSync(p)) {
          try { curYaml = readFileSync(p, "utf8"); } catch { /* skip */ }
          break outer3;
        }
      }
    }
    if (!curYaml) continue;
    for (const dep of [
      ...readListFromYaml(curYaml, "needs"),
      ...readListFromYaml(curYaml, "after"),
    ]) {
      if (dependantIds.has(dep)) {
        die(
          `delegate: cycle — ${delegateId} transitively depends on ${dep}, ` +
          `which would depend on ${delegateId} after rewriting`
        );
      }
      queue.push(dep);
    }
  }

  // Rewrite all edges (needs:/after: in every envelope across all agents/buckets)
  const rewritten = rewriteDelegationEdges(root, originalId, delegateId, mode);

  // Stamp delegated_to: on the original. Leave its status unchanged — a failed
  // task stays failed; the audit trail must say "X delegated to X'", not "X
  // mysteriously succeeded" (Alice's words, WAL-153 brief).
  let newOrigYaml = addOrReplaceField(originalYaml, "delegated_to", delegateId);
  newOrigYaml = newOrigYaml.replace(/^updated:\s*.*$/m, `updated: ${new Date().toISOString()}`);
  writeAtomic(originalPath, newOrigYaml);

  // Journal on the original task's owning agent
  const originalAgent = extractField(originalYaml, "to") ?? agents[0] ?? "alice";
  journalAppend(root, originalAgent, {
    ts: new Date().toISOString(),
    id: originalId,
    bucket: originalBucket,
    kind: "delegate",
    delegate: delegateId,
    mode,
    dependants_rewritten: rewritten,
    summary:
      `delegate: ${originalId} obligations ${mode === "replace" ? "transferred to" : "added alongside"} ` +
      `${delegateId} (${rewritten} edge${rewritten !== 1 ? "s" : ""} rewritten)`,
  });

  console.log(`caravel task: delegated ${originalId} → ${delegateId}`);
  console.log(`  mode: ${mode}`);
  console.log(`  edges rewritten: ${rewritten}`);
  if (rewritten > 0) {
    console.log(
      `  blocked dependants will be released by sweepBlocked on the next runner tick`
    );
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

export function runTaskCli(argv: string[]): void {
  const args = parseArgs(argv);
  const root = workspaceRoot();

  switch (args.action) {
    case "wrap":
      doWrap(args, root);
      break;

    case "park": {
      requireFlags(args, ["task", "agent", "summary"]);
      assertEnvelope(root, String(args.agent), String(args.task));
      const p = writePark(args, root);
      console.log(
        `caravel task: parked ${String(args.agent)}/${String(args.task)} as waiting:on:${p.spec}\n  ${p.path.replace(root + "/", "")}\n  deadline: ${p.deadline}`
      );
      break;
    }

    case "done":
    case "failed": {
      requireFlags(args, ["task", "agent", "summary"]);
      assertEnvelope(root, String(args.agent), String(args.task));
      const path = writeTerminal(args, root, args.action as "done" | "failed");
      console.log(
        `caravel task: wrote ${String(args.action)} rendezvous\n  ${path.replace(root + "/", "")}`
      );
      break;
    }

    case "new":
      doNew(args, root);
      break;

    case "next-id":
      doNextId(args, root);
      break;

    case "list":
      doList(args, root);
      break;

    case "summary":
      doSummary(root);
      break;

    case "lint":
      doLint(args, root);
      break;

    case "batch":
      doBatch(args, root);
      break;

    case "delegate":
      doDelegate(args, root);
      break;

    default: {
      const action = String(args.action ?? "");
      if (action) {
        console.error(`caravel task: unknown subcommand "${action}"`);
      } else {
        console.log(
          [
            "caravel task park|done|failed|wrap|new|next-id|list|summary|lint|batch|delegate",
            "",
            "  park      Park a task on long-running external work",
            "  done      Write a done rendezvous",
            "  failed    Write a failed rendezvous",
            "  wrap      Park, launch a command detached, write rendezvous on exit",
            "  new       Dispatch a new task envelope",
            "  next-id   Print the next available task ID (no file written)",
            "  list      List tasks for an agent as JSON",
            "  summary   Print a cross-agent summary as JSON",
            "  lint      Run policy lint on an existing envelope file",
            "  batch     Lint and dispatch a connected task graph atomically",
            "  delegate  Transfer needs:/after: edges from one task to another",
          ].join("\n")
        );
      }
      process.exit(action ? 1 : 0);
    }
  }
}
