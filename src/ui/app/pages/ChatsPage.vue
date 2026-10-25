<script setup lang="ts">
import { useWorkspaceStore } from "../stores/workspace";
import ChatPicker from "../components/chat/ChatPicker.vue";

const ws = useWorkspaceStore();

function onOpen(chatId: string): void {
  ws.open({ kind: "chat", chatId }, { preview: true });
}

function onNew(): void {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  const chatId = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  ws.open({ kind: "chat", chatId });
}

async function onRename(chatId: string, name: string): Promise<void> {
  try {
    await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  } catch (_) {}
}

async function onResync(chatId: string): Promise<void> {
  try {
    await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
  } catch (_) {}
}
</script>

<template>
  <div class="chats-page">
    <ChatPicker
      active-chat-id=""
      @open="onOpen"
      @new="onNew"
      @rename="onRename"
      @resync="onResync"
    />
  </div>
</template>
