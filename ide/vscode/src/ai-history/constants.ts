export const AI_ROLE = {
  USER: 'user',
  ASSISTANT: 'assistant',
} as const;

export type AiRole = (typeof AI_ROLE)[keyof typeof AI_ROLE];

export const AI_PROVIDER = {
  CLAUDE_CODE: 'claude-code',
  CODEX_CLI: 'codex-cli',
  ANTIGRAVITY: 'antigravity',
  OPEN_CODE: 'open-code',
} as const;

export type AiProviderId = (typeof AI_PROVIDER)[keyof typeof AI_PROVIDER];

export const AI_PROVIDER_NAME: Record<AiProviderId, string> = {
  [AI_PROVIDER.CLAUDE_CODE]: 'Claude Code',
  [AI_PROVIDER.CODEX_CLI]: 'Codex CLI',
  [AI_PROVIDER.ANTIGRAVITY]: 'Antigravity',
  [AI_PROVIDER.OPEN_CODE]: 'OpenCode',
};

export const AI_SESSION_PATH = {
  CLAUDE_CODE: ['.claude', 'projects'],
  CODEX_CLI: ['.codex', 'sessions'],
  ANTIGRAVITY_CLI: ['.gemini', 'antigravity-cli', 'brain'],
  ANTIGRAVITY_IDE: ['.gemini', 'antigravity-ide', 'brain'],
  OPEN_CODE: ['.local', 'share', 'opencode', 'opencode.db'],
  OPEN_CODE_PROD: ['.local', 'share', 'opencode', 'opencode-prod.db'],
} as const;

export const AI_HISTORY_CONFIG = {
  SECTION: 'kote',
  CLAUDE_CODE_LOG_PATH: 'claudeCodeLogPath',
  CODEX_LOG_PATH: 'codexLogPath',
  ANTIGRAVITY_LOG_PATH: 'antigravityLogPath',
  OPEN_CODE_DB_PATH: 'opencodeDbPath',
} as const;

export const JSONL_EXTENSION = '.jsonl';
export const AI_TEXT_CONTENT_TYPE = 'text';
export const DEFAULT_AI_SESSION_LIMIT = 20;
export const AI_SESSION_FILE_DEBOUNCE_MS = 500;
export const AI_SESSION_DATABASE_DEBOUNCE_MS = 1000;
export const AUTO_SAVE_MAX_AGE_MS = 15 * 60 * 1000;

export const ANTIGRAVITY_LOG_FILES = ['transcript_full.jsonl', 'transcript.jsonl'] as const;

export const CODEX_FINAL_ANSWER_PHASE = 'final_answer';
export const OPEN_CODE_FINAL_FINISH = 'stop';

export const CODEX_INTERNAL_USER_PREFIXES = [
  '<environment_context>',
  '# AGENTS.md instructions',
  '<permissions instructions>',
  '<skills_instructions>',
  '<apps_instructions>',
] as const;
