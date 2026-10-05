import { stripMarkdown, speakFetch } from "./utils";

type QueueItem = { audio: HTMLAudioElement | null; url: string | null };

export function useReadAloud(): {
  speak: (text: string) => void;
  stop: () => void;
  isPlaying: () => boolean;
} {
  const queue: Promise<QueueItem | null>[] = [];
  let queueRunning = false;
  let gen = 0;
  let currentAudio: HTMLAudioElement | null = null;
  let playing = false;

  function stop() {
    gen++;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    queue.length = 0;
    queueRunning = false;
    playing = false;
  }

  async function runQueue(g: number) {
    if (queueRunning) return;
    queueRunning = true;
    playing = true;
    while (queue.length > 0 && g === gen) {
      const item = await queue.shift()!;
      if (g !== gen) {
        if (item?.url) URL.revokeObjectURL(item.url);
        continue;
      }
      if (!item || !item.audio) continue;
      currentAudio = item.audio;
      await new Promise<void>((resolve) => {
        item.audio!.onended = () => {
          if (item.url) URL.revokeObjectURL(item.url);
          currentAudio = null;
          resolve();
        };
        item.audio!.onerror = () => {
          if (item.url) URL.revokeObjectURL(item.url);
          currentAudio = null;
          resolve();
        };
        item.audio!.play().catch(() => {
          if (item.url) URL.revokeObjectURL(item.url);
          currentAudio = null;
          resolve();
        });
      });
    }
    if (g === gen) {
      queueRunning = false;
      playing = false;
    }
  }

  function speak(text: string) {
    const stripped = stripMarkdown(text).trim();
    if (!stripped) return;
    stop();
    const g = gen;
    const p = speakFetch(stripped)
      .then((res) => {
        if (g !== gen) return null;
        if (!res.ok) return { audio: null, url: null };
        return res.blob().then((blob) => {
          if (g !== gen) return null;
          const url = URL.createObjectURL(blob);
          return { audio: new Audio(url), url };
        });
      })
      .catch(() => ({ audio: null, url: null }));
    queue.push(p);
    if (!queueRunning) runQueue(g);
  }

  return { speak, stop, isPlaying: () => playing };
}
