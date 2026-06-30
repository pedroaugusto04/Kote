export const RESOLUTION_ERROR_MESSAGES = {
  WORKSPACE_SLUG_MISSING: 'workspace_slug_missing',
  WORKSPACE_NOT_FOUND: 'workspace_not_found',
  PROJECT_SLUG_MISSING: 'project_slug_missing',
  PROJECT_NOT_FOUND: 'project_not_found',
} as const;

export const RESOLUTION_SPECIAL_VALUES = {
  ALL_PROJECTS: 'all',
} as const;

export const RESOLUTION_PARAM_LOCATIONS = {
  PARAMS: 'params',
  QUERY: 'query',
  BODY: 'body',
} as const;
