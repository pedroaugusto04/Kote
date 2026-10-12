export const ROOT_FOLDER_ID = '';

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
  
  EXPORT_ZIP: 'Export (.zip)',
  EXPORT_ZIP_START: 'Exporting notes to ZIP...',
  EXPORT_ZIP_SUCCESS: 'ZIP archive downloaded successfully',
  EXPORT_ZIP_ERROR: 'Could not export notes as ZIP',
  EXPORT_ZIP_CONFIRM_TITLE: 'Export project notes',
  EXPORT_ZIP_CONFIRM_DESCRIPTION: 'Are you sure you want to export notes as a ZIP archive?',
  EXPORT_ADRS_CONFIRM_TITLE: 'Export ADRs (.zip)',
  EXPORT_ADRS_CONFIRM_DESCRIPTION: 'Are you sure you want to export decisions as Architecture Decision Record (ADR) markdown files in a ZIP archive?',
} as const;

