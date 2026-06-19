export const QUERY_KEYS = {
  DASHBOARD: ['dashboard'] as const,
  AUTH: {
    ME: ['auth', 'me'] as const,
  },
  NOTES: {
    ALL: ['notes'] as const,
    RELATED: (noteId: string) => ['notes', 'related', noteId] as const,
    VAULT: (effectiveProject: string, noteId: string, page: number) => 
      ['notes', 'vault', effectiveProject, noteId, page] as const,
    VAULT_PREVIOUS_PAGE: (effectiveProject: string, currentPage: number) => 
      ['notes', 'vault', effectiveProject, 'previous-page', currentPage] as const,
    VAULT_NEXT_PAGE: (effectiveProject: string, currentPage: number) => 
      ['notes', 'vault', effectiveProject, 'next-page', currentPage] as const,
  },
  PROJECTS: {
    ALL: ['project-timeline'] as const,
    FOLDERS: (projectSlug: string) => ['project-folders', projectSlug] as const,
    TIMELINE: (projectSlug: string, folderId: string, category: string, status: string, page: number) => 
      ['project-timeline', projectSlug, folderId, category, status, page] as const,
    TIMELINE_ALL_PROJECTS: (category: string, status: string, page: number) => 
      ['project-timeline', 'all-projects', category, status, page] as const,
    SEARCH: (query: string, projectSlug: string, workspaceSlug: string, status: string, page: number) => 
      ['projects-search', query, projectSlug, workspaceSlug, status, page] as const,
  },
  INTEGRATIONS: {
    ALL: (workspaceSlug: string) => ['integrations', workspaceSlug] as const,
    GITHUB_REPOSITORIES: (workspaceSlug: string) => ['github-repositories', workspaceSlug] as const,
    SESSION: (workspaceSlug: string, provider: string, sessionId: string) => 
      ['integration-session', workspaceSlug, provider, sessionId] as const,
  },
  WEBHOOKS: {
    SUBSCRIPTIONS: (workspaceSlug: string) => ['webhook-subscriptions', workspaceSlug] as const,
    TRIGGERS: ['webhook-triggers'] as const,
  },
  REMINDERS: {
    ALL: (workspaceSlug: string, status: string, page: number) => 
      ['reminders', workspaceSlug, status, page] as const,
    BOARD: (workspaceSlug: string, projectSlug: string, columnPages: Record<string, number>) => 
      ['reminder-board', workspaceSlug, projectSlug, columnPages] as const,
  },
  ASK: {
    HISTORY: (projectSlug: string, page: number) => ['ask-history', projectSlug, page] as const,
    BRIEF_HISTORY: (projectSlug: string, page: number) => ['brief-history', projectSlug, page] as const,
  },
  HOME: {
    TIMELINE: (selectedProject: string) => ['home-project-timeline', selectedProject] as const,
  },
  GLOBAL_SEARCH: (debouncedSearchValue: string, workspaceSlug: string) => 
    ['global-search-popover', debouncedSearchValue, workspaceSlug] as const,
} as const;
