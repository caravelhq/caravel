#!/usr/bin/env node

/**
 * agent_email.mjs — Gmail client for the agent's inbox
 *
 * Supports two auth modes, auto-selected from config:
 *   oauth  — Gmail REST API via service account or OAuth2 (original path, default)
 *   imap   — Gmail App Password over IMAP (read) + SMTP (send) — no GCP project needed
 *   auto   — uses imap if agent.imap.app_password is non-empty, else oauth
 *
 * Config shape (.claude/config.json):
 *   "agent": {
 *     "email": "you@gmail.com",
 *     "email_auth": "auto",        // "oauth" | "imap" | "auto"
 *     "imap": {
 *       "user": "you@gmail.com",   // defaults to agent.email
 *       "app_password": ""         // 16-char Gmail App Password; empty = oauth fallback
 *     }
 *   }
 *
 * IMAP mode deps (run `npm install` in the agent-email skill directory):
 *   imapflow  — IMAP client (supports Gmail extensions)
 *   nodemailer — SMTP client for send/reply
 *
 * Configuration (checked in priority order for all modes):
 *   1. Environment variables: AGENT_EMAIL, AGENT_NAME, AGENT_CREDENTIALS_DIR
 *   2. AGENT_CONFIG env var: path to JSON file, or inline JSON string
 *   3. .claude/config.json in the repo (local dev fallback)
 *
 * OAuth auth (auto-detected, checked in order):
 *   1. Service account: <credentials_dir>/service-account.json (+ domain-wide delegation)
 *   2. OAuth2: <credentials_dir>/credentials.json + <credentials_dir>/gcp-oauth.keys.json
 *
 * Usage: node agent_email.mjs <command> [args]
 *
 * Commands:
 *   search '<query>' [max]                    Search emails (default: is:unread, max 50)
 *   read <messageId>                          Read a single message with parsed body
 *   thread <threadId>                         Read all messages in a thread
 *   html <messageId>                          Print a message's HTML part
 *   label <threadId> <addLabel> [--remove <removeLabel>]  Modify thread labels
 *   reply <messageId> <body>                  Reply to a message
 *   send <to> <subject> <body>                Send a new email
 *   labels                                    List all labels
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createSign } from "crypto";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Load config ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function expandHome(p) {
  return p.replace(/^~/, homedir());
}

// Walk up from script/ to find .claude/config.json in the repo
function findConfigFile() {
  let dir = join(__dirname, ".."); // .claude/skills/agent-email/
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "config.json");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  return null;
}

function loadConfig() {
  const env = process.env;

  // Priority 1: individual env vars
  if (env.AGENT_EMAIL) {
    return {
      agent: {
        email: env.AGENT_EMAIL,
        name: env.AGENT_NAME || "Agent",
        credentials_dir: expandHome(env.AGENT_CREDENTIALS_DIR || "~/.agent-email"),
        email_auth: env.AGENT_EMAIL_AUTH || "auto",
        imap: {
          user: env.AGENT_IMAP_USER || env.AGENT_EMAIL,
          app_password: env.AGENT_IMAP_APP_PASSWORD || "",
        },
      },
      user: { name: env.USER_NAME, email: env.USER_EMAIL },
    };
  }

  // Priority 2: AGENT_CONFIG env var (path to file, or inline JSON)
  if (env.AGENT_CONFIG) {
    let raw;
    try {
      raw = JSON.parse(env.AGENT_CONFIG);
    } catch {
      raw = JSON.parse(readFileSync(expandHome(env.AGENT_CONFIG), "utf-8"));
    }
    const agent = raw.agent || raw;
    if (!agent.email) throw new Error("AGENT_CONFIG missing agent.email");
    agent.credentials_dir = expandHome(agent.credentials_dir || "~/.agent-email");
    return { agent, user: raw.user || {} };
  }

  // Priority 3: .claude/config.json file in the repo
  const configPath = findConfigFile();
  if (configPath) {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const agent = raw.agent;
    if (agent && agent.email) {
      agent.credentials_dir = expandHome(agent.credentials_dir || "~/.agent-email");
      return { agent, user: raw.user || {} };
    }
  }

  throw new Error(
    "No agent config found. Set AGENT_EMAIL env var, AGENT_CONFIG env var, or create .claude/config.json. See the agent-email SKILL.md for setup options."
  );
}

const CONFIG = loadConfig();
const ACCOUNT = CONFIG.agent.email;
const AGENT_NAME = CONFIG.agent.name || "Agent";
const CREDS_DIR = CONFIG.agent.credentials_dir;
const SA_PATH = join(CREDS_DIR, "service-account.json");
const CREDS_PATH = join(CREDS_DIR, "credentials.json");
const KEYS_PATH = join(CREDS_DIR, "gcp-oauth.keys.json");
const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// ── Auth mode selection ──────────────────────────────────────────────────────

function selectAuthMode(config) {
  const mode = (config.agent?.email_auth || "auto").toLowerCase();
  if (mode === "oauth") return "oauth";
  if (mode === "imap") return "imap";
  // auto: activate IMAP only when an app_password is present and non-empty
  const pw = config.agent?.imap?.app_password;
  return pw && pw.length > 0 ? "imap" : "oauth";
}

const AUTH_MODE = selectAuthMode(CONFIG);
const IMAP_USER = CONFIG.agent?.imap?.user || ACCOUNT;
const IMAP_PASS = CONFIG.agent?.imap?.app_password || "";

// ── OAuth2 / service-account token management ────────────────────────────────

let cachedToken = null;
let cachedTokenExpiry = 0;

function base64url(data) {
  return Buffer.from(data).toString("base64url");
}

async function getServiceAccountToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedTokenExpiry - 60) return cachedToken;

  const sa = JSON.parse(readFileSync(SA_PATH, "utf-8"));
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = {
    iss: sa.client_email,
    sub: ACCOUNT,
    scope: "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const payload = base64url(JSON.stringify(claimSet));
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Service account token failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + data.expires_in;
  return cachedToken;
}

async function getOAuthToken() {
  const creds = JSON.parse(readFileSync(CREDS_PATH, "utf-8"));
  const now = Date.now();
  if (cachedToken && creds.expiry_date && now < creds.expiry_date - 60_000) {
    return creds.access_token;
  }

  const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
  const client = keys.installed || keys.web;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  cachedToken = data.access_token;
  creds.access_token = data.access_token;
  creds.expiry_date = now + data.expires_in * 1000;
  writeFileSync(CREDS_PATH, JSON.stringify(creds), "utf-8");
  return cachedToken;
}

async function getAccessToken() {
  if (existsSync(SA_PATH)) return getServiceAccountToken();
  if (existsSync(CREDS_PATH) && existsSync(KEYS_PATH)) return getOAuthToken();
  throw new Error(
    `No credentials found. Place service-account.json or (credentials.json + gcp-oauth.keys.json) in ${CREDS_DIR}. See the agent-email SKILL.md for setup options.`
  );
}

// ── Gmail REST API helpers (OAuth2 mode) ────────────────────────────────────

async function gmailGet(path, params = {}) {
  const token = await getAccessToken();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail API ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function gmailPost(path, body) {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gmail API ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// ── Body extraction (OAuth2 mode) ───────────────────────────────────────────

function decodeBase64Url(data) {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extractBody(payload) {
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  const parts = payload.parts || [];
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  }
  for (const part of parts) {
    const result = extractBody(part);
    if (result) return result;
  }
  return "";
}

function extractHtml(payload) {
  if (payload.mimeType === "text/html" && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload.parts || []) {
    const r = extractHtml(part);
    if (r) return r;
  }
  return "";
}

function getHeaders(message) {
  const headers = {};
  for (const h of message.payload?.headers || []) headers[h.name] = h.value;
  return headers;
}

// ── RFC822 body parser (IMAP mode) ──────────────────────────────────────────

function decodeQP(s) {
  return s.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
}

function decodeBody(raw, encoding) {
  const enc = (encoding || "").trim().toLowerCase();
  if (enc === "base64") return Buffer.from(raw.replace(/\s/g, ""), "base64").toString("utf-8");
  if (enc === "quoted-printable") return decodeQP(raw);
  return raw; // 7bit, 8bit, binary
}

function parseHeaders(headerBlock) {
  const headers = {};
  const lines = headerBlock.replace(/\r\n/g, "\n").split("\n");
  let key = "";
  for (const line of lines) {
    if (/^\s/.test(line) && key) {
      headers[key] = (headers[key] || "") + " " + line.trim();
    } else {
      const m = line.match(/^([^:]+):\s*(.*)/);
      if (m) {
        key = m[1].toLowerCase();
        headers[key] = m[2];
      }
    }
  }
  return headers;
}

function extractPartText(source, wantHtml) {
  const raw = typeof source === "string" ? source : source.toString("utf-8");
  const sep = raw.indexOf("\r\n\r\n") >= 0 ? "\r\n\r\n" : "\n\n";
  const sepIdx = raw.indexOf(sep);
  if (sepIdx === -1) return raw;

  const headerBlock = raw.slice(0, sepIdx);
  const body = raw.slice(sepIdx + sep.length);
  const h = parseHeaders(headerBlock);
  const ct = (h["content-type"] || "text/plain").toLowerCase();
  const cte = h["content-transfer-encoding"] || "7bit";

  if (ct.includes("multipart")) {
    const m = ct.match(/boundary="?([^";]+)"?/i);
    if (!m) return body;
    const boundary = m[1].trim();
    const parts = body.split(`--${boundary}`).slice(1);
    for (const part of parts) {
      if (part.trimStart().startsWith("-")) continue; // closing --boundary--
      const pSep = part.indexOf("\r\n\r\n") >= 0 ? "\r\n\r\n" : "\n\n";
      const pIdx = part.indexOf(pSep);
      if (pIdx === -1) continue;
      const pHeaders = parseHeaders(part.slice(0, pIdx));
      const pBody = part.slice(pIdx + pSep.length);
      const pct = (pHeaders["content-type"] || "").toLowerCase();
      const pcte = pHeaders["content-transfer-encoding"] || "7bit";
      if (!wantHtml && pct.includes("text/plain")) return decodeBody(pBody, pcte);
      if (wantHtml && pct.includes("text/html")) return decodeBody(pBody, pcte);
      if (pct.includes("multipart")) {
        const nested = extractPartText(`${part.slice(0, pIdx)}${pSep}${pBody}`, wantHtml);
        if (nested) return nested;
      }
    }
    // Fallback: return first text/* part we can find
    for (const part of parts) {
      const pSep = part.indexOf("\r\n\r\n") >= 0 ? "\r\n\r\n" : "\n\n";
      const pIdx = part.indexOf(pSep);
      if (pIdx === -1) continue;
      const pHeaders = parseHeaders(part.slice(0, pIdx));
      const pct = (pHeaders["content-type"] || "").toLowerCase();
      const pcte = pHeaders["content-transfer-encoding"] || "7bit";
      if (pct.includes("text/")) return decodeBody(part.slice(pIdx + pSep.length), pcte);
    }
    return "";
  }

  if (!wantHtml && ct.includes("text/plain")) return decodeBody(body, cte);
  if (wantHtml && ct.includes("text/html")) return decodeBody(body, cte);
  if (!wantHtml && ct.includes("text/")) return decodeBody(body, cte);
  return decodeBody(body, cte);
}

// ── IMAP lazy imports ────────────────────────────────────────────────────────

let _ImapFlow = null;
let _nodemailer = null;

async function requireImapFlow() {
  if (!_ImapFlow) {
    try {
      const mod = await import("imapflow");
      _ImapFlow = mod.ImapFlow;
    } catch {
      throw new Error(
        "imapflow is not installed. Run: npm install\nin the agent-email skill directory, then retry."
      );
    }
  }
  return _ImapFlow;
}

async function requireNodemailer() {
  if (!_nodemailer) {
    try {
      const mod = await import("nodemailer");
      _nodemailer = mod.default;
    } catch {
      throw new Error(
        "nodemailer is not installed. Run: npm install\nin the agent-email skill directory, then retry."
      );
    }
  }
  return _nodemailer;
}

function imapClientConfig() {
  return {
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false,
  };
}

// ── IMAP commands ────────────────────────────────────────────────────────────

async function imapSearch(query = "is:unread", max = 50) {
  const ImapFlow = await requireImapFlow();
  const client = new ImapFlow(imapClientConfig());
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    // Use Gmail's X-GM-RAW extension so any Gmail query syntax works
    const uids = await client.search({ gmailRaw: query }, { uid: true });
    if (!uids.length) { console.log("No messages found."); return; }

    // Most recent first, capped at max
    const limited = uids.slice(-max).reverse();

    let count = 0;
    for await (const msg of client.fetch(
      limited,
      { uid: true, envelope: true, flags: true, labels: true, threadId: true },
      { uid: true }
    )) {
      count++;
      const env = msg.envelope || {};
      const toAddrs = (env.to || []).map((a) => (a.address || "").toLowerCase()).join(" ");
      const msgType = toAddrs.includes(IMAP_USER.toLowerCase()) ? "DIRECT" : "CC";
      const from = (env.from || []).map((a) => `${a.name || ""} <${a.address || ""}>`.trim()).join(", ");
      const labels = msg.labels ? [...msg.labels] : [];
      if (!msg.flags?.has("\\Seen")) labels.push("UNREAD");

      console.log(`[${msgType}] ${msg.uid}`);
      console.log(`  Thread: ${msg.threadId !== undefined ? msg.threadId.toString() : msg.uid}`);
      console.log(`  From: ${from}`);
      console.log(`  Subject: ${env.subject || "(no subject)"}`);
      console.log(`  Date: ${env.date ? env.date.toUTCString() : ""}`);
      console.log(`  Labels: ${labels.join(", ")}`);
      console.log();
    }
    if (count === 0) console.log("No messages found.");
    else console.log(`(${count} message(s) returned. In IMAP mode, IDs are IMAP UIDs.)`);
  } finally {
    lock.release();
    await client.logout();
  }
}

async function imapRead(uid) {
  const ImapFlow = await requireImapFlow();
  const client = new ImapFlow(imapClientConfig());
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const msg = await client.fetchOne(
      uid,
      { uid: true, envelope: true, flags: true, labels: true, threadId: true, source: true },
      { uid: true }
    );
    if (!msg) throw new Error(`Message UID ${uid} not found in INBOX.`);

    const env = msg.envelope || {};
    const from = (env.from || []).map((a) => `${a.name || ""} <${a.address || ""}>`.trim()).join(", ");
    const to = (env.to || []).map((a) => `${a.name || ""} <${a.address || ""}>`.trim()).join(", ");
    const labels = msg.labels ? [...msg.labels] : [];
    if (!msg.flags?.has("\\Seen")) labels.push("UNREAD");

    console.log(`Message ID: ${msg.uid}`);
    console.log(`Thread ID: ${msg.threadId !== undefined ? msg.threadId.toString() : msg.uid}`);
    console.log(`From: ${from}`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${env.subject || "(no subject)"}`);
    console.log(`Date: ${env.date ? env.date.toUTCString() : ""}`);
    console.log(`Labels: ${labels.join(", ")}`);
    console.log();

    const body = extractPartText(msg.source, false);
    if (body.trim()) {
      console.log("--- Body ---");
      console.log(body.slice(0, 3000));
      if (body.length > 3000) console.log("... (truncated)");
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

async function imapThread(threadId) {
  const ImapFlow = await requireImapFlow();
  const client = new ImapFlow(imapClientConfig());
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    // Search by Gmail thread ID (X-GM-THRID IMAP extension)
    let uids;
    try {
      uids = await client.search({ gmailThreadId: BigInt(threadId) }, { uid: true });
    } catch {
      throw new Error(`Cannot search by thread ID in IMAP mode — thread ID "${threadId}" may be invalid or the X-GM-THRID extension is unavailable.`);
    }

    if (!uids.length) { console.log(`No messages found for thread ${threadId}.`); return; }

    console.log(`Thread ID: ${threadId}`);
    console.log(`Messages: ${uids.length}\n`);

    let i = 0;
    for await (const msg of client.fetch(
      uids,
      { uid: true, envelope: true, source: true },
      { uid: true }
    )) {
      i++;
      const env = msg.envelope || {};
      const from = (env.from || []).map((a) => `${a.name || ""} <${a.address || ""}>`.trim()).join(", ");
      console.log(`--- Message ${i}/${uids.length} ---`);
      console.log(`From: ${from}`);
      console.log(`To: ${(env.to || []).map((a) => a.address || "").join(", ")}`);
      console.log(`Date: ${env.date ? env.date.toUTCString() : ""}`);
      console.log(`Subject: ${env.subject || ""}`);
      const body = extractPartText(msg.source, false);
      if (body.trim()) {
        console.log(body.slice(0, 2000));
        if (body.length > 2000) console.log("... (truncated)");
      }
      console.log();
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

async function imapHtml(uid) {
  const ImapFlow = await requireImapFlow();
  const client = new ImapFlow(imapClientConfig());
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const msg = await client.fetchOne(uid, { source: true }, { uid: true });
    if (!msg) throw new Error(`Message UID ${uid} not found in INBOX.`);
    const html = extractPartText(msg.source, true);
    process.stdout.write(html || "(no text/html part)\n");
  } finally {
    lock.release();
    await client.logout();
  }
}

async function imapLabel(uid, addLabel, removeLabel) {
  const ImapFlow = await requireImapFlow();
  const client = new ImapFlow(imapClientConfig());
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const actions = [];

    // Handle remove first
    if (removeLabel) {
      const rl = removeLabel.toUpperCase();
      if (rl === "UNREAD") {
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        actions.push("-UNREAD (marked read)");
      } else if (rl === "STARRED" || rl === "FLAGGED") {
        await client.messageFlagsRemove(uid, ["\\Flagged"], { uid: true });
        actions.push(`-${removeLabel}`);
      } else {
        // For custom labels: removal via IMAP requires STORE X-GM-LABELS which
        // imapflow doesn't expose directly. Degrade gracefully.
        console.warn(`Note: removing custom label "${removeLabel}" is not supported in IMAP mode.`);
        console.warn(`To remove a custom Gmail label, use the Gmail web interface or switch to OAuth mode.`);
      }
    }

    // Handle add
    if (addLabel) {
      const al = addLabel.toUpperCase();
      if (al === "UNREAD") {
        await client.messageFlagsRemove(uid, ["\\Seen"], { uid: true });
        actions.push("+UNREAD (marked unread)");
      } else if (al === "STARRED" || al === "FLAGGED") {
        await client.messageFlagsAdd(uid, ["\\Flagged"], { uid: true });
        actions.push(`+${addLabel}`);
      } else {
        // Add custom Gmail label by copying to the label folder (Gmail IMAP semantics)
        try {
          await client.messageCopy(uid, addLabel, { uid: true });
          actions.push(`+${addLabel}`);
        } catch (err) {
          throw new Error(
            `Could not add label "${addLabel}": ${err.message}\n` +
            `Ensure the Gmail label exists (check: node agent_email.mjs labels).`
          );
        }
      }
    }

    const suffix = removeLabel ? ` -${removeLabel}` : "";
    console.log(`Labelled message ${uid}: ${actions.join(", ")}`);
  } finally {
    lock.release();
    await client.logout();
  }
}

async function imapReply(uid, bodyText) {
  // Fetch original message headers for reply headers
  const ImapFlow = await requireImapFlow();
  const client = new ImapFlow(imapClientConfig());
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  let replyTo, subject, messageIdHeader, references;
  try {
    const msg = await client.fetchOne(uid, { envelope: true, source: true }, { uid: true });
    if (!msg) throw new Error(`Message UID ${uid} not found in INBOX.`);
    const env = msg.envelope || {};
    const fromAddr = (env.replyTo || env.from || []).map((a) => a.address).filter(Boolean).join(", ");
    replyTo = fromAddr || "";
    subject = (env.subject || "").startsWith("Re: ") ? env.subject : `Re: ${env.subject || ""}`;

    // Extract Message-ID and References from raw source
    const raw = msg.source.toString();
    const midMatch = raw.match(/^Message-ID:\s*(.+)$/im);
    const refMatch = raw.match(/^References:\s*(.+)$/im);
    messageIdHeader = midMatch ? midMatch[1].trim() : "";
    references = refMatch ? `${refMatch[1].trim()} ${messageIdHeader}` : messageIdHeader;
  } finally {
    lock.release();
    await client.logout();
  }

  const nm = await requireNodemailer();
  const transporter = nm.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
  });

  await transporter.sendMail({
    from: IMAP_USER,
    to: replyTo,
    subject,
    text: bodyText,
    inReplyTo: messageIdHeader,
    references,
  });

  console.log(`Reply sent to message ${uid}`);
}

async function imapSend(to, subject, bodyText) {
  const nm = await requireNodemailer();
  const transporter = nm.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
  });

  await transporter.sendMail({
    from: IMAP_USER,
    to,
    subject,
    text: bodyText,
  });

  console.log(`Email sent to ${to}: ${subject}`);
}

async function imapLabels() {
  const ImapFlow = await requireImapFlow();
  const client = new ImapFlow(imapClientConfig());
  await client.connect();
  try {
    const mailboxes = await client.list();
    for (const mb of mailboxes.sort((a, b) => a.path.localeCompare(b.path))) {
      console.log(`${mb.path}\t(${(mb.flags ? [...mb.flags] : []).join(", ")})`);
    }
  } finally {
    await client.logout();
  }
}

// ── OAuth2 commands ──────────────────────────────────────────────────────────

async function oauthSearch(query = "is:unread", max = 50) {
  const list = await gmailGet("/messages", { q: query, maxResults: max });
  const messageIds = (list.messages || []).map((m) => m.id);
  if (!messageIds.length) { console.log("No messages found."); return; }

  const messages = await Promise.all(
    messageIds.map((id) => gmailGet(`/messages/${id}`, { format: "metadata" }))
  );
  console.log(`${messages.length} message(s) found:\n`);
  for (const m of messages) {
    const h = getHeaders(m);
    const to = (h.To || "").toLowerCase();
    const msgType = to.includes(ACCOUNT) ? "DIRECT" : "CC";
    console.log(`[${msgType}] ${m.id}`);
    console.log(`  Thread: ${m.threadId}`);
    console.log(`  From: ${h.From || ""}`);
    console.log(`  Subject: ${h.Subject || "(no subject)"}`);
    console.log(`  Date: ${h.Date || ""}`);
    console.log(`  Labels: ${(m.labelIds || []).join(", ")}`);
    console.log(`  Snippet: ${(m.snippet || "").slice(0, 120)}`);
    console.log();
  }
}

async function oauthRead(messageId) {
  const m = await gmailGet(`/messages/${messageId}`, { format: "full" });
  const h = getHeaders(m);
  console.log(`Message ID: ${m.id}`);
  console.log(`Thread ID: ${m.threadId}`);
  console.log(`From: ${h.From || ""}`);
  console.log(`To: ${h.To || ""}`);
  if (h.Cc) console.log(`Cc: ${h.Cc}`);
  console.log(`Subject: ${h.Subject || "(no subject)"}`);
  console.log(`Date: ${h.Date || ""}`);
  console.log(`Labels: ${(m.labelIds || []).join(", ")}`);
  console.log();
  const body = extractBody(m.payload || {});
  if (body) {
    console.log("--- Body ---");
    console.log(body.slice(0, 3000));
    if (body.length > 3000) console.log("... (truncated)");
  } else {
    console.log(`Snippet: ${m.snippet || ""}`);
  }
}

async function oauthThread(threadId) {
  const data = await gmailGet(`/threads/${threadId}`, { format: "full" });
  const messages = data.messages || [];
  console.log(`Thread ID: ${data.id}`);
  console.log(`Messages: ${messages.length}\n`);
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const h = getHeaders(m);
    console.log(`--- Message ${i + 1}/${messages.length} ---`);
    console.log(`From: ${h.From || ""}`);
    console.log(`To: ${h.To || ""}`);
    console.log(`Date: ${h.Date || ""}`);
    console.log(`Subject: ${h.Subject || ""}`);
    const body = extractBody(m.payload || {});
    if (body) {
      console.log(body.slice(0, 2000));
      if (body.length > 2000) console.log("... (truncated)");
    } else {
      console.log(m.snippet || "");
    }
    console.log();
  }
}

async function oauthLabel(threadId, addLabel, removeLabel) {
  const labelsRes = await gmailGet("/labels");
  const allLabels = labelsRes.labels || [];
  const nameToId = {};
  for (const l of allLabels) nameToId[l.name] = l.id;

  const addId = nameToId[addLabel];
  if (!addId) throw new Error(`Label not found: "${addLabel}"`);
  const body = { addLabelIds: [addId] };

  if (removeLabel) {
    const removeId = nameToId[removeLabel];
    if (!removeId) throw new Error(`Label not found: "${removeLabel}"`);
    body.removeLabelIds = [removeId];
  }

  await gmailPost(`/threads/${threadId}/modify`, body);
  const removeMsg = removeLabel ? ` -${removeLabel}` : "";
  console.log(`Labelled thread ${threadId}: +${addLabel}${removeMsg}`);
}

async function oauthReply(messageId, bodyText) {
  const orig = await gmailGet(`/messages/${messageId}`, { format: "metadata" });
  const h = getHeaders(orig);
  const to = h["Reply-To"] || h.From || "";
  const subject = (h.Subject || "").startsWith("Re: ") ? h.Subject : `Re: ${h.Subject || ""}`;
  const messageIdHeader = h["Message-ID"] || h["Message-Id"] || "";
  const references = h.References ? `${h.References} ${messageIdHeader}` : messageIdHeader;
  const rawHeaders = [
    `From: ${ACCOUNT}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${messageIdHeader}`,
    `References: ${references}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    bodyText,
  ].join("\r\n");
  await gmailPost("/messages/send", {
    raw: Buffer.from(rawHeaders).toString("base64url"),
    threadId: orig.threadId,
  });
  console.log(`Reply sent to message ${messageId}`);
}

async function oauthSend(to, subject, bodyText) {
  const rawHeaders = [
    `From: ${ACCOUNT}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    bodyText,
  ].join("\r\n");
  await gmailPost("/messages/send", { raw: Buffer.from(rawHeaders).toString("base64url") });
  console.log(`Email sent to ${to}: ${subject}`);
}

async function oauthLabels() {
  const data = await gmailGet("/labels");
  const labels = (data.labels || []).sort((a, b) => a.name.localeCompare(b.name));
  for (const l of labels) console.log(`${l.id}\t${l.name}\t(${l.type})`);
}

async function oauthCreateLabel(name) {
  const data = await gmailPost("/labels", {
    name,
    labelListVisibility: "labelShow",
    messageListVisibility: "show",
  });
  console.log(`Created label: ${data.name} (${data.id})`);
}

// ── Auth command ─────────────────────────────────────────────────────────────

async function cmdAuth() {
  if (AUTH_MODE === "imap") {
    console.log("Auth mode: IMAP / App Password");
    console.log("No authentication flow needed — the app password is static.");
    console.log(`\nConfigured account: ${IMAP_USER}`);
    console.log("\nTo set up:");
    console.log("  1. Enable 2-Step Verification on your Google account.");
    console.log("  2. Go to myaccount.google.com/apppasswords and generate a 16-char app password.");
    console.log("  3. Enable IMAP in Gmail Settings > See all settings > Forwarding and POP/IMAP.");
    console.log("  4. Set agent.imap.app_password in .claude/config.json.");
    process.exit(0);
  }
  // OAuth2 path: redirect to the drive script for centralised auth
  const driveScript = join(__dirname, "../../agent-drive/script/agent_drive.mjs");
  console.log("Auth is centralised in the drive script (all Google scopes in one flow).");
  console.log(`\nRun:\n  node ${driveScript} auth\n`);
  console.log("This authenticates Gmail + Drive + Calendar + Sheets + Docs in a single step.");
  console.log("The shared credentials in " + CREDS_DIR + " will work for all scripts.");
  process.exit(0);
}

// ── CLI entrypoint ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd = args[0] || "";

function usage() {
  const modeNote = AUTH_MODE === "imap"
    ? `\nAuth mode: IMAP (app password) — ${IMAP_USER}`
    : `\nAuth mode: OAuth2 — ${ACCOUNT}`;
  console.log(`${AGENT_NAME} Email Helper (Node.js)${modeNote}

Usage: node agent_email.mjs <command> [args]

Commands:
  auth                                      Show auth info / run OAuth2 setup
  search '<query>' [max]                    Search emails (default: is:unread, max 50)
  read <messageId>                          Read a single message with parsed body
  thread <threadId>                         Read all messages in a thread
  html <messageId>                          Print a message's HTML part
  label <threadId|uid> <label> [--remove <label>]  Modify labels
  reply <messageId|uid> <body>              Reply to a message
  send <to> <subject> <body>                Send a new email
  labels                                    List all labels/folders`);
  process.exit(1);
}

async function main() {
  try {
    switch (cmd) {
      case "auth":
        await cmdAuth();
        break;
      case "search":
        if (AUTH_MODE === "imap") {
          await imapSearch(args[1], args[2] ? parseInt(args[2], 10) : undefined);
        } else {
          await oauthSearch(args[1], args[2] ? parseInt(args[2], 10) : undefined);
        }
        break;
      case "read":
        if (!args[1]) throw new Error("Usage: read <messageId>");
        if (AUTH_MODE === "imap") await imapRead(args[1]);
        else await oauthRead(args[1]);
        break;
      case "thread":
        if (!args[1]) throw new Error("Usage: thread <threadId>");
        if (AUTH_MODE === "imap") await imapThread(args[1]);
        else await oauthThread(args[1]);
        break;
      case "html": {
        if (!args[1]) throw new Error("Usage: html <messageId>");
        if (AUTH_MODE === "imap") {
          await imapHtml(args[1]);
        } else {
          const msg = await gmailGet(`/messages/${args[1]}`, { format: "full" });
          process.stdout.write(extractHtml(msg.payload) || "(no text/html part)\n");
        }
        break;
      }
      case "label": {
        if (!args[1] || !args[2]) throw new Error("Usage: label <threadId> <addLabel> [--remove <removeLabel>]");
        const removeLabel = args[3] === "--remove" ? args[4] : undefined;
        if (AUTH_MODE === "imap") await imapLabel(args[1], args[2], removeLabel);
        else await oauthLabel(args[1], args[2], removeLabel);
        break;
      }
      case "reply":
        if (!args[1] || !args[2]) throw new Error("Usage: reply <messageId> <body>");
        if (AUTH_MODE === "imap") await imapReply(args[1], args.slice(2).join(" "));
        else await oauthReply(args[1], args.slice(2).join(" "));
        break;
      case "send":
        if (!args[1] || !args[2] || !args[3]) throw new Error("Usage: send <to> <subject> <body>");
        if (AUTH_MODE === "imap") await imapSend(args[1], args[2], args.slice(3).join(" "));
        else await oauthSend(args[1], args[2], args.slice(3).join(" "));
        break;
      case "labels":
        if (AUTH_MODE === "imap") await imapLabels();
        else await oauthLabels();
        break;
      case "create-label":
        if (!args[1]) throw new Error("Usage: create-label <name>");
        if (AUTH_MODE === "imap") {
          console.log('In IMAP mode, create Gmail labels via the Gmail web interface.');
          console.log('They will appear as folders in IMAP once created.');
        } else {
          await oauthCreateLabel(args[1]);
        }
        break;
      default:
        usage();
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
