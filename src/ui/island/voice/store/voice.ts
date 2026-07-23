import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  state: "done" | "streaming" | "error";
}

export const useVoiceStore = defineStore("voice", () => {
  // Current mode: 'idle' | 'chat' | 'task-creator'
  const mode = ref<"idle" | "chat" | "task-creator">("idle");
  const recording = ref(false);
  const transcribing = ref(false);
  const playing = ref(false);
  const transcript = ref<TranscriptEntry[]>([]);
  const statusText = ref("Press and hold to talk");

  // Cancellation token for the audio queue; incremented to cancel an in-flight queue.
  const genToken = ref(0);

  const isOpen = computed(() => mode.value !== "idle");

  function openChatMode() {
    mode.value = "chat";
    transcript.value = [];
    statusText.value = "Press and hold to talk";
  }

  function openTaskCreatorMode() {
    mode.value = "task-creator";
    transcript.value = [];
    statusText.value = "Describe the task you want to create";
  }

  function close() {
    cancelAudio();
    mode.value = "idle";
    recording.value = false;
    transcribing.value = false;
    playing.value = false;
    transcript.value = [];
  }

  function cancelAudio() {
    genToken.value++;
    playing.value = false;
  }

  function addTranscript(entry: TranscriptEntry) {
    transcript.value.push(entry);
  }

  function updateLastAssistant(text: string, state: TranscriptEntry["state"]) {
    const last = transcript.value[transcript.value.length - 1];
    if (last && last.role === "assistant") {
      last.text = text;
      last.state = state;
    } else {
      transcript.value.push({ role: "assistant", text, state });
    }
  }

  return {
    mode,
    recording,
    transcribing,
    playing,
    transcript,
    statusText,
    genToken,
    isOpen,
    openChatMode,
    openTaskCreatorMode,
    close,
    cancelAudio,
    addTranscript,
    updateLastAssistant,
  };
});
