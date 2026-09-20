<script setup lang="ts">
import { ref, watch } from "vue";
import { useUiStore } from "../../stores/ui";

const ui = useUiStore();

const interval = ref(15);
const prompt = ref("");
const status = ref("");
const busy = ref(false);

watch(() => ui.hbModalOpen, async (open) => {
  if (!open) return;
  status.value = "Loading...";
  busy.value = false;
  try {
    const res = await fetch("/api/settings/heartbeat");
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "failed to load heartbeat");
    const hb = out.heartbeat || {};
    interval.value = Number(hb.interval) || 15;
    prompt.value = typeof hb.prompt === "string" ? hb.prompt : "";
    status.value = "";
  } catch (err) {
    status.value = "Failed: " + String(err instanceof Error ? err.message : err);
  }
});

function close(): void {
  ui.hbModalOpen = false;
  status.value = "";
  busy.value = false;
}

async function save(e: Event): Promise<void> {
  e.preventDefault();
  if (busy.value) return;

  const iv = Number(String(interval.value).trim());
  const pr = String(prompt.value).trim();
  if (!Number.isFinite(iv) || iv < 1 || iv > 1440) {
    status.value = "Interval must be 1-1440 minutes.";
    return;
  }
  if (!pr) {
    status.value = "Prompt is required.";
    return;
  }

  busy.value = true;
  status.value = "Saving...";
  try {
    const res = await fetch("/api/settings/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: iv, prompt: pr }),
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "save failed");
    if (out.heartbeat) {
      interval.value = Number(out.heartbeat.interval) || iv;
      prompt.value = typeof out.heartbeat.prompt === "string" ? out.heartbeat.prompt : pr;
    }
    status.value = "Saved.";
    setTimeout(() => close(), 120);
  } catch (err) {
    status.value = "Failed: " + String(err instanceof Error ? err.message : err);
    busy.value = false;
  }
}
</script>

<template>
  <section class="info-modal" id="hb-modal" :class="{ open: ui.hbModalOpen }" :aria-hidden="!ui.hbModalOpen" @click.self="close">
    <article class="hb-card">
      <div class="info-head">
        <span>Heartbeat Configuration</span>
        <button class="settings-close" id="hb-modal-close" type="button" aria-label="Close heartbeat configuration" @click="close">×</button>
      </div>
      <form class="hb-form" id="hb-form" @submit="save">
        <label class="hb-field" for="hb-interval-input">
          <span class="hb-label">Interval (minutes)</span>
          <input class="hb-input" id="hb-interval-input" type="number" min="1" max="1440" step="1" required v-model.number="interval" :disabled="busy" />
        </label>
        <label class="hb-field" for="hb-prompt-input">
          <span class="hb-label">Custom prompt</span>
          <textarea class="hb-textarea" id="hb-prompt-input" placeholder="What should heartbeat run?" required v-model="prompt" :disabled="busy"></textarea>
        </label>
        <div class="hb-actions">
          <div class="hb-status" id="hb-modal-status">{{ status }}</div>
          <div class="hb-buttons">
            <button class="hb-btn ghost" id="hb-cancel-btn" type="button" :disabled="busy" @click="close">Cancel</button>
            <button class="hb-btn solid" id="hb-save-btn" type="submit" :disabled="busy">Save</button>
          </div>
        </div>
      </form>
    </article>
  </section>
</template>
