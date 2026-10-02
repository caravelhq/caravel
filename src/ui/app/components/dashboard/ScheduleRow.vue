<script setup lang="ts">
import { ref, computed } from "vue";
import BaseModal from "../modal/BaseModal.vue";
import { useNewTaskStore } from "../../stores/newTask";

export interface ScheduleTemplate {
  id: string;
  headline?: string;
  to?: string;
  agent?: string;
  recurrence?: {
    cron?: string;
    interval?: { start?: string; every_hours?: number };
    enabled?: boolean;
    count?: number;
    last_fired?: string;
  };
}

const props = defineProps<{ template: ScheduleTemplate }>();
const emit = defineEmits<{
  pause: [id: string, agent: string];
  resume: [id: string, agent: string];
  delete: [id: string, agent: string];
}>();

const nt = useNewTaskStore();
const confirmOpen = ref(false);
const busy = ref(false);

const rec = computed(() => props.template.recurrence ?? {});
const enabled = computed(() => rec.value.enabled !== false);
const agent = computed(() => props.template.to ?? props.template.agent ?? "");
const headline = computed(() => props.template.headline ?? props.template.id);
const fireCount = computed(() => rec.value.count ?? 0);

const cadenceLabel = computed((): string => {
  if (rec.value.cron) return "cron: " + rec.value.cron;
  const iv = rec.value.interval;
  if (iv) return "every " + (iv.every_hours ?? "?") + "h @ " + (iv.start ?? "--");
  return "--";
});

function openEdit(): void {
  nt.open({ mode: "schedule", scheduleId: props.template.id });
}

function onPauseResume(): void {
  if (busy.value) return;
  if (enabled.value) emit("pause", props.template.id, agent.value);
  else emit("resume", props.template.id, agent.value);
}

function onDeleteConfirm(): void {
  confirmOpen.value = false;
  emit("delete", props.template.id, agent.value);
}
</script>

<template>
  <div class="db-sched-row" :data-sched-id="template.id">
    <div class="db-sched-row-main">
      <div class="db-sched-row-head">
        <span class="db-sched-headline">{{ headline }}</span>
        <span class="db-sched-recur" title="Recurring template">↻</span>
      </div>
      <div class="db-sched-meta">
        <span class="db-sched-agent">{{ agent }}</span>
        <span class="db-sched-cadence">{{ cadenceLabel }}</span>
        <span v-if="fireCount > 0" class="db-sched-count">{{ fireCount }} fired</span>
        <span
          class="db-sched-pill"
          :class="enabled ? 'db-sched-pill--active' : 'db-sched-pill--paused'"
        >
          {{ enabled ? "● active" : "⏸ paused" }}
        </span>
      </div>
    </div>
    <div class="db-sched-actions">
      <button class="db-sched-act-btn" type="button" @click="openEdit">Edit</button>
      <button class="db-sched-act-btn" type="button" :disabled="busy" @click="onPauseResume">
        {{ enabled ? "Pause" : "Resume" }}
      </button>
      <button class="db-sched-act-btn db-sched-act-btn--danger" type="button" @click="confirmOpen = true">Delete</button>
    </div>

    <BaseModal
      :open="confirmOpen"
      size="sm"
      title="Delete schedule?"
      @close="confirmOpen = false"
    >
      <p style="margin: 0 0 16px; font-size: 13px; color: #c8daf0;">
        Delete <strong>{{ headline }}</strong>? This cannot be undone.
      </p>
      <template #footer>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="db-sched-act-btn" type="button" @click="confirmOpen = false">Cancel</button>
          <button class="db-sched-act-btn db-sched-act-btn--danger" type="button" @click="onDeleteConfirm">Delete</button>
        </div>
      </template>
    </BaseModal>
  </div>
</template>
