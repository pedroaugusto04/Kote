export const EXTENSION_COMMANDS = {
  SAVE_SELECTION: 'kote.saveSelection',
  SAVE_ACTIVE_FILE: 'kote.saveActiveFile',
  OPEN_CHAT: 'kote.openChat',
  REFRESH: 'kote.refresh',
  ON_AUTH_CHANGE: 'kote.onAuthChange',
  SHOW_RECENT_AI_SESSIONS: 'kote.showRecentAiSessions',
  CONFIGURE_AI_SESSION_MODE: 'kote.configureAiSessionMode',
  OPEN_SYNC_TAB: 'kote.openSyncTab',
  SIDEBAR_VIEW_FOCUS: 'kote.sidebarView.focus',
} as const;

export const GLOBAL_STATE_KEYS = {
  AI_SESSION_MODE_PICKED: 'kote.aiSessionModePicked',
  KNOWN_SESSION_HASHES: 'kote.knownSessionHashes',
  RECENT_SESSIONS: 'kote.recentSessions',
  SAVED_SESSIONS_MAP: 'kote.savedSessionsMap',
  IGNORED_SESSIONS_MAP: 'kote.ignoredSessionsMap',
  AI_SESSION_SAVE_MODE: 'kote.aiSessionSaveMode',
} as const;

export const SOURCE_CHANNELS = {
  IDE: 'ide',
  AI_CHAT: 'ai-chat',
} as const;

export const AI_SESSION_SAVE_MODES = {
  AUTO_SAVE: 'auto-save',
  ASK: 'ask',
  IGNORE_ALL: 'ignore-all',
} as const;

export const SESSION_PROMPT_ACTIONS = {
  AUTO_SAVE: 'Auto-save',
  PREVIEW_EDIT: 'Preview & Edit',
  IGNORE: 'Ignore',
} as const;

export const DEFAULT_FALLBACK_PROJECT_SLUG = 'inbox';
