import { defineStore } from "pinia";
import { ref } from "vue";

export interface NewTaskOptions {
  parent?: string;
  project?: string;
  mode?: "task" | "schedule";
  scheduleId?: string;
  headline?: string;
  brief?: string;
  context?: string[];
}

export const useNewTaskStore = defineStore("newTask", () => {
  const isOpen = ref(false);
  const parent = ref<string | null>(null);
  const project = ref<string | null>(null);
  const mode = ref<"task" | "schedule">("task");
  const scheduleId = ref<string | null>(null);
  const prefillHeadline = ref<string>("");
  const prefillBrief = ref<string>("");
  const prefillContext = ref<string[]>([]);

  function open(opts: NewTaskOptions = {}): void {
    parent.value = opts.parent ?? null;
    project.value = opts.project ?? null;
    mode.value = opts.mode ?? "task";
    scheduleId.value = opts.scheduleId ?? null;
    prefillHeadline.value = opts.headline ?? "";
    prefillBrief.value = opts.brief ?? "";
    prefillContext.value = opts.context ?? [];
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
  }

  return { isOpen, parent, project, mode, scheduleId, prefillHeadline, prefillBrief, prefillContext, open, close };
});
