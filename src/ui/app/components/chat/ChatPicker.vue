<script setup lang="ts">
import { ref, computed } from "vue";
import { useLiveStore } from "../../stores/live";
import { CHATS_LIST_KEY } from "../../workspace/labels";
import type { ChatListEntry } from "../../../services/chats";
import ChatRow from "./ChatRow.vue";

// N is a named constant — one character to change on sight (DEC-0046, P3: N=20).
const CHAT_LIST_RENDER_N = 20;

const props = defineProps<{
  activeChatId: string;
}>();

const emit = defineEmits<{
  (e: "open", chatId: string): void;
  (e: "new"): void;
  (e: "rename", chatId: string, name: string): void;
  (e: "resync", chatId: string): void;
  (e: "close"): void;
}>();

const live = useLiveStore();
const search = ref("");

// All chats from the app-lifetime chats:list binding (TabStrip N5, DEC-0046).
// Sorted by recency — most recently updated first.
const allChats = computed<ChatListEntry[]>(() => {
  const e = live.entry(CHATS_LIST_KEY);
  const data = (e?.data as ChatListEntry[] | null) ?? [];
  return [...data].sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return tb - ta;
  });
});

const totalCount = computed(() => allChats.value.length);

const isSearching = computed(() => search.value.trim() !== "");

// Bounded render with displacement (M4, DEC-0046).
// When the active chat is outside the top N by recency it displaces the Nth row,
// so rendered count is always exactly N and the true total beside it never moves.
const boundedChats = computed<ChatListEntry[]>(() => {
  const all = allChats.value;
  if (all.length <= CHAT_LIST_RENDER_N) return all;

  const top = all.slice(0, CHAT_LIST_RENDER_N);
  const activeInTop = top.some((c) => c.id === props.activeChatId);
  if (activeInTop) return top;

  const active = all.find((c) => c.id === props.activeChatId);
  if (!active) return top;

  // Displace the Nth row (index N-1) with the active chat.
  const result = top.slice(0, CHAT_LIST_RENDER_N - 1);
  result.push(active);
  return result;
});

// During search: filter the full corpus, no bound (DEC-0046).
const searchResults = computed<ChatListEntry[]>(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return [];
  return allChats.value.filter((c) => {
    const name = (c.name ?? "").toLowerCase();
    const preview = (c.preview ?? "").toLowerCase();
    return name.includes(q) || preview.includes(q);
  });
});

const displayedChats = computed(() =>
  isSearching.value ? searchResults.value : boundedChats.value
);

function handleRename(chatId: string, name: string): void {
  emit("rename", chatId, name);
}
</script>

<template>
  <div class="chat-history-dropdown" @click.stop>
    <div class="chat-history-head">
      <span class="chat-picker-bound-label">
        <template v-if="!isSearching && totalCount > CHAT_LIST_RENDER_N">
          Showing {{ CHAT_LIST_RENDER_N }} of {{ totalCount }}
        </template>
        <template v-else>
          Saved Chats
        </template>
      </span>
      <button
        class="chat-history-new"
        type="button"
        title="Start a new chat"
        @click="emit('new')"
      >+ New</button>
    </div>

    <div class="chat-picker-search-wrap">
      <input
        v-model="search"
        class="chat-picker-search"
        type="search"
        placeholder="Search chats…"
        aria-label="Search chats"
      />
    </div>

    <div class="chat-history-list">
      <div v-if="allChats.length === 0" class="chat-history-empty">No saved chats</div>
      <div v-else-if="isSearching && searchResults.length === 0" class="chat-history-empty">No chats match "{{ search.trim() }}"</div>
      <ChatRow
        v-for="chat in displayedChats"
        :key="chat.id"
        :chat="chat"
        :is-active="chat.id === activeChatId"
        @open="emit('open', $event)"
        @rename="handleRename"
        @resync="emit('resync', $event)"
      />
    </div>
  </div>
</template>
