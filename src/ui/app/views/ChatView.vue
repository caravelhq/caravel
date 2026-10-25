<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated, onDeactivated } from "vue";
import { useChatStore } from "../stores/chat";
import { useWorkspaceStore } from "../stores/workspace";
import { useUiStore } from "../stores/ui";
import { useReadAloud } from "../components/voice/useReadAloud";
import { refKey } from "../workspace/refs";
import ChatHeader from "../components/chat/ChatHeader.vue";
import ChatMessageList from "../components/chat/ChatMessageList.vue";
import ChatComposer from "../components/chat/ChatComposer.vue";
import ChatPicker from "../components/chat/ChatPicker.vue";
import type { ResourceRef } from "../workspace/refs";
import type { ChatMessage } from "../../services/chats";

const props = defineProps<{ resource: ResourceRef }>();

const chatStore = useChatStore();
const ws = useWorkspaceStore();
const ui = useUiStore();
const { speak: readAloud, stop: stopReadAloud } = useReadAloud();

const chatId = computed((): string =>
  props.resource.kind === "chat" ? props.resource.chatId : ""
);

const myKey = computed((): string => refKey(props.resource));

// ── Store-derived state ───────────────────────────────────────────────────────

const messages = computed((): ChatMessage[] =>
  chatStore.entries[chatId.value]?.messages ?? []
);

// agentId is the locked agent for this chat (set by server response).
const agentId = computed((): string | null =>
  chatStore.entries[chatId.value]?.agent ?? null
);

// Store isAgentLocked = hasActiveWork || isSending. Used to disable agent switching.
const storeAgentLocked = computed((): boolean =>
  chatStore.isAgentLocked(chatId.value)
);

const draft = computed({
  get: () => chatStore.getDraft(chatId.value),
  set: (v: string) => chatStore.saveDraft(chatId.value, v),
});

const hasActiveWork = computed(() => chatStore.hasActiveWork(chatId.value));

// ── Local chat metadata (not in store — fetched from server) ─────────────────
const chatName = ref("");
const sessionId = ref("");
const sessionTurnCount = ref(0);
const updatedAt = ref<string | null>(null);

// ── Agent picker state ────────────────────────────────────────────────────────
const showPicker = ref(false);
const agentsFetched = ref(false);
const agents = ref<Array<{ name: string; emoji?: string; displayName?: string; description?: string }>>([]);
const pendingAgentId = ref<string | null>(null);

function effectiveAgentId(): string | null { return agentId.value || pendingAgentId.value || null; }
function agentPicked(): boolean {
  if (agentsFetched.value && agents.value.length === 0) return true;
  return !!(agentId.value || pendingAgentId.value);
}

function findAgent(id: string | null) {
  if (!id) return null;
  return agents.value.find((a) => a.name === id) ?? null;
}

function defaultAgentName(): string | null {
  const match = agents.value.find((a) => a.name === "alice");
  if (match) return match.name;
  return agents.value.length > 0 ? agents.value[0].name : null;
}

const agentInfo = computed(() => findAgent(effectiveAgentId()));

// ── One-shot fetch on open and activation (R23 S1 — no interim poll) ──────────

async function fetchChatData(): Promise<void> {
  const id = chatId.value;
  if (!id) return;
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (data?.ok && data.chat) {
      chatStore.setMessages(id, data.chat.messages ?? []);
      chatStore.setMeta(id, {
        agent: data.chat.agentId ?? null,
        updatedAt: data.chat.updatedAt ?? null,
      });
      chatName.value = data.chat.name ?? "";
      updatedAt.value = data.chat.updatedAt ?? null;
    }
    if (data?.ok && data.session) {
      sessionId.value = data.session.id ?? "";
      sessionTurnCount.value = data.session.turnCount ?? 0;
    }
  } catch (_) {}
}

async function fetchAgents(): Promise<void> {
  try {
    const res = await fetch("/api/agents");
    const data = await res.json();
    if (data?.ok && Array.isArray(data.agents)) agents.value = data.agents;
  } catch (_) {}
  agentsFetched.value = true;
  if (!agentId.value && !pendingAgentId.value) pendingAgentId.value = defaultAgentName();
}

// ── Globals for voice overlay compatibility (R23 M2, M3) ─────────────────────
function syncGlobals(): void {
  if (chatId.value) {
    (window as Window & { __chatSessionId?: string }).__chatSessionId = chatId.value;
    (window as Window & { __chatHistory?: ChatMessage[] }).__chatHistory = messages.value;
  }
}
watch(messages, syncGlobals, { deep: false });

// ── raText for footer speaker (R23 M1) ───────────────────────────────────────
function updateRaText(): void {
  const msgs = messages.value;
  const lastDone = [...msgs].reverse().find((m) =>
    m.role === "assistant" && m.text && (!m.state || m.state === "done")
  );
  ui.raText = lastDone?.text ?? null;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  void fetchChatData();
  void fetchAgents();
  syncGlobals();
  updateRaText();
  chatStore.setLastActivatedChat(chatId.value);
});

onActivated(() => {
  void fetchChatData();
  syncGlobals();
  updateRaText();
  chatStore.setLastActivatedChat(chatId.value);
});

onDeactivated(() => {
  ui.raText = null;
  stopReadAloud();
});

watch(messages, updateRaText, { deep: false });

// ── Events ───────────────────────────────────────────────────────────────────

async function onSend(text: string): Promise<void> {
  const id = chatId.value;
  if (!id || !text.trim()) return;

  // Optimistic: push the user message.
  chatStore.setMessages(id, [...messages.value, { role: "user", text, state: "pending" }]);

  if (!agentId.value && pendingAgentId.value) {
    chatStore.setMeta(id, { agent: pendingAgentId.value, updatedAt: updatedAt.value });
  }

  const payload: Record<string, string> = { message: text, chatId: id };
  const agent = effectiveAgentId();
  if (agent) payload.agentId = agent;

  try {
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (_) {}

  // One follow-up fetch to land the server's state (no poll — step 4 brings live binding).
  await fetchChatData();
  updateRaText();
}

async function onInterrupt(): Promise<void> {
  const id = chatId.value;
  if (!id) return;
  try {
    await fetch("/api/chat/interrupt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: id }),
    });
  } catch (_) {}
  await fetchChatData();
}

function onCancel(): void {
  chatStore.saveDraft(chatId.value, "");
}

async function onRename(name: string): Promise<void> {
  const id = chatId.value;
  if (!id) return;
  try {
    await fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  } catch (_) {}
  chatName.value = name;
}

async function onDelete(): Promise<void> {
  const id = chatId.value;
  if (!id) return;
  const n = messages.value.length;
  const suffix = n === 1 ? " message" : " messages";
  const msg = n > 0
    ? `Delete this chat? ${n}${suffix} will be permanently removed.`
    : "Delete this chat?";
  if (!window.confirm(msg)) return;
  try {
    await fetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (_) {}
  ws.close(myKey.value);
}

function onTogglePicker(): void {
  showPicker.value = !showPicker.value;
}

function onPickChat(selectedId: string): void {
  ws.open({ kind: "chat", chatId: selectedId }, { preview: true });
}

function onPickerNewChat(): void {
  const newId = generateChatId();
  ws.open({ kind: "chat", chatId: newId });
  showPicker.value = false;
}

function onPickerClose(): void {
  showPicker.value = false;
}

function onPin(): void {
  ws.pin(myKey.value);
}

function onPickAgent(name: string): void {
  pendingAgentId.value = name;
}

function onSpeak(text: string): void {
  readAloud(text);
}

function onStop(): void {
  stopReadAloud();
}

// ── Utility ───────────────────────────────────────────────────────────────────

function generateChatId(): string {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
</script>

<template>
  <div class="chat-view">
    <!-- Sidebar picker overlay -->
    <ChatPicker
      v-if="showPicker"
      class="chat-view-picker"
      :active-chat-id="chatId"
      @open="onPickChat"
      @new="onPickerNewChat"
      @close="onPickerClose"
    />

    <div class="chat-view-main">
      <ChatHeader
        :chat-id="chatId"
        :chat-name="chatName"
        :agent-display-name="agentInfo?.displayName ?? agentInfo?.name ?? ''"
        :agent-emoji="agentInfo?.emoji ?? ''"
        :agent-description="agentInfo?.description ?? ''"
        :is-agent-locked="storeAgentLocked || !!agentId"
        :session-id="sessionId"
        :session-turn-count="sessionTurnCount"
        :picker-open="showPicker"
        :has-messages="messages.length > 0"
        @toggle-picker="onTogglePicker"
        @rename="onRename"
        @delete="onDelete"
      />

      <ChatMessageList
        :chat-id="chatId"
        :messages="messages"
        :agents-fetched="agentsFetched"
        :agents="agents"
        :pending-agent-id="pendingAgentId"
        @speak="onSpeak"
        @stop="onStop"
        @pick-agent="onPickAgent"
      />

      <ChatComposer
        :chat-id="chatId"
        :draft="draft"
        :has-messages="messages.length > 0"
        :agent-picked="agentPicked()"
        :has-active-work="hasActiveWork"
        :is-agent-locked="storeAgentLocked || !!agentId"
        @send="onSend"
        @interrupt="onInterrupt"
        @cancel="onCancel"
        @pin="onPin"
        @update:draft="(v) => (draft = v)"
      />
    </div>
  </div>
</template>
