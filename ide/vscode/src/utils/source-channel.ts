export const KNOWN_AI_SESSION_CHANNELS = [
  'claude',
  'claude-code',
  'antigravity',
  'codex',
  'opencode',
  'ai-chat',
  'ai',
  'chat',
  'session',
  'kote',
  'ide',
  'cli',
  'note',
] as const;

export interface SourceBadge {
  label: string;
  className: string;
}

/**
 * Checks whether a given sourceChannel, canonicalType or source represents an AI chat session or note.
 */
export function isAiSessionChannel(sourceChannel?: string, fallbackChannel?: string): boolean {
  const channel = (sourceChannel || fallbackChannel || '').toLowerCase();
  if (channel.includes('github') || channel.includes('commit')) {
    return false;
  }
  return true;
}

/**
 * Resolves uniform source badges and styling CSS classes for UI views.
 */
export function resolveSourceBadge(sourceChannel?: string, fallbackChannel?: string): SourceBadge {
  const s = (sourceChannel || fallbackChannel || '').toLowerCase();
  if (s.includes('claude')) return { label: 'Claude Code', className: 'badge-claude' };
  if (s.includes('antigravity')) return { label: 'Antigravity', className: 'badge-antigravity' };
  if (s.includes('codex')) return { label: 'Codex', className: 'badge-codex' };
  if (s.includes('opencode')) return { label: 'OpenCode', className: 'badge-opencode' };
  if (s.includes('whatsapp')) return { label: 'WhatsApp', className: 'badge-whatsapp' };
  if (s.includes('telegram')) return { label: 'Telegram', className: 'badge-telegram' };
  if (s.includes('github') || s.includes('commit')) return { label: 'Git Commit', className: 'badge-git' };
  return { label: 'Note', className: 'badge-note' };
}
