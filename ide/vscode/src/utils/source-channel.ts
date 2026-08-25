export const GIT_SOURCE_CHANNELS = ['github', 'git', 'commit'] as const;

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

export const SOURCE_BADGE_CONFIGS = [
  { match: 'claude', label: 'Claude Code', className: 'badge-claude' },
  { match: 'antigravity', label: 'Antigravity', className: 'badge-antigravity' },
  { match: 'codex', label: 'Codex', className: 'badge-codex' },
  { match: 'opencode', label: 'OpenCode', className: 'badge-opencode' },
  { match: 'whatsapp', label: 'WhatsApp', className: 'badge-whatsapp' },
  { match: 'telegram', label: 'Telegram', className: 'badge-telegram' },
  { match: 'github', label: 'Git Commit', className: 'badge-git' },
  { match: 'commit', label: 'Git Commit', className: 'badge-git' },
  { match: 'git', label: 'Git Commit', className: 'badge-git' },
] as const;

export const DEFAULT_SOURCE_BADGE: SourceBadge = {
  label: 'Note',
  className: 'badge-note',
};

export interface SourceBadge {
  label: string;
  className: string;
}

/**
 * Checks whether a given channel string represents a git source channel.
 */
export function isGitChannel(sourceChannel?: string): boolean {
  const channel = (sourceChannel || '').toLowerCase();
  return GIT_SOURCE_CHANNELS.some((g) => channel.includes(g));
}

/**
 * Checks whether a given sourceChannel, canonicalType or source represents an AI chat session or note.
 */
export function isAiSessionChannel(sourceChannel?: string, fallbackChannel?: string): boolean {
  return !isGitChannel(sourceChannel || fallbackChannel);
}

/**
 * Resolves uniform source badges and styling CSS classes for UI views.
 */
export function resolveSourceBadge(sourceChannel?: string, fallbackChannel?: string): SourceBadge {
  const s = (sourceChannel || fallbackChannel || '').toLowerCase();
  for (const config of SOURCE_BADGE_CONFIGS) {
    if (s.includes(config.match)) {
      return { label: config.label, className: config.className };
    }
  }
  return DEFAULT_SOURCE_BADGE;
}
