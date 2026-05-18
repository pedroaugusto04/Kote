export const authLandingContent = {
  title: {
    prefix: 'Knowledge Vault helps you',
    suffix: 'technical context.',
    accessible: 'Knowledge Vault helps you capture technical context.',
  },
  typewriterWords: ['capture', 'organize', 'recover', 'act on'],
  lead: 'Keep notes, chats, GitHub activity, decisions, and reminders connected to the projects that need them next.',
  storyCards: [
    {
      title: 'Capture',
      heading: 'Save project memory where work already happens.',
      description: 'Turn chats, manual notes, bugs, and repository events into structured records without breaking your flow.',
      detailLabel: 'Sources',
      detail: 'WhatsApp, Telegram, GitHub, manual notes',
      tags: ['chat', 'reviews', 'bugs'],
    },
    {
      title: 'Organize',
      heading: 'Keep context attached to the right workspace.',
      description: 'Group notes by project, status, tags, and folders so implementation details stay easy to scan.',
      detailLabel: 'Project view',
      detail: 'folders, tags, active findings',
      tags: ['projects', 'status', 'folders'],
    },
    {
      title: 'Recover',
      heading: 'Find the decision, phrase, or follow-up later.',
      description: 'Search the fragment you remember and reopen the exact note, review context, or reminder behind it.',
      detailLabel: 'Search',
      detail: 'Search "retry policy"',
      tags: ['decisions', 'snippets', 'history'],
    },
    {
      title: 'Act',
      heading: 'Turn knowledge into the next clear action.',
      description: 'Keep reminders and review findings linked to source context so resumed work starts with signal.',
      detailLabel: 'Next step',
      detail: 'follow up on webhook backfill',
      tags: ['reminders', 'reviews', 'handoffs'],
    },
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
