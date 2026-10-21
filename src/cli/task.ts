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
import {
  VALID_FAILURE_REASONS,
  WORKER_WAITING_SPECS,
  VALID_WAITING_SPECS,
  ASSERT_ENVELOPE_BUCKETS,
  ALLOCATION_SCAN_DIRS,
  DISPATCH_LIST_BUCKETS,
  DISPATCH_SUMMARY_COUNT_BUCKETS,
  REQUIRED_FIELDS,
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

    default: {
      const action = String(args.action ?? "");
      if (action) {
        console.error(`caravel task: unknown subcommand "${action}"`);
      } else {
        console.log(
          [
            "caravel task park|done|failed|wrap|new|next-id|list|summary|lint",
            "",
            "  park     Park a task on long-running external work",
            "  done     Write a done rendezvous",
            "  failed   Write a failed rendezvous",
            "  wrap     Park, launch a command detached, write rendezvous on exit",
            "  new      Dispatch a new task envelope",
            "  next-id  Print the next available task ID (no file written)",
            "  list     List tasks for an agent as JSON",
            "  summary  Print a cross-agent summary as JSON",
            "  lint     Run policy lint on an existing envelope file",
          ].join("\n")
        );
      }
      process.exit(action ? 1 : 0);
    }
  }
}
