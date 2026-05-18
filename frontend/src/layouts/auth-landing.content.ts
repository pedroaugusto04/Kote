export const authLandingContent = {
  eyebrow: 'Personal knowledge base for technical work',
  title: 'Your technical memory, always searchable.',
  lead: 'Capture decisions, bugs, automations, conversations, and project context as you work. Recover the exact thread when you need to debug, review, or continue.',
  preview: {
    search: 'Search "retry policy"',
    context: 'Project context',
    items: [
      {
        label: 'Decision',
        title: 'Queue retries capped at 5 attempts',
        meta: 'payments-api · captured from GitHub review',
      },
      {
        label: 'Reminder',
        title: 'Follow up on webhook backfill',
        meta: 'tomorrow · linked to incident notes',
      },
      {
        label: 'Bug',
        title: 'OAuth callback fails after stale session',
        meta: 'auth-service · reproduced from chat',
      },
    ],
    projectFacts: ['open findings', 'recent notes', 'active reminders'],
  },
  pillars: [
    {
      title: 'Capture',
      description: 'Save WhatsApp, Telegram, manual notes, and GitHub events without breaking your flow.',
    },
    {
      title: 'Organize',
      description: 'Keep projects, tags, folders, and status aligned around the way you already work.',
    },
    {
      title: 'Recover',
      description: 'Search recent context, priorities, decisions, and implementation details by project.',
    },
    {
      title: 'Act',
      description: 'Turn findings into reminders, reviews, and follow-ups that stay connected to source context.',
    },
  ],
  steps: [
    'Connect your workspace and core integrations.',
    'Capture knowledge from notes, chats, repos, and daily work.',
    'Search by project, status, tag, or the phrase you remember.',
    'Return to the decision, reminder, or review when work resumes.',
  ],
} as const;

export const authCopy = {
  login: {
    title: 'Sign in to your workspace',
    description: 'Open your searchable technical memory and continue from your latest context.',
    submit: 'Sign in',
  },
  signup: {
    title: 'Create your knowledge base',
    description: 'Start capturing the technical context your future self will need.',
    submit: 'Create account',
  },
} as const;
