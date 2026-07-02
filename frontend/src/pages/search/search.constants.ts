export const SEARCH_MESSAGES = {
  PAGE_TITLE: 'Ask AI',
  PAGE_SUBTITLE: 'Ask questions, generate project briefs, and explore your AI history.',
  
  TABS: {
    ASK_AI: 'Ask AI',
    PROJECT_BRIEFS: 'Project Briefs',
  },
  
  INPUT: {
    PLACEHOLDER: 'Ask a question',
    ASK_BUTTON: 'Ask',
    ASKING: 'Asking...',
    SHOW_HISTORY: 'Show history',
    HIDE_HISTORY: 'Hide history',
  },
  
  VALIDATION: {
    TYPE_BEFORE_ASKING: 'Type something before asking AI.',
  },
  
  ERRORS: {
    COULD_NOT_GENERATE_ANSWER: 'Could not generate an answer. Please try again.',
    UNEXPECTED_ERROR: 'An unexpected error occurred while communicating with the AI.',
    COULD_NOT_GENERATE_BRIEF: 'Could not generate the project brief.',
  },
  
  HISTORY: {
    ASK_HISTORY_TITLE: 'Question History',
    BRIEF_HISTORY_TITLE: 'Brief History',
    LOADING: 'Loading history...',
    NO_ASK_HISTORY: 'No Ask AI history for this filter.',
    NO_BRIEF_HISTORY: 'No brief history for this project.',
    COULD_NOT_LOAD_ASK_HISTORY: 'Could not load Ask AI history.',
    COULD_NOT_LOAD_BRIEF_HISTORY: 'Could not load Brief history.',
  },
  
  SKELETON: {
    THINKING: 'Thinking...',
  },
  
  WAITING_STATE: {
    TITLE: 'Ask AI Assistant',
    DESCRIPTION: 'Ask questions, query your notes, or get summaries instantly using neural search.',
    SUGGESTED_TITLE: 'Suggested Prompts',
  },
  
  SUGGESTED_PROMPTS: [
    'What did I work on recently?',
    'How is the system architecture organized?',
    'What technical decisions were made?',
    'What risks or issues were identified?',
  ],
  
  FILTER: {
    ALL_PROJECTS: 'All projects',
    FILTER_BY_PROJECT: 'Filter by project',
  },
} as const;
