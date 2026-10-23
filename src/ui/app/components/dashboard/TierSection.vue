<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useDashboardStore } from "../../stores/dashboard";
import { useWorkspaceStore } from "../../stores/workspace";
import type { AttentionTier, AttentionTierRow } from "../../stores/attention";
import TaskRow from "../tasks/TaskRow.vue";

interface BulkEntry { agent: string; defaultStatus: string }

const props = defineProps<{
  sectionKey: string;
  title: string;
  tier: AttentionTier;
  rowLimit?: number;
  openAllLink?: boolean;
  selectable?: boolean;
  selected?: Record<string, BulkEntry>;
  rowDefaultStatus?: string;
  reportIntent?: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle-row", id: string, agent: string, defaultStatus: string, checked: boolean): void;
  (e: "toggle-all", checked: boolean): void;
}>();

const dash = useDashboardStore();
const workspace = useWorkspaceStore();

const collapsed = computed(() => dash.isCollapsed(props.sectionKey));
const limit = computed(() => props.rowLimit ?? 8);
const visibleRows = computed(() => props.tier.rows.slice(0, limit.value));
const hasMore = computed(() => props.tier.count > visibleRows.value.length);

const allSelected = computed(() => {
  if (!props.selectable || !props.selected || visibleRows.value.length === 0) return false;
  return visibleRows.value.every(r => !!props.selected![r.id]);
});

const someSelected = computed(() => {
  if (!props.selectable || !props.selected) return false;
  const cnt = visibleRows.value.filter(r => !!props.selected![r.id]).length;
  return cnt > 0 && cnt < visibleRows.value.length;
});

const selectAllRef = ref<HTMLInputElement | null>(null);
watchEffect(() => {
  if (selectAllRef.value) {
    selectAllRef.value.indeterminate = someSelected.value;
  }
});

function openRow(id: string): void {
  if (props.reportIntent) {
    workspace.open({ kind: "envelope", taskId: id }, { preview: true, intent: { subView: "report" } });
  } else {
    workspace.open({ kind: "envelope", taskId: id });
  }
}

function openAllTasks(): void {
  const ref = { kind: "legacy", page: "tasks" } as const;
  workspace.open(ref);
  workspace.pin(workspace.refKey(ref));
}

function isChecked(row: AttentionTierRow): boolean {
  return !!(props.selected && props.selected[row.id]);
}

function onRowSelect(id: string, agent: string, defaultStatus: string, checked: boolean): void {
  emit("toggle-row", id, agent, defaultStatus, checked);
}

function onSelectAll(ev: Event): void {
  emit("toggle-all", (ev.target as HTMLInputElement).checked);
}
</script>

<template>
  <div class="db-tier-section" :data-tier="sectionKey">
    <div class="db-tier-header" @click="dash.toggleSection(sectionKey)">
      <input
        v-if="selectable && tier.count > 0"
        ref="selectAllRef"
        type="checkbox"
        class="db-tier-select-all"
        :checked="allSelected"
        title="Select all"
        aria-label="Select all reports"
        @change.stop="onSelectAll"
        @click.stop
      />
      <span class="db-tier-title">{{ title }}</span>
      <span class="db-tier-count">
        {{ tier.count }}
        <template v-if="tier.count > limit && !openAllLink">
          <span style="opacity:0.5"> (showing {{ visibleRows.length }})</span>
        </template>
        <span v-if="collapsed" style="opacity:0.5"> ▸</span>
        <span v-else style="opacity:0.5"> ▾</span>
      </span>
    </div>
    <template v-if="!collapsed">
      <div class="db-tier-rows">
        <div v-if="!visibleRows.length" class="db-tier-empty">Nothing here.</div>
        <TaskRow
          v-for="row in visibleRows"
          :key="row.id"
          :task="row"
          :selectable="selectable"
          :checked="isChecked(row)"
          :default-status="rowDefaultStatus ?? 'cancelled'"
          :short-id="true"
          @open="openRow"
          @select="onRowSelect"
        />
      </div>
      <button
        v-if="openAllLink && tier.count > 0"
        class="db-tier-open-all"
        type="button"
        @click.stop="openAllTasks"
      >
        Open all {{ tier.count }} in Tasks →
      </button>
      <button
        v-else-if="hasMore"
        class="db-tier-open-all"
        type="button"
        @click.stop="openAllTasks"
      >
        {{ tier.count - visibleRows.length }} more in Tasks →
      </button>
    </template>
  </div>
</template>
