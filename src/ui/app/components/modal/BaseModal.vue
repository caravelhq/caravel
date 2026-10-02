<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useModalsStore } from "../../stores/modals";

const props = withDefaults(defineProps<{
  open: boolean;
  size?: "sm" | "md" | "lg" | "sheet";
  title?: string;
  dismissible?: boolean;
}>(), { size: "md", dismissible: true });

const emit = defineEmits<{ close: [] }>();
const modals = useModalsStore();
const dialogRef = ref<HTMLDialogElement | null>(null);

// Module-level scroll lock counter — handles multiple stacked modals.
let scrollLockCount = 0;
function lockScroll(): void {
  scrollLockCount++;
  if (scrollLockCount === 1) document.body.style.overflow = "hidden";
}
function unlockScroll(): void {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) document.body.style.overflow = "";
}

function openDialog(): void {
  const el = dialogRef.value;
  if (!el || el.open) return;
  el.showModal();
  lockScroll();
}

function closeDialog(): void {
  const el = dialogRef.value;
  if (!el || !el.open) return;
  el.close();
  unlockScroll();
}

onMounted(() => {
  if (props.open) openDialog();
});

watch(() => props.open, (val) => {
  if (val) openDialog(); else closeDialog();
});

onBeforeUnmount(() => {
  if (props.open) unlockScroll();
});

function onCancel(ev: Event): void {
  ev.preventDefault();
  if (props.dismissible) emit("close");
}

function onDialogClick(ev: MouseEvent): void {
  if (!props.dismissible) return;
  if ((ev.target as Element) === dialogRef.value) emit("close");
}
</script>

<template>
  <dialog
    ref="dialogRef"
    :data-size="size"
    class="base-modal"
    :aria-modal="true"
    @cancel="onCancel"
    @click="onDialogClick"
  >
    <div class="base-modal-inner" @click.stop>
      <slot name="header">
        <div v-if="title" class="base-modal-head">
          <span class="base-modal-title">{{ title }}</span>
          <button
            v-if="dismissible"
            class="base-modal-close"
            type="button"
            aria-label="Close"
            @click="emit('close')"
          >×</button>
        </div>
      </slot>
      <div class="base-modal-body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="base-modal-footer">
        <slot name="footer" />
      </div>
    </div>
  </dialog>
</template>
