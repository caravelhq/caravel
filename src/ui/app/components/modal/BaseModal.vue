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
const innerRef = ref<HTMLDivElement | null>(null);

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

// Geometric backdrop test: dismiss only if the pointer landed outside the inner card.
// Avoids relying on ev.target === dialog (::backdrop targeting varies by engine/touch).
function onDialogPointerDown(ev: PointerEvent): void {
  if (!props.dismissible) return;
  const inner = innerRef.value;
  if (!inner) return;
  const r = inner.getBoundingClientRect();
  if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) {
    emit("close");
  }
}
</script>

<template>
  <dialog
    ref="dialogRef"
    :data-size="size"
    class="base-modal"
    :aria-modal="true"
    @cancel="onCancel"
    @pointerdown="onDialogPointerDown"
  >
    <div ref="innerRef" class="base-modal-inner" @click.stop @pointerdown.stop>
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
      <slot name="footer">
        <div v-if="dismissible" class="base-modal-footer base-modal-footer--done">
          <button class="base-modal-done-btn" type="button" @click="emit('close')">Done</button>
        </div>
      </slot>
    </div>
  </dialog>
</template>
