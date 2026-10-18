/**
 * caravel task <subcommand> [opts]
 *
 * park   --task ID --agent NAME [--on script] [--deadline-mins N] [--watch DESC] --summary S [--body-file F | --body S]
 * done   --task ID --agent NAME --summary S [--report-path P] [--body-file F | --body S]
 * failed --task ID --agent NAME --summary S [--reason R] [--body-file F | --body S]
 * wrap   --task ID --agent NAME --summary S [--deadline-mins N] [--on script] -- <command...>
 *
 * Port of .claude/skills/task-callback/script/callback.mjs onto the shared schema module.
 * Preserves: park-before-launch, envelope validation against a real file, temp-file-plus-rename,
 * the deadline default with a warn threshold at 6 hours (warn and proceed — not a ceiling),
 * exit 0 → done / non-zero → failed with log tail.
 *
 * The CLI runs from repos/caravel-live so it versions with the runner.
 * SKILL.md: .claude/skills/task-callback/SKILL.md
 */

import { existsSync, openSync, appendFileSync, readFileSync } from "fs";
import { spawn } from "child_process";
import { join, resolve } from "path";
import { VALID_FAILURE_REASONS, WORKER_WAITING_SPECS, ASSERT_ENVELOPE_BUCKETS } from "../envelope/schema.js";
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

    default: {
      const action = String(args.action ?? "");
      if (action) {
        console.error(`caravel task: unknown subcommand "${action}"`);
      } else {
        console.log(
          [
            "caravel task park|done|failed|wrap",
            "",
            "  park    Park a task on long-running external work",
            "  done    Write a done rendezvous",
            "  failed  Write a failed rendezvous",
            "  wrap    Park, launch a command detached, write rendezvous on exit",
          ].join("\n")
        );
      }
      process.exit(action ? 1 : 0);
    }
  }
}
