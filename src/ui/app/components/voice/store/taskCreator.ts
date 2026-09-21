import { defineStore } from "pinia";
import { ref } from "vue";

export interface TaskDraft {
  to: string;
  headline: string;
  brief: string;
  project: string | null;
  priority: string;
  kind: string;
}

export interface ConversationEntry {
  role: "system" | "user" | "assistant";
  text: string;
}

export const useTaskCreatorStore = defineStore("task-creator", () => {
  const conversation = ref<ConversationEntry[]>([]);
  const draft = ref<TaskDraft | null>(null);
  const submitting = ref(false);
  const lastError = ref<string | null>(null);
  const createdTaskId = ref<string | null>(null);

  const SYSTEM_PROMPT = `You are a task-extraction assistant for a multi-agent system called Caravel. The user will describe a task they want to delegate to one of their AI agents. Your job is to extract the key fields and confirm back.

Known agents: alice (ops/admin), bob (code/dev), sam (strategy), ray (research), mark (marketing), cliff (code review).

Listen to the user's description and respond with:
1. A SHORT spoken acknowledgement (1-2 sentences, natural and direct)
2. Your extraction as a JSON block wrapped in <task> ... </task> tags

JSON fields:
- to: agent name (default "alice")
- headline: short task title (max 80 chars)
- brief: full task description as the agent will read it
- project: project slug if mentioned (e.g. "caravel"), or null
- priority: "P0"|"P1"|"P2"|"P3" (default "P2")
- kind: "research"|"code"|"review"|"summarise"|"decide"|"other" (default "research")

Do not ask clarifying questions unless a critical field is truly ambiguous. Make a sensible default call for anything unclear.

Example response:
"Got it — I'll set that up for Alice at P2.

<task>
{
  "to": "alice",
  "headline": "Summarise last week's completed tasks",
  "brief": "Review all tasks completed in the past 7 days across all agents and draft a short summary for Kelly, highlighting any patterns or blockers.",
  "project": "caravel",
  "priority": "P2",
  "kind": "summarise"
}
</task>"`;

  function reset() {
    conversation.value = [{ role: "system", text: SYSTEM_PROMPT }];
    draft.value = null;
    submitting.value = false;
    lastError.value = null;
    createdTaskId.value = null;
  }

  function addUserMessage(text: string) {
    conversation.value.push({ role: "user", text });
  }

  function addAssistantMessage(text: string) {
    conversation.value.push({ role: "assistant", text });
  }

  function parseTaskFromReply(reply: string): TaskDraft | null {
    const match = reply.match(/<task>\s*([\s\S]*?)\s*<\/task>/i);
    if (!match) return null;
    try {
      const obj = JSON.parse(match[1]!);
      return {
        to: typeof obj.to === "string" ? obj.to : "alice",
        headline: typeof obj.headline === "string" ? obj.headline.slice(0, 80) : "New task",
        brief: typeof obj.brief === "string" ? obj.brief : "",
        project: typeof obj.project === "string" ? obj.project : null,
        priority: /^P[0-3]$/.test(obj.priority) ? obj.priority : "P2",
        kind: ["research", "code", "review", "summarise", "decide", "other"].includes(obj.kind)
          ? obj.kind
          : "research",
      };
    } catch {
      return null;
    }
  }

  function setDraft(d: TaskDraft) {
    draft.value = { ...d };
  }

  function updateDraftField(field: keyof TaskDraft, value: string | null) {
    if (draft.value) {
      (draft.value as any)[field] = value;
    }
  }

  async function submitDraft(): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!draft.value) return { ok: false, error: "No draft" };
    submitting.value = true;
    lastError.value = null;
    try {
      const payload = {
        to: draft.value.to,
        from: "user",
        kind: draft.value.kind,
        priority: draft.value.priority,
        headline: draft.value.headline,
        brief: draft.value.brief,
        project: draft.value.project || null,
      };
      const res = await fetch("/api/tasks/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as any;
      if (!data.ok) {
        lastError.value = data.error || "Unknown error";
        return { ok: false, error: lastError.value ?? "Unknown error" };
      }
      createdTaskId.value = data.id;
      return { ok: true, id: data.id };
    } catch (err) {
      lastError.value = String(err);
      return { ok: false, error: lastError.value ?? "Unknown error" };
    } finally {
      submitting.value = false;
    }
  }

  return {
    conversation,
    draft,
    submitting,
    lastError,
    createdTaskId,
    SYSTEM_PROMPT,
    reset,
    addUserMessage,
    addAssistantMessage,
    parseTaskFromReply,
    setDraft,
    updateDraftField,
    submitDraft,
  };
});
