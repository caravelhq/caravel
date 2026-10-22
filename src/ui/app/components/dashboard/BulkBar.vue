<script setup lang="ts">
import { computed, ref } from "vue";

interface BulkEntry { agent: string; defaultStatus: string }

const props = defineProps<{
  selected: Record<string, BulkEntry>;
}>();

const emit = defineEmits<{
  (e: "clear"): void;
  (e: "closed", count: number): void;
}>();

const reason = ref("");
const busy = ref(false);
const statusText = ref("");

const count = computed(() => Object.keys(props.selected).length);

async function submitClose(): Promise<void> {
  const ids = Object.keys(props.selected);
  if (ids.length === 0) return;
  busy.value = true;
  statusText.value = "Closing…";
  let closed = 0, failed = 0;
  for (const id of ids) {
    const sel = props.selected[id];
    if (!sel) continue;
    try {
      const res = await fetch("/api/tasks/" + encodeURIComponent(id) + "/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: sel.agent, reason: reason.value.trim(), status: sel.defaultStatus }),
      });
      const data = await res.json();
      if (data?.ok) closed++;
      else failed++;
    } catch { failed++; }
  }
  busy.value = false;
  statusText.value = failed > 0 ? `Closed ${closed} · ${failed} failed.` : `Closed ${closed}.`;
  reason.value = "";
  emit("closed", closed);
}
</script>

<template>
  <div v-if="count > 0" class="db-bulk-bar">
    <span class="db-bulk-count">{{ count }} selected</span>
    <input
      v-model="reason"
      type="text"
      class="db-bulk-reason"
      placeholder="Shared reason (optional)…"
    />
    <button
      type="button"
      class="db-bulk-close is-primary"
      :disabled="busy"
      @click="submitClose"
    >
      Close selected ({{ count }})
    </button>
    <button type="button" class="db-bulk-clear" @click="emit('clear')">Clear</button>
    <span v-if="statusText" class="db-bulk-status">{{ statusText }}</span>
  </div>
</template>
