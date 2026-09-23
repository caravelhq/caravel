<script setup lang="ts">
import { ref } from "vue";
import { useNewTaskStore } from "../../stores/newTask";
import ScheduleRow, { type ScheduleTemplate } from "./ScheduleRow.vue";

const props = defineProps<{
  templates: ScheduleTemplate[];
  loading?: boolean;
}>();

const emit = defineEmits<{ refresh: [] }>();

const nt = useNewTaskStore();
const statusMsg = ref("");
let statusTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(msg: string): void {
  statusMsg.value = msg;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusMsg.value = ""; }, 4000);
}

async function onPause(id: string, agent: string): Promise<void> {
  try {
    const res = await fetch("/api/tasks/schedule/" + encodeURIComponent(id) + "/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent }),
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "pause failed");
    emit("refresh");
  } catch (err) {
    setStatus("Failed: " + (err instanceof Error ? err.message : String(err)));
  }
}

async function onResume(id: string, agent: string): Promise<void> {
  try {
    const res = await fetch("/api/tasks/schedule/" + encodeURIComponent(id) + "/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent }),
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "resume failed");
    emit("refresh");
  } catch (err) {
    setStatus("Failed: " + (err instanceof Error ? err.message : String(err)));
  }
}

async function onDelete(id: string, agent: string): Promise<void> {
  try {
    const res = await fetch(
      "/api/tasks/schedule/" + encodeURIComponent(id) + "?agent=" + encodeURIComponent(agent),
      { method: "DELETE" }
    );
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "delete failed");
    setStatus("Deleted.");
    emit("refresh");
  } catch (err) {
    setStatus("Failed: " + (err instanceof Error ? err.message : String(err)));
  }
}
</script>

<template>
  <section class="db-sched">
    <div class="db-sched-header">
      <span class="db-sched-title">Scheduled tasks</span>
      <button class="db-sched-act-btn" type="button" @click="nt.open()">+ New Task</button>
    </div>
    <div v-if="loading" class="db-sched-empty">Loading…</div>
    <div v-else-if="!templates.length" class="db-sched-empty">No scheduled tasks yet.</div>
    <div v-else class="db-sched-list" id="dashboard-sched-list">
      <ScheduleRow
        v-for="t in templates"
        :key="t.id"
        :template="t"
        @pause="onPause"
        @resume="onResume"
        @delete="onDelete"
      />
    </div>
    <div v-if="statusMsg" style="font-size:12px;color:var(--muted);margin-top:6px;">{{ statusMsg }}</div>
  </section>
</template>
