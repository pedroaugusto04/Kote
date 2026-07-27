export const AI_SOURCE_PATTERNS = [
  'ai-chat',
  'antigravity',
  'codex',
  'claude',
  'open-code',
  'opencode',
] as const;

export type AiSourcePattern = (typeof AI_SOURCE_PATTERNS)[number];
