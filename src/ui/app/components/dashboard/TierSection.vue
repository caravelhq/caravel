<script setup lang="ts">
import { computed } from "vue";
import { useDashboardStore } from "../../stores/dashboard";
import { useWorkspaceStore } from "../../stores/workspace";
import { useTasksStore } from "../../stores/tasks";
import type { AttentionTier } from "../../stores/attention";
import TierRow from "./TierRow.vue";

const props = defineProps<{
  sectionKey: string;
  title: string;
  tier: AttentionTier;
  /** Max rows to show (true count always displayed beside) */
  rowLimit?: number;
  /** If true, shows "open all" link instead of extra rows */
  openAllLink?: boolean;
}>();

const dash = useDashboardStore();
const workspace = useWorkspaceStore();
const tasksStore = useTasksStore();

const collapsed = computed(() => dash.isCollapsed(props.sectionKey));
const limit = computed(() => props.rowLimit ?? 8);
const visibleRows = computed(() => props.tier.rows.slice(0, limit.value));
const hasMore = computed(() => props.tier.count > visibleRows.value.length);

function openTask(id: string): void {
  tasksStore.currentTaskId = id;
  tasksStore.pane = "view";
  workspace.open({ kind: "legacy", page: "tasks" });
}

function openAllTasks(): void {
  workspace.open({ kind: "legacy", page: "tasks" });
}
</script>

<template>
  <div class="db-tier-section" :data-tier="sectionKey">
    <div class="db-tier-header" @click="dash.toggleSection(sectionKey)">
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
        <TierRow
          v-for="row in visibleRows"
          :key="row.id"
          :row="row"
          @open-task="openTask"
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
