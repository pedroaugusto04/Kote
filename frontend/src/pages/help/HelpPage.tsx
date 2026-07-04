import { useState } from 'react';
import './HelpPage.css';
import { useMediaQuery } from '../../shared/ui/use-media-query';
import { useMobileSwipe } from '../../shared/ui/use-mobile-swipe';

type SectionId = 'overview' | 'projects' | 'ai-chat' | 'messaging-integrations' | 'github-integration' | 'ai-integrations' | 'webhooks' | 'push-notifications' | 'cli' | 'vscode' | 'mcp' | 'reminders' | 'map';

interface HelpItem {
  title: string;
  body: string;
  code?: string;
  tip?: string;
  steps?: string[];
}

interface HelpSection {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  items: HelpItem[];
}

const IconBook = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);
const IconFolder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
const IconBot = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><path d="M8 15h.01M16 15h.01" />
  </svg>
);
const IconPlug = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8H6a1 1 0 0 0-1 1v3a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V9a1 1 0 0 0-1-1Z" />
  </svg>
);
const IconTerminal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);
const IconCode = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);
const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const IconMap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
  </svg>
);
const IconGithub = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);
const IconChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const IconInfo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
  </svg>
);
const IconWhatsApp = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const sections: HelpSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: <IconBook />,
    title: 'What is Kote?',
    description: 'Kote centralizes your team\'s operational knowledge — decisions, routines, and context — in one searchable, AI-queryable place.',
    items: [
      { title: 'Zero context loss', body: 'Every decision, routine, and exception is recorded. New team members get up to speed in minutes, not weeks.' },
      { title: 'Invisible capture', body: 'Knowledge flows in where work happens: WhatsApp audio messages, Telegram alerts, GitHub pushes, VS Code, and the CLI.' },
      { title: 'AI-powered retrieval', body: 'Ask questions in natural language. The AI answers from your actual project data, not generic internet knowledge.' },
      { title: 'Full documentation', body: 'For detailed setup guides, API reference, and contribution guidelines, check the complete documentation on GitHub.', tip: 'View the full README at https://github.com/pedroaugusto04/Knowledge-Base/blob/main/README.md' },
    ],
  },
  {
    id: 'projects',
    label: 'Projects & Notes',
    icon: <IconFolder />,
    title: 'Projects & Notes',
    description: 'Projects organize your knowledge into focused areas. Each project is a living hub — notes, decisions, and AI-generated briefs all in one place.',
    items: [
      { title: 'Creating a project', body: 'Open the Projects page from the sidebar. Click "New project", give it a name and slug. The slug is used in CLI and integration references.' },
      { title: 'Adding notes', body: 'Inside any project, click "New note". Notes support markdown, tags, reminders, and file attachments.' },
      { title: 'Project Brief', body: 'The AI-generated project brief summarizes the latest activity and key decisions. Open a project and click "Brief" to generate or refresh it.' },
      { title: 'Folders', body: 'Notes can be organized into folders within a project.', tip: 'Use folders to separate concerns: "Architecture", "Incidents", "Decisions".' },
    ],
  },
  {
    id: 'ai-chat',
    label: 'Ask AI',
    icon: <IconBot />,
    title: 'AI-Powered Chat',
    description: 'The Ask AI page is a chat interface grounded in your Kote. Ask questions, filter by project, and get answers with source citations.',
    items: [
      { title: 'Asking a question', body: 'Navigate to "Ask AI" in the sidebar. Type any question about your projects, past decisions, or technical context.' },
      { title: 'Filtering by project', body: 'Use the project filter at the top to scope responses to a specific project. This improves precision for project-specific queries.' },
      { title: 'Conversation history', body: 'Sessions are saved as notes in your Kote and can be re-opened from the AI history panel on the right side.' },
      { title: 'WhatsApp /ask command', body: 'Once WhatsApp is connected, send "/ask <question>" to the Kote bot to get AI answers directly in WhatsApp.', code: '/ask what was decided about the auth architecture last week?' },
    ],
  },
  {
    id: 'messaging-integrations',
    label: 'Messaging',
    icon: <IconWhatsApp />,
    title: 'Messaging Integrations',
    description: 'Connect WhatsApp and Telegram to capture knowledge where your team communicates — audio messages, alerts, and quick queries.',
    items: [
      {
        title: 'WhatsApp',
        body: 'Send audio or text messages to the Kote WhatsApp bot — audio is transcribed and structured into notes automatically. Use /ask to search your Kote directly from the chat.',
        steps: [
          'Go to Settings → Integrations → WhatsApp',
          'Copy the token command shown',
          `Send it to +${import.meta.env.VITE_WHATSAPP_NUMBER || '5531992504889'}`,
          'Click "Open WhatsApp" to open the chat with the message pre-filled',
        ],
        code: `/kote connect <token>   ← send this to +${import.meta.env.VITE_WHATSAPP_NUMBER || '5531992504889'}`,
        tip: 'You can also send documents, images, and other files directly to the WhatsApp bot — they will be attached to the created note. Use /ask to ask questions and retrieve files from your Kote.',
      },
      {
        title: 'Telegram',
        body: 'Receive pipeline failure alerts, code review summaries, and GitHub push notifications directly in Telegram via the Kote bot.',
        steps: [
          'Go to Settings → Integrations → Telegram',
          'Copy the token command shown',
          `Send it to @${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'kb_notes_bot'}`,
          'Click "Open Telegram bot" to open the chat directly',
        ],
        code: `/kote connect <token>   ← send this to @${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'kb_notes_bot'}`,
      },
    ],
  },
  {
    id: 'github-integration',
    label: 'GitHub',
    icon: <IconGithub />,
    title: 'GitHub Integration',
    description: 'Connect GitHub repositories to automatically capture code reviews, push summaries, and technical decisions as notes.',
    items: [
      {
        title: 'GitHub App Installation',
        body: 'Install the Kote GitHub App to enable automatic code review capture on push events.',
        steps: [
          'Go to Settings → Integrations → GitHub App',
          'Click "Connect" to install the GitHub App',
          'Select your workspace repositories after installation'
        ]
      },
      {
        title: 'Automatic Code Reviews',
        body: 'On every push, the system analyzes the changes using AI and creates a structured note with summary, impact, risks, and next steps.',
        tip: 'Code reviews are tagged with the repository name and automatically linked to the corresponding project.',
      },
      {
        title: 'Repository Selection',
        body: 'After connecting the GitHub App, select which repositories to monitor. Each repository can be mapped to a specific project.',
        tip: 'Use the "Repositories" button in the GitHub integration card to manage your selected repositories.',
      },
    ],
  },
  {
    id: 'ai-integrations',
    label: 'AI Providers',
    icon: <IconBot />,
    title: 'AI Provider Integrations',
    description: 'AI providers power the intelligent features in Kote — code reviews, conversations, project briefs, and PR context.',
    items: [
      {
        title: 'Review AI',
        body: 'Automatically analyzes your code changes when you push to GitHub, providing summaries, impact analysis, and risk assessments.'
      },
      {
        title: 'Conversation AI',
        body: 'Powers the Ask AI feature, understanding your questions and finding relevant answers from your Kote.'
      },
      {
        title: 'Project Brief AI',
        body: 'Generates comprehensive project summaries that highlight recent activity, key decisions, and important context.'
      },
      {
        title: 'PR Context AI',
        body: 'Analyzes changed files and title/description of newly opened Pull Requests to automatically retrieve historical technical decisions and context, posting it as a PR comment.'
      },
    ],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    icon: <IconPlug />,
    title: 'Webhooks',
    description: 'Configure webhooks to automatically notify external systems when notes are created, updated, or deleted in your Kote.',
    items: [
      {
        title: 'What are webhooks?',
        body: 'Webhooks allow you to send automatic notifications to external services when specific events occur in Kote. For example, you can notify a Slack channel when a new note is created, trigger a deployment when a decision is recorded, or sync data with other tools.',
      },
      {
        title: 'Available events',
        body: 'You can configure webhooks for the following events:',
        steps: [
          'Note created - triggered when a new note is added',
          'Note updated - triggered when an existing note is modified',
          'Note deleted - triggered when a note is permanently removed',
        ],
      },
      {
        title: 'Webhook request format',
        body: 'Webhooks are sent as POST requests with JSON payload. The request includes headers for event identification and optional signature verification.',
        code: `Headers:
  Content-Type: application/json
  X-KB-Event: note.created (or note.updated, note.deleted)
  X-KB-Delivery-Id: unique-delivery-identifier
  X-KB-Signature-256: sha256=... (if secret is configured)

Body:
{
  "event": "note.created",
  "noteId": "uuid",
  "userId": "uuid",
  "workspaceSlug": "workspace-name",
  "projectSlug": "project-name",
  "title": "Note title",
  "content": "Note content",
  "occurredAt": "2024-01-01T00:00:00Z"
}`,
      },
      {
        title: 'Setting up a webhook',
        body: 'Create webhook subscriptions in Settings to define which events trigger notifications and where they should be sent.',
        steps: [
          'Go to Settings → Integrations → Webhook Subscriptions',
          'Click "New subscription" to create a webhook',
          'Enter a label, your endpoint URL, and select the events you want to track',
          'Optionally add a secret for signature verification',
        ],
        tip: 'Use a secret to verify that webhook requests are genuinely from Kote by checking the X-KB-Signature-256 header.',
      },
    ],
  },
  {
    id: 'vscode',
    label: 'VS Code',
    icon: <IconCode />,
    title: 'VS Code Extension',
    description: 'The Kote VS Code extension brings the knowledge base into your editor — save code, ask questions, and import AI sessions without leaving VS Code.',
    items: [
      {
        title: 'Installation',
        body: 'Install the extension from the VS Code Marketplace.',
        steps: [
          'Open VS Code → Extensions',
          'Search "Kote"',
          'Install the extension',
          'Run "Kote: Sign In" from the Command Palette',
        ],
      },
      { title: 'Saving code snippets', body: 'Select any code → Right-click → "Save to Kote". The snippet is stored as a note with file path and language metadata.' },
      { title: 'Quick AI questions', body: 'Use the sidebar chat or Command Palette to ask questions about your Kote without switching tabs.' },
      { title: 'Importing AI sessions', body: 'The extension detects AI assistant sessions in your workspace and lets you import them with one click from the sidebar.' },
      {
        title: 'CodeLens - View Related Notes',
        body: 'When you open a file that has associated notes or decisions in your Kote, a CodeLens indicator appears at the top of the file showing the count of related notes. Click the indicator to view and open these notes directly in your editor.',
        steps: [
          'Look for the CodeLens indicator (💡 Kote: X notes/decisions about this file) at the top of your editor',
          'Click the CodeLens to see a quick pick list of related notes',
          'Select a note to view it in a Markdown preview with metadata',
          'Use the link in the preview to open the note in the Kote web application',
        ],
        tip: 'This feature helps you quickly access relevant context and decisions without leaving your editor. CodeLens not working? Make sure it\'s enabled in your VS Code settings ("editor.codeLens": true). It\'s enabled by default, but may have been disabled globally.',
      },
      { title: 'Extension documentation', body: 'For detailed extension features, keyboard shortcuts, and configuration options, check the VS Code extension documentation on GitHub.', tip: 'View VS Code extension README at https://github.com/pedroaugusto04/Knowledge-Base/blob/main/ide/vscode/README.md' },
    ],
  },
  {
    id: 'cli',
    label: 'CLI Tool',
    icon: <IconTerminal />,
    title: 'CLI Tool',
    description: 'The Kote CLI syncs local files, directories, and AI session histories directly to your Kote from the terminal.',
    items: [
      { title: 'Installation', body: 'Install the CLI globally via npm and initialize it with your API token.', code: 'npm install -g @pedroaugusto04/kote-cli\nkote init' },
      { title: 'Syncing AI sessions', body: 'Sync AI assistant sessions (Claude Code, Codex, Antigravity, OpenCode) to your Kote.', code: 'kote sync-ai' },
      { title: 'Syncing files and directories', body: 'Send individual files or entire directories to your Kote.', code: 'kote sync --file ./README.md\nkote sync --dir ./docs' },
      { title: 'Finding your API token', body: 'Go to Profile → CLI & VS Code Connection in the app to generate a unified connection token. This token authenticates both the VS Code extension and CLI.' },
      { title: 'CLI documentation', body: 'For complete CLI commands, usage examples, and advanced configuration, refer to the CLI documentation on GitHub.', tip: 'View CLI README at https://github.com/pedroaugusto04/Knowledge-Base/blob/main/cli/README.md' },
    ],
  },
  {
    id: 'mcp',
    label: 'MCP Server',
    icon: <IconPlug />,
    title: 'MCP Server',
    description: 'The Kote MCP Server allows AI agents (like Cursor, Claude Desktop, and Cline) to query and save developer memory directly.',
    items: [
      {
        title: 'Running via npx',
        body: 'You can run the Kote MCP Server directly from npm using npx in your IDE or client configurations.',
        code: 'npx -y @pedroaugusto04/kote-mcp',
      },
      {
        title: 'Cursor Integration',
        body: 'Open Cursor Settings → Features → MCP → Click "+ Add New MCP Server":\n- Name: kote\n- Type: stdio\n- Command: npx -y @pedroaugusto04/kote-mcp',
      },
      {
        title: 'Claude Desktop Integration',
        body: 'Add the following block to your "claude_desktop_config.json" file:',
        code: '{\n  "mcpServers": {\n    "kote": {\n      "command": "npx",\n      "args": ["-y", "@pedroaugusto04/kote-mcp"]\n    }\n  }\n}',
      },
      {
        title: 'Antigravity & Codex Integration',
        body: 'To use the Kote MCP Server with local coding assistants like Antigravity or Codex, configure the stdio transport in their respective configuration settings (such as "mcp.json" or workspace configuration files):',
        code: '{\n  "mcpServers": {\n    "kote": {\n      "command": "npx",\n      "args": ["-y", "@pedroaugusto04/kote-mcp"]\n    }\n  }\n}',
      },
      { title: 'Auto-authentication', body: 'The MCP server automatically reads authenticated credentials from your local CLI configuration. Ensure you have installed and logged in via the Kote CLI ("kote login") first.' },
      { title: 'MCP documentation', body: 'For advanced options, environment variable configuration, and troubleshooting, view the documentation on GitHub.', tip: 'View MCP README at https://github.com/pedroaugusto04/Knowledge-Base/blob/main/ide/mcp/README.md' },
    ],
  },
  {
    id: 'push-notifications',
    label: 'Push Notifications',
    icon: <IconBell />,
    title: 'Push Notifications',
    description: 'Get notified directly in your browser about reminders and important updates.',
    items: [
      {
        title: 'Enabling Push Notifications',
        body: 'Allow browser notifications when prompted and activate the Push Notifications integration in Settings.',
        steps: [
          'Go to Settings → Integrations → Push Notifications',
          'Click "Connect" to enable push notifications',
          'Allow browser notifications when prompted',
        ],
        tip: 'You can use push notifications alongside WhatsApp reminders, or choose one based on your preference.',
      },
      {
        title: 'Reminder Notifications',
        body: 'Receive browser notifications when your note reminders are due, so you never miss important follow-ups.'
      },
      {
        title: 'System Updates',
        body: 'Stay informed with important alerts and updates delivered directly to your browser.',
        tip: 'Make sure to keep notifications enabled in your browser settings.',
      },
    ],
  },
  {
    id: 'reminders',
    label: 'Reminders',
    icon: <IconBell />,
    title: 'Reminders',
    description: 'Attach reminders to notes so important decisions, reviews, or follow-ups surface at the right time — delivered via WhatsApp.',
    items: [
      { title: 'Setting a reminder in the app', body: 'When creating or editing a note, set a reminder date and time. The system will send a WhatsApp message with the note content at the scheduled time.', tip: 'WhatsApp must be connected for reminder delivery to work.' },
      {
        title: 'Setting a reminder via WhatsApp',
        body: 'You can create a reminder directly from WhatsApp — just like saving a regular note, but including the day and time for the reminder. Send a message to the Kote bot specifying the reminder schedule.',
        code: 'Remind me to review Lucas\'s PR tomorrow at 10am\n\nTeam meeting with product on Friday at 2:30pm\n\nRemind me to update the API docs on June 20th at 9:00am',
        tip: 'It works just like saving a regular note via WhatsApp. Include the day and time in your message and the system will automatically detect and schedule it as a reminder.',
      },
      { title: 'Viewing reminders', body: 'Navigate to "Reminders" in the sidebar to see all upcoming reminders across your projects, sorted by due date.' },
    ],
  },
  {
    id: 'map',
    label: 'Knowledge Map',
    icon: <IconMap />,
    title: 'Knowledge Map',
    description: 'Visualizes connections between notes, projects, and topics as an interactive graph — helping you discover relationships and patterns.',
    items: [
      { title: 'Navigating the map', body: 'Open "Map" from the sidebar. Nodes are notes and projects; edges are connections. Drag to pan, scroll to zoom.' },
      { title: 'Filtering by project', body: 'Use the project filter to focus on a single project\'s knowledge graph.' },
      { title: 'Clicking a node', body: 'Click any note node to open it. The graph highlights connected nodes.', tip: 'Use the map when exploring relationships, not searching for a specific answer.' },
    ],
  },
];

export function HelpPage() {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const current = sections.find((s) => s.id === activeSection)!;
  const currentIdx = sections.findIndex((s) => s.id === activeSection);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const { swipeDirection } = useMobileSwipe({
    enabled: isMobile,
    onNext: () => {
      if (currentIdx < sections.length - 1) setActiveSection(sections[currentIdx + 1].id);
    },
    onPrev: () => {
      if (currentIdx > 0) setActiveSection(sections[currentIdx - 1].id);
    },
  });

  const handleSectionChange = (id: SectionId) => {
    setActiveSection(id);
  };

  return (
    <div className="help-page">
      {isMobile && swipeDirection && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            [swipeDirection === 'left' ? 'right' : 'left']: '20px',
            transform: 'translateY(-50%)',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--surface-hover-accent)',
            border: '1px solid var(--accent-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--active-text)',
            opacity: 0.8,
            pointerEvents: 'none',
            zIndex: 1000,
            transition: 'opacity 150ms ease',
          }}
        >
          {swipeDirection === 'left' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          )}
        </div>
      )}
      {/* ── Sidebar ── */}
      <div className="help-sidebar">
        <div className="help-sidebar-header">
          <span className="help-sidebar-logo-icon"><IconBook /></span>
          <div>
            <strong>Documentation</strong>
            <small>Kote guide</small>
          </div>
        </div>
        <nav className="help-nav" aria-label="Help sections">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`help-nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => handleSectionChange(section.id)}
            >
              <span className="help-nav-icon">{section.icon}</span>
              <span className="help-nav-label">{section.label}</span>
              {activeSection === section.id && (
                <span className="help-nav-arrow"><IconChevronRight /></span>
              )}
            </button>
          ))}
        </nav>
        <div className="help-sidebar-footer">
          <a className="help-external-link" href="https://github.com/pedroaugusto04/Knowledge-Base" target="_blank" rel="noopener noreferrer">
            <IconGithub />
            View on GitHub
          </a>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="help-content">
        <div className="help-content-header">
          <div className="help-section-icon">{current.icon}</div>
          <div>
            <h1 className="help-section-title">{current.title}</h1>
            <p className="help-section-description">{current.description}</p>
          </div>
        </div>

        {/* WhatsApp callout for Reminders section */}
        {current.id === 'reminders' && (
          <div className="help-whatsapp-callout">
            <span className="help-whatsapp-callout-icon"><IconWhatsApp /></span>
            <div className="help-whatsapp-callout-content">
              <strong>Reminders via WhatsApp</strong>
              <p>You can save reminders directly through WhatsApp! Just send a message to the bot including the day and time — it works just like saving a normal note.</p>
            </div>
          </div>
        )}

        <div className="help-doc-list">
          {current.items.map((item, i) => (
            <div key={i} className="help-doc-item">
              <div className="help-doc-item-header">
                <span className="help-doc-index">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="help-doc-title">{item.title}</h3>
              </div>
              <div className="help-doc-body">
                <p className="help-item-body">{item.body}</p>

                {item.steps && (
                  <ol className="help-steps">
                    {item.steps.map((step, si) => (
                      <li key={si}>{step}</li>
                    ))}
                  </ol>
                )}

                {item.code && (
                  <pre className="help-code-block"><code>{item.code}</code></pre>
                )}

                {item.tip && (
                  <div className="help-tip">
                    <IconInfo />
                    <span>
                      {item.tip.split(/(https?:\/\/[^\s]+)/).map((part, i) =>
                        part.match(/^https?:\/\//) ? (
                          <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan)', textDecoration: 'underline' }}>{part}</a>
                        ) : (
                          part
                        )
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="help-footer-nav">
          {currentIdx > 0 && (
            <button type="button" className="help-page-nav-btn" onClick={() => handleSectionChange(sections[currentIdx - 1].id)}>
              <span className="help-page-nav-icon help-page-nav-icon--prev">{sections[currentIdx - 1].icon}</span>
              <div className="help-page-nav-text">
                <small>Previous</small>
                <span>{sections[currentIdx - 1].label}</span>
              </div>
            </button>
          )}
          {currentIdx < sections.length - 1 && (
            <button type="button" className="help-page-nav-btn next" onClick={() => handleSectionChange(sections[currentIdx + 1].id)}>
              <div className="help-page-nav-text">
                <small>Next</small>
                <span>{sections[currentIdx + 1].label}</span>
              </div>
              <span className="help-page-nav-icon">{sections[currentIdx + 1].icon}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
