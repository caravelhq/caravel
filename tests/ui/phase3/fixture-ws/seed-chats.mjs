#!/usr/bin/env node
/**
 * Seed the fixture workspace's .caravel/chats/ directory with deterministic
 * test data required by the Phase 5 CP and CL suites.
 *
 * Run from the repo root: node tests/ui/phase3/fixture-ws/seed-chats.mjs
 * Or from this directory: node seed-chats.mjs
 *
 * Idempotent — skips files that already exist (same content, same name).
 * Wipe and re-run if you need a clean regeneration.
 *
 * Produces (per FDP Phase 5 step-0 spec, WAL-151):
 *   - 26 chats total        (≥ N+5 where N=20; CP displaced-active-chat case)
 *   - 1 chat with 520 msgs  (≥ 500; CL seeded-history scroll spec)
 *   - 1 chat whose name/preview carries XRAY-FIXTURE-CORPUS-TOKEN (CP search assertion)
 */

import { mkdir, writeFile, stat } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHATS_DIR = join(__dirname, ".caravel", "chats");

await mkdir(CHATS_DIR, { recursive: true });

function chatId(i) {
  return `fx${String(i).padStart(4, "0")}aa-${String(i).padStart(4, "0")}bb`;
}

function isoDate(daysAgo) {
  const d = new Date("2026-09-01T10:00:00Z");
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function msgPair(i) {
  return [
    { role: "user",      text: `Question ${i}: what is the status of task ${i}?`, state: "sent" },
    { role: "assistant", text: `Answer ${i}: task ${i} is in progress.`, state: "done" },
  ];
}

async function writeChat(id, name, messages, daysAgo) {
  const path = join(CHATS_DIR, `${id}.json`);
  try {
    await stat(path);
    return false; // already exists
  } catch {
    // not present — write it
  }
  const firstUser = messages.find((m) => m.role === "user");
  const preview = firstUser ? firstUser.text.slice(0, 80) : "";
  const chat = {
    id,
    messages,
    createdAt: isoDate(daysAgo),
    updatedAt: isoDate(daysAgo - 0.04),
    preview,
    name,
    agentId: "alice",
  };
  await writeFile(path, JSON.stringify(chat, null, 2));
  return true;
}

const topics = [
  "Daily standup recap",
  "Sprint planning discussion",
  "Bug triage session",
  "Architecture review",
  "Performance investigation",
  "Deploy checklist walkthrough",
  "Feature specification",
  "Code review feedback",
  "Database migration plan",
  "API design session",
  "Security audit prep",
  "Test coverage review",
  "Dependency update review",
  "Refactoring discussion",
  "Documentation update",
  "Incident post-mortem",
  "Onboarding checklist",
  "Release notes draft",
  "Backlog grooming",
  "UX review session",
  "Mobile layout review",
  "Offline sync testing",
  "Localization review",
  "Accessibility audit",
];

let created = 0;
let skipped = 0;

// Chat 0: 520 messages (≥ 500 — CL scroll spec)
{
  const msgs = [];
  for (let i = 0; i < 260; i++) msgs.push(...msgPair(i));
  const wrote = await writeChat(chatId(0), "History marathon — long running session", msgs, 50);
  wrote ? created++ : skipped++;
}

// Chat 1: unique search token (CP whole-corpus search assertion)
{
  const msgs = [
    { role: "user",      text: "Find the XRAY-FIXTURE-CORPUS-TOKEN item in the database", state: "sent" },
    { role: "assistant", text: "Found it. The XRAY-FIXTURE-CORPUS-TOKEN entry exists.",   state: "done" },
  ];
  const wrote = await writeChat(chatId(1), "XRAY-FIXTURE-CORPUS-TOKEN search test", msgs, 49);
  wrote ? created++ : skipped++;
}

// Chats 2–25: regular fixture chats (24 entries, total = 26)
for (let i = 0; i < topics.length; i++) {
  const idx = i + 2;
  const msgs = [];
  for (let j = 0; j < 3 + (idx % 5); j++) msgs.push(...msgPair(j));
  const wrote = await writeChat(chatId(idx), topics[i], msgs, 48 - idx);
  wrote ? created++ : skipped++;
}

const total = created + skipped;
console.log(`seed-chats: ${total} chats in ${CHATS_DIR}`);
console.log(`  created: ${created}, skipped (already present): ${skipped}`);
if (total !== 26) {
  console.error(`ERROR: expected 26 chats, got ${total}`);
  process.exit(1);
}
