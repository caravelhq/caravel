// Derive a readable display name from a chat id when no explicit name is stored.
// Task chat ids have the shape "task-TSK-YYYY-MM-DD-NNNN-agentname".
export function deriveChatName(chatId: string): string {
  const m = chatId.match(/^task-(TSK-\d{4}-\d{2}-\d{2}-\d{4})-([a-z]+)$/i);
  if (!m) return "";
  const agent = m[2].charAt(0).toUpperCase() + m[2].slice(1);
  return `${m[1]} · ${agent}`;
}
