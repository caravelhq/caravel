#!/usr/bin/env node

/**
 * atlassian_api.mjs — Jira & Bitbucket REST API client
 *
 * Works on any platform with Node 18+. No binary dependencies.
 *
 * Configuration (checked in priority order):
 *   1. Environment variables: ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_SITE
 *   2. ATLASSIAN_CONFIG env var: path to JSON file
 *   3. config.json in the project root (atlassian section)
 *   4. ~/.atlassian-token.json
 *
 * config.json shape (place at your project root):
 * {
 *   "atlassian": {
 *     "email": "you@example.com",
 *     "token": "your-api-token",
 *     "site": "your-org.atlassian.net"
 *   }
 * }
 *
 * Get an API token at: https://id.atlassian.com/manage-profile/security/api-tokens
 *
 * Usage: node atlassian_api.mjs <service> <command> [args]
 *
 * Jira commands:
 *   jira view <KEY>
 *   jira search '<JQL>'
 *   jira comment <KEY> <body>
 *   jira transition <KEY> <status>
 *   jira create <PROJECT> <TYPE> <summary>
 *   jira edit <KEY> --summary "..." --description "..." --labels "..."
 *   jira assign <KEY> [email]
 *
 * Bitbucket commands:
 *   bitbucket pr-create <workspace/repo> <source-branch> <dest-branch> <title> [body]
 *   bitbucket pr-list <workspace/repo>
 */

import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load config ─────────────────────────────────────────────────────────────

function expandHome(p) {
  return p.replace(/^~/, homedir());
}

function loadConfig() {
  // 1. Environment variables
  if (process.env.ATLASSIAN_EMAIL && process.env.ATLASSIAN_API_TOKEN) {
    if (!process.env.ATLASSIAN_SITE) {
      console.error("Error: ATLASSIAN_SITE env var is required (e.g. your-org.atlassian.net)");
      process.exit(1);
    }
    return {
      email: process.env.ATLASSIAN_EMAIL,
      token: process.env.ATLASSIAN_API_TOKEN,
      site: process.env.ATLASSIAN_SITE,
      bitbucketToken: process.env.ATLASSIAN_BITBUCKET_TOKEN,
      bitbucketEmail: process.env.ATLASSIAN_BITBUCKET_EMAIL,
    };
  }

  // 2. ATLASSIAN_CONFIG env var
  if (process.env.ATLASSIAN_CONFIG) {
    const p = expandHome(process.env.ATLASSIAN_CONFIG);
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, "utf8"));
    }
  }

  // 3. config.json in project root (three levels up from skills/jira/script/)
  const repoConfig = join(__dirname, "..", "..", "..", "config.json");
  if (existsSync(repoConfig)) {
    const cfg = JSON.parse(readFileSync(repoConfig, "utf8"));
    if (cfg.atlassian) return cfg.atlassian;
  }

  // 4. ~/.atlassian-token.json
  const homeConfig = join(homedir(), ".atlassian-token.json");
  if (existsSync(homeConfig)) {
    return JSON.parse(readFileSync(homeConfig, "utf8"));
  }

  console.error("Error: No Atlassian credentials found.");
  console.error("Set ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN + ATLASSIAN_SITE env vars,");
  console.error('or add an "atlassian" section to config.json at your project root,');
  console.error("or create ~/.atlassian-token.json");
  process.exit(1);
}

const config = loadConfig();
// Accept both camelCase and kebab-case key names for the per-app tokens.
config.token = config.token || config["jira-token"];
config.bitbucketToken = config.bitbucketToken || config["bitbucket-token"];

if (!config.site) {
  console.error("Error: Atlassian site is not configured. Set ATLASSIAN_SITE or add 'site' to your config.");
  process.exit(1);
}

// Scoped API tokens only authenticate via the api.atlassian.com gateway,
// not the site URL. Set atlassian.cloudId in config to route through it
// (find it at https://<site>/_edge/tenant_info).
const BASE = config.cloudId
  ? `https://api.atlassian.com/ex/jira/${config.cloudId}/rest/api/3`
  : `https://${config.site}/rest/api/3`;
const AUTH = Buffer.from(`${config.email}:${config.token}`).toString("base64");
// Atlassian scoped API tokens are per-app: an optional bitbucketToken (and
// bitbucketEmail) in the same config section overrides the Jira token for
// Bitbucket calls. Falls back to the main token when absent.
const BB_AUTH = config.bitbucketToken
  ? Buffer.from(
      `${config.bitbucketEmail || config.email}:${config.bitbucketToken}`
    ).toString("base64")
  : AUTH;

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Basic ${AUTH}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = JSON.parse(text);
      msg += ": " + (err.errorMessages?.join(", ") || err.message || text);
    } catch {
      msg += ": " + text.slice(0, 200);
    }
    throw new Error(msg);
  }

  return text ? JSON.parse(text) : null;
}

async function bbApi(method, path, body) {
  const url = path.startsWith("http")
    ? path
    : `https://api.bitbucket.org/2.0${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Basic ${BB_AUTH}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = JSON.parse(text);
      msg += ": " + (err.error?.message || text);
    } catch {
      msg += ": " + text.slice(0, 200);
    }
    throw new Error(msg);
  }

  return text ? JSON.parse(text) : null;
}

// ── ADF text extraction ─────────────────────────────────────────────────────

function extractAdfText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.content) return node.content.map(extractAdfText).join("");
  return "";
}

function textToAdf(text) {
  return {
    version: 1,
    type: "doc",
    content: text.split("\n\n").map((para) => ({
      type: "paragraph",
      content: [{ type: "text", text: para }],
    })),
  };
}

// ── Jira commands ───────────────────────────────────────────────────────────

async function jiraView(key) {
  const d = await api(
    "GET",
    `/issue/${key}?fields=summary,status,priority,assignee,description,comment`
  );
  const f = d.fields;
  console.log(
    `${d.key} | ${f.status?.name} | ${f.priority?.name}\nSummary: ${f.summary}`
  );
  console.log(
    `Assignee: ${f.assignee?.displayName || "Unassigned"}`
  );
  if (f.description) {
    console.log(`Description: ${extractAdfText(f.description)}`);
  }
  const comments = f.comment?.comments || [];
  if (comments.length > 0) {
    console.log("--- Recent comments ---");
    for (const c of comments.slice(-3)) {
      const author = c.author?.displayName || "";
      const date = (c.created || "").slice(0, 10);
      const body = extractAdfText(c.body);
      console.log(`  [${date}] ${author}: ${body}`);
    }
  }
}

async function jiraSearch(jql) {
  const d = await api(
    "GET",
    `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=10&fields=summary,status,priority`
  );
  for (const issue of d.issues || []) {
    const f = issue.fields;
    console.log(
      `${issue.key} | ${f.status?.name} | ${f.priority?.name} | ${f.summary}`
    );
  }
}

async function jiraComment(key, body) {
  await api("POST", `/issue/${key}/comment`, { body: textToAdf(body) });
  console.log(`✓ Comment on work item ${key} has been successfully added`);
}

async function jiraTransition(key, statusName) {
  // Get available transitions
  const t = await api("GET", `/issue/${key}/transitions`);
  const transition = t.transitions.find(
    (tr) => tr.name.toLowerCase() === statusName.toLowerCase()
  );
  if (!transition) {
    const available = t.transitions.map((tr) => tr.name).join(", ");
    throw new Error(
      `Status "${statusName}" not found. Available: ${available}`
    );
  }
  await api("POST", `/issue/${key}/transitions`, {
    transition: { id: transition.id },
  });
  console.log(
    `✓ Work item ${key} has been successfully transitioned to ${statusName}`
  );
}

async function jiraCreate(project, type, summary) {
  // Get current user for assignment
  const me = await api("GET", "/myself");

  const d = await api("POST", "/issue", {
    fields: {
      project: { key: project },
      issuetype: { name: type },
      summary: summary,
      assignee: { accountId: me.accountId },
    },
  });

  // Fetch the created issue for status
  const issue = await api(
    "GET",
    `/issue/${d.key}?fields=summary,status`
  );
  console.log(
    `Created: ${d.key} | ${issue.fields.status?.name} | ${summary}`
  );
}

async function jiraEdit(key, flags) {
  const update = {};

  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i].replace(/^--/, "");
    const value = flags[i + 1];
    if (flag === "summary") update.summary = value;
    else if (flag === "description") update.description = textToAdf(value);
    else if (flag === "labels")
      update.labels = value.split(",").map((l) => l.trim());
    else if (flag === "assignee") {
      // Search for user by email
      const users = await api(
        "GET",
        `/user/search?query=${encodeURIComponent(value)}`
      );
      if (users.length > 0) update.assignee = { accountId: users[0].accountId };
    }
  }

  await api("PUT", `/issue/${key}`, { fields: update });
  console.log(`✓ Work item ${key} has been successfully updated`);
}

async function jiraAssign(key, assignee) {
  if (!assignee || assignee === "@me") {
    const me = await api("GET", "/myself");
    await api("PUT", `/issue/${key}/assignee`, {
      accountId: me.accountId,
    });
  } else {
    const users = await api(
      "GET",
      `/user/search?query=${encodeURIComponent(assignee)}`
    );
    if (users.length === 0) throw new Error(`User not found: ${assignee}`);
    await api("PUT", `/issue/${key}/assignee`, {
      accountId: users[0].accountId,
    });
  }
  console.log(`✓ Work item ${key} has been assigned`);
}

// ── Bitbucket commands ──────────────────────────────────────────────────────

async function bbPrCreate(slug, source, dest, title, body) {
  const d = await bbApi("POST", `/repositories/${slug}/pullrequests`, {
    title,
    description: body || "",
    source: { branch: { name: source } },
    destination: { branch: { name: dest } },
    close_source_branch: false,
  });
  const url = d.links?.html?.href || `https://bitbucket.org/${slug}/pull-requests/${d.id}`;
  console.log(`✓ PR created: ${url}`);
}

async function bbPrList(slug) {
  const d = await bbApi(
    "GET",
    `/repositories/${slug}/pullrequests?state=OPEN`
  );
  for (const pr of d.values || []) {
    const src = pr.source?.branch?.name || "?";
    const dst = pr.destination?.branch?.name || "?";
    console.log(
      `#${pr.id} | ${src} → ${dst} | ${pr.title}`
    );
  }
  if (!d.values?.length) console.log("No open pull requests");
}

// ── CLI router ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log(`Usage: node atlassian_api.mjs <service> <command> [args]

Jira:
  jira view <KEY>
  jira search '<JQL>'
  jira comment <KEY> <body>
  jira transition <KEY> <status>
  jira create <PROJECT> <TYPE> <summary>
  jira edit <KEY> --summary "..." --description "..."
  jira assign <KEY> [email]

Bitbucket:
  bitbucket pr-create <workspace/repo> <source> <dest> <title> [body]
  bitbucket pr-list <workspace/repo>`);
    process.exit(0);
  }

  const service = args[0];
  const cmd = args[1];
  const rest = args.slice(2);

  try {
    if (service === "jira") {
      switch (cmd) {
        case "view":
          await jiraView(rest[0]);
          break;
        case "search":
          await jiraSearch(rest[0]);
          break;
        case "comment":
          await jiraComment(rest[0], rest.slice(1).join(" "));
          break;
        case "transition":
          await jiraTransition(rest[0], rest[1]);
          break;
        case "create":
          await jiraCreate(rest[0], rest[1], rest.slice(2).join(" "));
          break;
        case "edit":
          await jiraEdit(rest[0], rest.slice(1));
          break;
        case "assign":
          await jiraAssign(rest[0], rest[1]);
          break;
        default:
          console.error(`Unknown jira command: ${cmd}`);
          process.exit(1);
      }
    } else if (service === "bitbucket") {
      switch (cmd) {
        case "pr-create":
          await bbPrCreate(rest[0], rest[1], rest[2], rest[3], rest[4]);
          break;
        case "pr-list":
          await bbPrList(rest[0]);
          break;
        default:
          console.error(`Unknown bitbucket command: ${cmd}`);
          process.exit(1);
      }
    } else {
      console.error(`Unknown service: ${service}. Use 'jira' or 'bitbucket'`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
