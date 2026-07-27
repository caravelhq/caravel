#!/usr/bin/env node

/**
 * agent_drive.mjs — Google Drive, Docs, and Sheets API client for the agent
 *
 * Reuses the same credentials as agent_email.mjs (~/.agent-email/).
 * Centralised auth for all Google API scopes (Gmail, Drive, Calendar, Sheets, Docs).
 *
 * Configuration: same as agent_email.mjs
 *   1. Environment variables: AGENT_EMAIL, AGENT_CREDENTIALS_DIR
 *   2. AGENT_CONFIG env var
 *   3. .claude/config.json
 *
 * Usage: node agent_drive.mjs <command> [args]
 *
 * Drive commands:
 *   get <fileId>                              Show file metadata
 *   read <fileId> [format]                    Export/download file content (txt, html, csv, md)
 *   list [query] [max]                        List files (optional Drive query, default 20)
 *   search <name>                             Search files by name
 *   download <fileId> <outPath>               Download/export file to local path
 *
 * Docs commands:
 *   docs-read <docId>                         Read document as plain text
 *   docs-create <title> [body]                Create a new Google Doc (optionally with initial content)
 *   docs-append <docId> <text>                Append text to end of document
 *   docs-insert <docId> <index> <text>        Insert text at a specific position
 *
 * Sheets commands:
 *   sheets-get <spreadsheetId>                Show spreadsheet metadata (title, sheet names)
 *   sheets-read <spreadsheetId> <range>       Read cell values (e.g. "Sheet1!A1:D10")
 *   sheets-write <spreadsheetId> <range> <json>   Write values to a range (2D JSON array)
 *   sheets-append <spreadsheetId> <range> <json>  Append rows after last data row
 *   sheets-create <title> [sheetName]         Create a new spreadsheet
 *
 * Auth:
 *   auth                                      Authenticate (OAuth2 — all Google scopes)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createSign } from "crypto";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config (shared with agent_email.mjs) ───────────────────────────────────

function expandHome(p) {
  return p.replace(/^~/, homedir());
}

function findConfigFile() {
  let dir = join(__dirname, ".."); // .claude/skills/agent-drive/
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "config.json");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  return null;
}

function loadConfig() {
  const env = process.env;

  if (env.AGENT_EMAIL) {
    return {
      agent: {
        email: env.AGENT_EMAIL,
        name: env.AGENT_NAME || "Agent",
        credentials_dir: expandHome(env.AGENT_CREDENTIALS_DIR || "~/.agent-email"),
      },
    };
  }

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
    return { agent };
  }

  const configPath = findConfigFile();
  if (configPath) {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const agent = raw.agent;
    if (agent && agent.email) {
      agent.credentials_dir = expandHome(agent.credentials_dir || "~/.agent-email");
      return { agent };
    }
  }

  throw new Error(
    "No agent config found. Set AGENT_EMAIL env var, AGENT_CONFIG env var, or create .claude/config.json."
  );
}

const CONFIG = loadConfig();
const ACCOUNT = CONFIG.agent.email;
const AGENT_NAME = CONFIG.agent.name || "Agent";
const CREDS_DIR = CONFIG.agent.credentials_dir;
const SA_PATH = join(CREDS_DIR, "service-account.json");
const CREDS_PATH = join(CREDS_DIR, "credentials.json");
const KEYS_PATH = join(CREDS_DIR, "gcp-oauth.keys.json");

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
].join(" ");

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DOCS_API = "https://docs.googleapis.com/v1";
const SHEETS_API = "https://sheets.googleapis.com/v4";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// ── Token management ───────────────────────────────────────────────────────

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
    scope: GOOGLE_SCOPES,
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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Service account token failed (${res.status}): ${errText}`);
  }

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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Token refresh failed (${res.status}): ${errText}\n\n` +
      `Run: node agent_drive.mjs auth\n` +
      `to re-authenticate.`
    );
  }

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
    `No credentials found in ${CREDS_DIR}. Run: node agent_drive.mjs auth`
  );
}

// ── Generic API helpers ────────────────────────────────────────────────────

async function apiRequest(method, fullUrl, params = {}, body = null) {
  const token = await getAccessToken();
  const url = new URL(fullUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  };
  if (body !== null) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${method} ${url.pathname} failed (${res.status}): ${errText}`);
  }
  return res;
}

// Drive helpers (include shared drive params)
const SHARED_DRIVE_PARAMS = {
  supportsAllDrives: "true",
  includeItemsFromAllDrives: "true",
};

async function driveGet(path, params = {}) {
  const res = await apiRequest("GET", `${DRIVE_API}${path}`, { ...SHARED_DRIVE_PARAMS, ...params });
  return res.json();
}

async function driveDownload(path, params = {}) {
  return apiRequest("GET", `${DRIVE_API}${path}`, { ...SHARED_DRIVE_PARAMS, ...params });
}

// Docs helpers
async function docsGet(path, params = {}) {
  const res = await apiRequest("GET", `${DOCS_API}${path}`, params);
  return res.json();
}

async function docsPost(path, body, params = {}) {
  const res = await apiRequest("POST", `${DOCS_API}${path}`, params, body);
  return res.json();
}

// Sheets helpers
async function sheetsGet(path, params = {}) {
  const res = await apiRequest("GET", `${SHEETS_API}${path}`, params);
  return res.json();
}

async function sheetsPost(path, body, params = {}) {
  const res = await apiRequest("POST", `${SHEETS_API}${path}`, params, body);
  return res.json();
}

async function sheetsPut(path, body, params = {}) {
  const res = await apiRequest("PUT", `${SHEETS_API}${path}`, params, body);
  return res.json();
}

// Calendar helpers
async function calGet(path, params = {}) {
  const res = await apiRequest("GET", `${CALENDAR_API}${path}`, params);
  return res.json();
}

// ── Export format mapping ──────────────────────────────────────────────────

const GOOGLE_MIME_TYPES = {
  "application/vnd.google-apps.document": {
    txt: "text/plain",
    md: "text/plain",
    html: "text/html",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pdf: "application/pdf",
  },
  "application/vnd.google-apps.spreadsheet": {
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pdf: "application/pdf",
  },
  "application/vnd.google-apps.presentation": {
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    pdf: "application/pdf",
  },
};

function getExportMime(googleMime, format) {
  const formats = GOOGLE_MIME_TYPES[googleMime];
  if (!formats) return null;
  return formats[format] || formats.txt || formats.csv || formats.pdf || null;
}

// ── Docs text extraction ───────────────────────────────────────────────────

function extractDocText(doc) {
  let text = "";
  for (const el of doc.body?.content || []) {
    if (el.paragraph) {
      for (const run of el.paragraph.elements || []) {
        if (run.textRun) text += run.textRun.content;
      }
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        const cells = [];
        for (const cell of row.tableCells || []) {
          let cellText = "";
          for (const cellEl of cell.content || []) {
            if (cellEl.paragraph) {
              for (const run of cellEl.paragraph.elements || []) {
                if (run.textRun) cellText += run.textRun.content;
              }
            }
          }
          cells.push(cellText.trim());
        }
        text += cells.join("\t") + "\n";
      }
    } else if (el.sectionBreak) {
      // ignore
    }
  }
  return text;
}

// ══════════════════════════════════════════════════════════════════════════
// DRIVE COMMANDS
// ══════════════════════════════════════════════════════════════════════════

async function cmdGet(fileId) {
  const meta = await driveGet(`/files/${fileId}`, {
    fields: "id,name,mimeType,createdTime,modifiedTime,owners,size,webViewLink",
  });

  console.log(`File ID: ${meta.id}`);
  console.log(`Name: ${meta.name}`);
  console.log(`Type: ${meta.mimeType}`);
  if (meta.size) console.log(`Size: ${meta.size} bytes`);
  if (meta.owners) console.log(`Owner: ${meta.owners.map(o => o.emailAddress).join(", ")}`);
  console.log(`Created: ${meta.createdTime}`);
  console.log(`Modified: ${meta.modifiedTime}`);
  if (meta.webViewLink) console.log(`Link: ${meta.webViewLink}`);
}

async function cmdRead(fileId, format = "txt") {
  const meta = await driveGet(`/files/${fileId}`, {
    fields: "id,name,mimeType",
  });

  const isGoogleDoc = meta.mimeType.startsWith("application/vnd.google-apps.");

  if (isGoogleDoc) {
    const exportMime = getExportMime(meta.mimeType, format);
    if (!exportMime) {
      throw new Error(
        `Cannot export ${meta.mimeType} as ${format}. ` +
        `Supported: ${Object.keys(GOOGLE_MIME_TYPES[meta.mimeType] || {}).join(", ")}`
      );
    }

    const res = await driveDownload(`/files/${fileId}/export`, { mimeType: exportMime });
    const text = await res.text();
    console.log(`# ${meta.name}\n`);
    console.log(text);
  } else {
    const res = await driveDownload(`/files/${fileId}`, { alt: "media" });
    const text = await res.text();
    console.log(`# ${meta.name}\n`);
    console.log(text);
  }
}

async function cmdList(query, max = 20) {
  const params = {
    pageSize: max,
    fields: "files(id,name,mimeType,modifiedTime)",
    orderBy: "modifiedTime desc",
  };
  if (query) params.q = query;

  const data = await driveGet("/files", params);
  const files = data.files || [];

  if (files.length === 0) {
    console.log("No files found.");
    return;
  }

  console.log(`${files.length} file(s):\n`);
  for (const f of files) {
    const modified = f.modifiedTime ? f.modifiedTime.slice(0, 10) : "unknown";
    console.log(`${f.id}  ${modified}  ${f.name}  (${f.mimeType})`);
  }
}

async function cmdSearch(name) {
  const q = `name contains '${name.replace(/'/g, "\\'")}'`;
  await cmdList(q, 20);
}

async function cmdDownload(fileId, outPath) {
  const meta = await driveGet(`/files/${fileId}`, {
    fields: "id,name,mimeType",
  });

  const isGoogleDoc = meta.mimeType.startsWith("application/vnd.google-apps.");
  let res;

  if (isGoogleDoc) {
    const ext = outPath.split(".").pop().toLowerCase();
    const exportMime = getExportMime(meta.mimeType, ext) || getExportMime(meta.mimeType, "txt");
    res = await driveDownload(`/files/${fileId}/export`, { mimeType: exportMime });
  } else {
    res = await driveDownload(`/files/${fileId}`, { alt: "media" });
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buffer);
  console.log(`Downloaded: ${meta.name} -> ${outPath} (${buffer.length} bytes)`);
}

// ══════════════════════════════════════════════════════════════════════════
// DOCS COMMANDS
// ══════════════════════════════════════════════════════════════════════════

async function cmdDocsRead(docId) {
  const doc = await docsGet(`/documents/${docId}`);
  console.log(`# ${doc.title}\n`);
  console.log(extractDocText(doc));
}

async function cmdDocsCreate(title, bodyText) {
  const doc = await docsPost("/documents", { title });
  console.log(`Created: ${doc.title}`);
  console.log(`Doc ID: ${doc.documentId}`);
  console.log(`Link: https://docs.google.com/document/d/${doc.documentId}/edit`);

  if (bodyText) {
    await docsPost(`/documents/${doc.documentId}:batchUpdate`, {
      requests: [
        {
          insertText: {
            endOfSegmentLocation: {},
            text: bodyText,
          },
        },
      ],
    });
    console.log(`Content written (${bodyText.length} chars)`);
  }
}

async function cmdDocsAppend(docId, text) {
  await docsPost(`/documents/${docId}:batchUpdate`, {
    requests: [
      {
        insertText: {
          endOfSegmentLocation: {},
          text: text,
        },
      },
    ],
  });
  console.log(`Appended ${text.length} chars to document ${docId}`);
}

async function cmdDocsInsert(docId, index, text) {
  await docsPost(`/documents/${docId}:batchUpdate`, {
    requests: [
      {
        insertText: {
          location: { index: parseInt(index, 10) },
          text: text,
        },
      },
    ],
  });
  console.log(`Inserted ${text.length} chars at index ${index} in document ${docId}`);
}

// ══════════════════════════════════════════════════════════════════════════
// SHEETS COMMANDS
// ══════════════════════════════════════════════════════════════════════════

async function cmdSheetsGet(spreadsheetId) {
  const data = await sheetsGet(`/spreadsheets/${spreadsheetId}`, {
    fields: "spreadsheetId,properties.title,sheets.properties",
  });

  console.log(`Spreadsheet ID: ${data.spreadsheetId}`);
  console.log(`Title: ${data.properties.title}`);
  console.log(`\nSheets:`);
  for (const s of data.sheets || []) {
    const p = s.properties;
    console.log(`  ${p.title} (${p.gridProperties.rowCount} rows x ${p.gridProperties.columnCount} cols)`);
  }
}

async function cmdSheetsRead(spreadsheetId, range) {
  const data = await sheetsGet(
    `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  );

  const values = data.values || [];
  if (values.length === 0) {
    console.log("No data in range.");
    return;
  }

  console.log(`Range: ${data.range}`);
  console.log(`Rows: ${values.length}\n`);

  // Print as TSV for readability
  for (const row of values) {
    console.log(row.join("\t"));
  }
}

async function cmdSheetsWrite(spreadsheetId, range, jsonValues) {
  let values;
  try {
    values = JSON.parse(jsonValues);
  } catch {
    throw new Error("Values must be a valid JSON 2D array, e.g. '[[\"A\",\"B\"],[1,2]]'");
  }

  const data = await sheetsPut(
    `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { range, majorDimension: "ROWS", values },
    { valueInputOption: "USER_ENTERED" }
  );

  console.log(`Updated: ${data.updatedRange}`);
  console.log(`Cells: ${data.updatedCells}`);
}

async function cmdSheetsAppend(spreadsheetId, range, jsonValues) {
  let values;
  try {
    values = JSON.parse(jsonValues);
  } catch {
    throw new Error("Values must be a valid JSON 2D array, e.g. '[[\"A\",\"B\"],[1,2]]'");
  }

  const data = await sheetsPost(
    `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`,
    { range, majorDimension: "ROWS", values },
    { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" }
  );

  console.log(`Appended to: ${data.updates.updatedRange}`);
  console.log(`Rows added: ${data.updates.updatedRows}`);
}

async function cmdSheetsCreate(title, sheetName) {
  const body = {
    properties: { title },
  };
  if (sheetName) {
    body.sheets = [{ properties: { title: sheetName } }];
  }

  const data = await sheetsPost("/spreadsheets", body);

  console.log(`Created: ${data.properties.title}`);
  console.log(`Spreadsheet ID: ${data.spreadsheetId}`);
  console.log(`Link: https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`);
  if (data.sheets) {
    console.log(`Sheets: ${data.sheets.map(s => s.properties.title).join(", ")}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CALENDAR COMMANDS
// ══════════════════════════════════════════════════════════════════════════

// Resolve calendarId: use config user email if available, otherwise default
function getCalendarId(explicit) {
  if (explicit) return explicit;
  return CONFIG.user?.email || "primary";
}

function formatEvent(event) {
  const start = event.start?.dateTime || event.start?.date || "?";
  const end = event.end?.dateTime || event.end?.date || "";
  const allDay = !event.start?.dateTime;

  let time;
  if (allDay) {
    time = event.start.date;
  } else {
    const s = new Date(start);
    const e = new Date(end);
    const pad = (n) => String(n).padStart(2, "0");
    time = `${pad(s.getHours())}:${pad(s.getMinutes())}-${pad(e.getHours())}:${pad(e.getMinutes())}`;
  }

  const attendees = (event.attendees || [])
    .filter(a => !a.self)
    .map(a => a.displayName || a.email)
    .join(", ");

  const location = event.location ? ` | ${event.location}` : "";
  const attendeeStr = attendees ? ` | With: ${attendees}` : "";
  const status = event.status === "cancelled" ? " [CANCELLED]" : "";

  return `${time}  ${event.summary || "(no title)"}${status}${location}${attendeeStr}`;
}

async function cmdCalToday(calendarId) {
  const calId = getCalendarId(calendarId);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const data = await calGet(`/calendars/${encodeURIComponent(calId)}/events`, {
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: 50,
  });

  const events = (data.items || []).filter(e => e.status !== "cancelled");

  if (events.length === 0) {
    console.log(`No events today (${startOfDay.toISOString().slice(0, 10)}).`);
    return;
  }

  console.log(`Today — ${startOfDay.toISOString().slice(0, 10)} (${events.length} events):\n`);
  for (const event of events) {
    console.log(formatEvent(event));
  }
}

async function cmdCalWeek(calendarId) {
  const calId = getCalendarId(calendarId);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfWeek = new Date(startOfDay.getTime() + 7 * 86400000);

  const data = await calGet(`/calendars/${encodeURIComponent(calId)}/events`, {
    timeMin: startOfDay.toISOString(),
    timeMax: endOfWeek.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: 100,
  });

  const events = (data.items || []).filter(e => e.status !== "cancelled");

  if (events.length === 0) {
    console.log("No events this week.");
    return;
  }

  console.log(`This week — ${startOfDay.toISOString().slice(0, 10)} to ${endOfWeek.toISOString().slice(0, 10)} (${events.length} events):\n`);

  let currentDate = "";
  for (const event of events) {
    const eventDate = (event.start?.dateTime || event.start?.date || "").slice(0, 10);
    if (eventDate !== currentDate) {
      currentDate = eventDate;
      const dayName = new Date(eventDate).toLocaleDateString("en-NZ", { weekday: "long", month: "short", day: "numeric" });
      console.log(`\n${dayName}`);
    }
    console.log(`  ${formatEvent(event)}`);
  }
}

async function cmdCalRange(startDate, endDate, calendarId) {
  const calId = getCalendarId(calendarId);
  const timeMin = new Date(startDate + "T00:00:00").toISOString();
  const timeMax = new Date(endDate + "T23:59:59").toISOString();

  const data = await calGet(`/calendars/${encodeURIComponent(calId)}/events`, {
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: 100,
  });

  const events = (data.items || []).filter(e => e.status !== "cancelled");

  if (events.length === 0) {
    console.log(`No events from ${startDate} to ${endDate}.`);
    return;
  }

  console.log(`${startDate} to ${endDate} (${events.length} events):\n`);

  let currentDate = "";
  for (const event of events) {
    const eventDate = (event.start?.dateTime || event.start?.date || "").slice(0, 10);
    if (eventDate !== currentDate) {
      currentDate = eventDate;
      const dayName = new Date(eventDate).toLocaleDateString("en-NZ", { weekday: "long", month: "short", day: "numeric" });
      console.log(`\n${dayName}`);
    }
    console.log(`  ${formatEvent(event)}`);
  }
}

async function cmdCalGet(eventId, calendarId) {
  const calId = getCalendarId(calendarId);
  const event = await calGet(`/calendars/${encodeURIComponent(calId)}/events/${eventId}`);

  console.log(`Event: ${event.summary || "(no title)"}`);
  console.log(`Status: ${event.status}`);
  if (event.start?.dateTime) {
    console.log(`Start: ${event.start.dateTime}`);
    console.log(`End: ${event.end.dateTime}`);
  } else {
    console.log(`Date: ${event.start?.date} (all day)`);
  }
  if (event.location) console.log(`Location: ${event.location}`);
  if (event.description) {
    console.log(`\nDescription:\n${event.description}`);
  }
  if (event.attendees) {
    console.log(`\nAttendees:`);
    for (const a of event.attendees) {
      const name = a.displayName || a.email;
      const status = a.responseStatus || "?";
      const self = a.self ? " (you)" : "";
      console.log(`  ${name} — ${status}${self}`);
    }
  }
  if (event.hangoutLink) console.log(`\nMeet: ${event.hangoutLink}`);
  if (event.htmlLink) console.log(`Link: ${event.htmlLink}`);
}

async function cmdCalList() {
  const data = await calGet("/users/me/calendarList", {
    maxResults: 50,
  });

  const calendars = data.items || [];
  console.log(`${calendars.length} calendar(s):\n`);
  for (const c of calendars) {
    const primary = c.primary ? " [PRIMARY]" : "";
    const access = c.accessRole || "?";
    console.log(`${c.id}  ${c.summary}${primary}  (${access})`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════

// Pull an OAuth authorization code out of whatever the user pasted:
// a full redirect URL, an address-bar code (URL-encoded), or a bare code.
function extractAuthCode(input, redirectPort) {
  const s = input.trim();
  if (!s) return null;
  // Full redirect URL (or host/path form) — let URL decode the code param for us.
  if (s.includes("code=") || s.includes("://") || s.startsWith(`localhost:${redirectPort}`)) {
    try {
      const u = new URL(s.includes("://") ? s : `http://${s}`);
      const c = u.searchParams.get("code");
      if (c) return c;
    } catch { /* not a URL — fall through to bare-code handling */ }
  }
  // Bare code, possibly URL-encoded if copied straight from the address bar.
  return s.includes("%") ? decodeURIComponent(s) : s;
}

async function cmdAuth() {
  const { createServer } = await import("http");

  if (!existsSync(KEYS_PATH)) {
    throw new Error(
      `OAuth client keys not found at ${KEYS_PATH}. Download from Google Cloud Console.`
    );
  }

  const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
  const client = keys.installed || keys.web;
  const redirectPort = 3848;
  const redirectUri = `http://localhost:${redirectPort}`;

  // All Google scopes in one flow
  const scope = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
  ].join(" ");

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(client.client_id)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&login_hint=${encodeURIComponent(ACCOUNT)}`;

  console.log(`\nAuthenticate as: ${ACCOUNT}`);
  console.log(`\nThis will grant access to: Gmail, Drive, Calendar, Sheets, Docs.\n`);
  console.log(`Open this URL in your browser:\n\n${authUrl}\n`);
  const manual = process.argv.includes("--manual") || process.argv.includes("--paste");

  let code;
  if (manual) {
    // Headless machine (no browser here). Approve in a browser on any device;
    // the redirect to http://localhost:3848/?code=... will fail to load — that's
    // expected. Paste the address-bar URL (or the code) back here.
    console.log(
      `After you approve, the browser tries to open:\n` +
      `  http://localhost:${redirectPort}/?code=...&scope=...\n` +
      `That page WILL fail to load — nothing is listening there, and that's fine.\n` +
      `Copy the whole address from the address bar (or just the code value) and paste it below.\n`
    );
    const { createInterface } = await import("readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) =>
      rl.question("Paste redirect URL or code: ", resolve)
    );
    rl.close();
    code = extractAuthCode(answer, redirectPort);
    if (!code) {
      throw new Error("Couldn't find an authorization code in what you pasted.");
    }
  } else {
    console.log(`Waiting for redirect on port ${redirectPort}...`);
    code = await new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${redirectPort}`);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<h2>Auth failed: ${error}</h2><p>You can close this tab.</p>`);
          server.close();
          reject(new Error(`Auth failed: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<h2>Authenticated!</h2><p>All Google API access granted. You can close this tab.</p>`);
          server.close();
          resolve(code);
          return;
        }

        res.writeHead(400);
        res.end("Missing code parameter");
      });

      server.listen(redirectPort, () => {});
      server.on("error", (err) => {
        reject(new Error(`Could not start local server on port ${redirectPort}: ${err.message}`));
      });
    });
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
  }

  const tokens = await tokenRes.json();

  const creds = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type,
    expiry_date: Date.now() + tokens.expires_in * 1000,
  };

  writeFileSync(CREDS_PATH, JSON.stringify(creds), "utf-8");
  console.log(`\nTokens saved to ${CREDS_PATH}`);
  console.log("Auth complete — credentials cover Gmail, Drive, Calendar, Sheets, Docs.");
}

// ══════════════════════════════════════════════════════════════════════════
// CLI ENTRYPOINT
// ══════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const cmd = args[0] || "";

function usage() {
  console.log(`${AGENT_NAME} Google API Helper (Node.js)

Usage: node agent_drive.mjs <command> [args]

Drive:
  get <fileId>                              Show file metadata
  read <fileId> [format]                    Export and display file content (txt, html, csv, md)
  list [query] [max]                        List files (optional Drive query, default 20)
  search <name>                             Search files by name
  download <fileId> <outPath>               Download/export file to local path

Docs:
  docs-read <docId>                         Read document as plain text
  docs-create <title> [body]                Create a new Google Doc
  docs-append <docId> <text>                Append text to end of document
  docs-insert <docId> <index> <text>        Insert text at a specific position

Sheets:
  sheets-get <spreadsheetId>                Show spreadsheet metadata
  sheets-read <spreadsheetId> <range>       Read cell values (e.g. "Sheet1!A1:D10")
  sheets-write <spreadsheetId> <range> <json>   Write values (2D JSON array)
  sheets-append <spreadsheetId> <range> <json>  Append rows
  sheets-create <title> [sheetName]         Create a new spreadsheet

Calendar:
  cal-today [calendarId]                    Today's events (default: user's calendar)
  cal-week [calendarId]                     Next 7 days of events
  cal-range <start> <end> [calendarId]      Events in date range (YYYY-MM-DD)
  cal-get <eventId> [calendarId]            Full event details
  cal-list                                  List all accessible calendars

Auth:
  auth                                      Authenticate (all Google scopes)

Account: ${ACCOUNT}
Credentials: ${CREDS_DIR}`);
  process.exit(1);
}

async function main() {
  try {
    switch (cmd) {
      // Auth
      case "auth":
        await cmdAuth();
        break;

      // Drive
      case "get":
        if (!args[1]) throw new Error("Usage: get <fileId>");
        await cmdGet(args[1]);
        break;
      case "read":
        if (!args[1]) throw new Error("Usage: read <fileId> [format]");
        await cmdRead(args[1], args[2] || "txt");
        break;
      case "list":
        await cmdList(args[1], args[2] ? parseInt(args[2], 10) : undefined);
        break;
      case "search":
        if (!args[1]) throw new Error("Usage: search <name>");
        await cmdSearch(args[1]);
        break;
      case "download":
        if (!args[1] || !args[2]) throw new Error("Usage: download <fileId> <outPath>");
        await cmdDownload(args[1], args[2]);
        break;

      // Docs
      case "docs-read":
        if (!args[1]) throw new Error("Usage: docs-read <docId>");
        await cmdDocsRead(args[1]);
        break;
      case "docs-create":
        if (!args[1]) throw new Error("Usage: docs-create <title> [body]");
        await cmdDocsCreate(args[1], args[2] || null);
        break;
      case "docs-append":
        if (!args[1] || !args[2]) throw new Error("Usage: docs-append <docId> <text>");
        await cmdDocsAppend(args[1], args.slice(2).join(" "));
        break;
      case "docs-insert":
        if (!args[1] || !args[2] || !args[3]) throw new Error("Usage: docs-insert <docId> <index> <text>");
        await cmdDocsInsert(args[1], args[2], args.slice(3).join(" "));
        break;

      // Sheets
      case "sheets-get":
        if (!args[1]) throw new Error("Usage: sheets-get <spreadsheetId>");
        await cmdSheetsGet(args[1]);
        break;
      case "sheets-read":
        if (!args[1] || !args[2]) throw new Error("Usage: sheets-read <spreadsheetId> <range>");
        await cmdSheetsRead(args[1], args[2]);
        break;
      case "sheets-write":
        if (!args[1] || !args[2] || !args[3]) throw new Error("Usage: sheets-write <spreadsheetId> <range> <jsonValues>");
        await cmdSheetsWrite(args[1], args[2], args[3]);
        break;
      case "sheets-append":
        if (!args[1] || !args[2] || !args[3]) throw new Error("Usage: sheets-append <spreadsheetId> <range> <jsonValues>");
        await cmdSheetsAppend(args[1], args[2], args[3]);
        break;
      case "sheets-create":
        if (!args[1]) throw new Error("Usage: sheets-create <title> [sheetName]");
        await cmdSheetsCreate(args[1], args[2]);
        break;

      // Calendar
      case "cal-today":
        await cmdCalToday(args[1]);
        break;
      case "cal-week":
        await cmdCalWeek(args[1]);
        break;
      case "cal-range":
        if (!args[1] || !args[2]) throw new Error("Usage: cal-range <startDate> <endDate> [calendarId]");
        await cmdCalRange(args[1], args[2], args[3]);
        break;
      case "cal-get":
        if (!args[1]) throw new Error("Usage: cal-get <eventId> [calendarId]");
        await cmdCalGet(args[1], args[2]);
        break;
      case "cal-list":
        await cmdCalList();
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
