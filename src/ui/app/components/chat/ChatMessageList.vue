<script lang="ts">
// Named constant — beside CHAT_LIST_RENDER_N = 20 in ChatPicker.vue.
// Renders the last M messages on open; IntersectionObserver loads the prior M on scroll.
// This is NOT virtualisation: the full array stays in the store (DEC-0054).
export const CHAT_MSG_RENDER_M = 50;
</script>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, useTemplateRef } from "vue";
import ChatMessage from "./ChatMessage.vue";
import type { ChatMessage as ChatMessageData } from "../../../services/chats";

const props = defineProps<{
  chatId: string;
  messages: ChatMessageData[];
  agentsFetched: boolean;
  agents: Array<{ name: string; emoji?: string; displayName?: string; description?: string }>;
  pendingAgentId: string | null;
}>();

const emit = defineEmits<{
  (e: "speak", text: string): void;
  (e: "stop"): void;
  (e: "pick-agent", agentName: string): void;
}>();

const scrollEl = useTemplateRef<HTMLDivElement>("scrollEl");
const sentinelEl = useTemplateRef<HTMLDivElement>("sentinelEl");

// Index at which rendering starts (we render messages[renderFrom … end]).
const renderFrom = ref(Math.max(0, props.messages.length - CHAT_MSG_RENDER_M));
const atBottom = ref(true);
// Guard: only load earlier once the initial scroll-to-bottom has settled.
// Prevents the sentinel from firing during the first message population.
const readyToLoadEarlier = ref(false);

// When new messages arrive, advance renderFrom only when at the bottom —
// a scrolled-up reader must not have their expansion collapsed (F-1, DEC-0049).
watch(() => props.messages.length, (n) => {
  const desired = Math.max(0, n - CHAT_MSG_RENDER_M);
  if (desired > renderFrom.value && atBottom.value) renderFrom.value = desired;
});

const visibleMessages = computed(() => props.messages.slice(renderFrom.value));
const hasMore = computed(() => renderFrom.value > 0);

// Prepend the prior M messages with scroll compensation so the viewport does not jump.
async function loadEarlier(): Promise<void> {
  const el = scrollEl.value;
  if (!el || renderFrom.value === 0) return;
  const prevScrollTop = el.scrollTop;
  const prevScrollHeight = el.scrollHeight;
  renderFrom.value = Math.max(0, renderFrom.value - CHAT_MSG_RENDER_M);
  await nextTick();
  // scrollTop += addedHeight so the content above the old first row stays above the viewport.
  el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
}

// Sentinel at the top of the list triggers loadEarlier when it enters the scroll container.
let observer: IntersectionObserver | null = null;
onMounted(() => {
  const sentinel = sentinelEl.value;
  const scroll = scrollEl.value;
  if (!sentinel || !scroll) return;
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore.value && readyToLoadEarlier.value) void loadEarlier();
  }, { root: scroll, threshold: 0 });
  observer.observe(sentinel);
});
onBeforeUnmount(() => { observer?.disconnect(); observer = null; });

// Track whether the user is at the bottom.
function onScroll(): void {
  const el = scrollEl.value;
  if (!el) return;
  atBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
}

// Scroll to bottom when new messages land and the user was already at the bottom.
watch(() => props.messages.length, async (newLen, oldLen) => {
  if (newLen > (oldLen ?? 0) && atBottom.value) {
    await nextTick();
    const el = scrollEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  }
  // Allow load-earlier after the first batch of messages settles.
  if (!readyToLoadEarlier.value && newLen > 0) {
    await nextTick();
    readyToLoadEarlier.value = true;
  }
});

function jumpToLatest(): void {
  const el = scrollEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  atBottom.value = true;
}

function orderedAgents() {
  let coord: (typeof props.agents)[0] | null = null;
  const rest: typeof props.agents = [];
  for (const a of props.agents) {
    if (!a?.name) continue;
    if (a.name === "alice") coord = a;
    else rest.push(a);
  }
  return coord ? [coord, ...rest] : rest;
}
</script>

<template>
  <div ref="scrollEl" class="chat-messages" @scroll.passive="onScroll">
    <!-- Sentinel for IntersectionObserver — positioned at the very top of the list. -->
    <div ref="sentinelEl" class="chat-load-sentinel" />

    <div v-if="hasMore" class="chat-load-earlier">
      <button type="button" class="chat-load-earlier-btn" @click="() => void loadEarlier()">Load earlier messages</button>
    </div>

    <!-- Empty state: agent picker before the first message. -->
    <div v-if="messages.length === 0" class="chat-empty">
      <template v-if="!agentsFetched">Loading agents…</template>
      <template v-else-if="agents.length === 0">
        Send a message to start chatting with the daemon.
      </template>
      <template v-else>
        <div class="chat-picker-head">Pick an agent to start this chat</div>
        <div class="chat-picker-sub">Agent is locked once you send the first message.</div>
        <div class="chat-picker-list">
          <button
            v-for="agent in orderedAgents()"
            :key="agent.name"
            type="button"
            class="chat-picker-item"
            :class="{ 'chat-picker-item-active': pendingAgentId === agent.name }"
            @click="emit('pick-agent', agent.name)"
          >
            <div class="chat-picker-item-title">{{ (agent.emoji ? agent.emoji + ' ' : '') + (agent.displayName || agent.name) }}</div>
            <div class="chat-picker-item-desc">{{ agent.description || '' }}</div>
          </button>
        </div>
      </template>
    </div>

    <!-- Bounded tail: only the last M messages are rendered. -->
    <ChatMessage
      v-for="(msg, i) in visibleMessages"
      :key="String(renderFrom + i)"
      :msg="msg"
      @speak="(text) => emit('speak', text)"
      @stop="emit('stop')"
    />

    <!-- Jump-to-latest: shown when scrolled away from the bottom. -->
    <button
      v-if="!atBottom && messages.length > 0"
      type="button"
      class="chat-jump-latest"
      title="Jump to latest"
      aria-label="Jump to latest"
      @click="jumpToLatest"
    >↓ Latest</button>
  </div>
</template>
