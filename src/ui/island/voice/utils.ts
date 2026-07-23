export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\|/g, "  ")
    .replace(/^[-:|]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function extractChunks(
  pending: string,
  isDone: boolean
): { chunks: string[]; consumed: number } {
  const chunks: string[] = [];
  let consumed = 0;
  const blocks = pending.split(/(\n\n+)/);
  let pos = 0;
  for (let b = 0; b < blocks.length; b++) {
    const part = blocks[b]!;
    if (/^\n\n+$/.test(part)) { pos += part.length; continue; }
    const hasTrailingSep = b + 1 < blocks.length && /^\n\n+$/.test(blocks[b + 1]!);
    const isComplete = hasTrailingSep || isDone;
    if (isComplete) {
      const trimmed = part.trim();
      if (trimmed.length > 250) {
        const re = /[.!?]\s+/g;
        let m: RegExpExecArray | null;
        let sentStart = 0;
        while ((m = re.exec(trimmed)) !== null) {
          const end = m.index + m[0].length;
          const sent = trimmed.slice(sentStart, end).trim();
          if (sent) chunks.push(sent);
          sentStart = end;
        }
        const tail = trimmed.slice(sentStart).trim();
        if (tail) chunks.push(tail);
      } else if (trimmed) {
        chunks.push(trimmed);
      }
      pos += part.length;
      consumed = pos;
    } else {
      const re2 = /[.!?]\s+/g;
      let m2: RegExpExecArray | null;
      let sentStart2 = 0;
      let lastSentEnd = 0;
      while ((m2 = re2.exec(part)) !== null) {
        const end2 = m2.index + m2[0].length;
        const sent2 = part.slice(sentStart2, end2).trim();
        if (sent2) chunks.push(sent2);
        sentStart2 = end2;
        lastSentEnd = end2;
      }
      consumed = pos + lastSentEnd;
      break;
    }
  }
  return { chunks, consumed };
}

const MIME_CANDIDATES = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm",
];

export function detectMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

export function isRecordingSupported(): boolean {
  return !!(
    typeof MediaRecorder !== "undefined" &&
    navigator.mediaDevices?.getUserMedia &&
    detectMimeType()
  );
}
