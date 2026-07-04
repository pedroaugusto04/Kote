export enum McpToolNames {
  SearchNotes = 'kote_search_notes',
  GetNote = 'kote_get_note',
  CreateNote = 'kote_create_note'
}

export enum McpResourceUris {
  Projects = 'kote://projects'
}

export const CONFIG_CONSTANTS = {
  DefaultConfigDirName: '.config',
  DefaultConfigAppName: 'kote',
  ConfigFileName: 'config.json',
  FallbackWorkspaceSlug: 'default',
  FallbackProjectSlug: 'inbox',
  DefaultApiUrl: 'https://knowledgebase.sbs/kote/api'
} as const;

export const ENV_VARS = {
  ApiUrl: 'KB_API_URL',
  ApiPublicBaseUrl: 'KB_API_PUBLIC_BASE_URL',
  WorkspaceSlug: 'KB_CLI_WORKSPACE',
  DefaultProject: 'KB_CLI_PROJECT',
  ConfigDir: 'KB_CLI_CONFIG_DIR',
  AccessToken: 'KOTE_ACCESS_TOKEN',
  SessionCookie: 'KOTE_SESSION_COOKIE'
} as const;
