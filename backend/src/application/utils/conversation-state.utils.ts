export const CONVERSATION_STATE_TTL_MS = 15 * 60 * 1000;

/**
 * Checks if a conversation state has expired based on a 15-minute inactivity window.
 */
export function isConversationStateExpired(
  updatedAtStr: string,
  recordUpdatedAtStr?: string,
  ttlMs = CONVERSATION_STATE_TTL_MS,
): boolean {
  const updatedAt = Date.parse(updatedAtStr || recordUpdatedAtStr || '');
  if (!Number.isFinite(updatedAt)) return false;
  return Date.now() - updatedAt > ttlMs;
}
