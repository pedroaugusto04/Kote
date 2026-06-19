export const PROJECTS_WORKSPACE_MESSAGES = {
  STATUS_OPTIONS: {
    OPEN: 'Open',
    ALL: 'All',
  },
  
  SEARCH: {
    DEBOUNCE_MS: 350,
    IN_PROJECT: 'Search in {project}',
    ACROSS_ALL: 'Search across all projects',
  },
  
  CONFIRMATION: {
    DELETE_PROJECT: 'Deleting project {displayName} is permanent.',
    DELETE_FOLDER: 'Folder {displayName} will only be removed if it is empty.',
    DELETE_NOTE: 'Deleting note {title} also removes its linked reminder, when present.',
  },
} as const;
