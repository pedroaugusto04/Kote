import { useState } from 'react';
import './HelpPage.css';

type SectionId = 'overview' | 'projects' | 'ai-chat' | 'integrations' | 'cli' | 'vscode' | 'reminders' | 'map';

interface HelpItem {
  title: string;
  body: string;
  code?: string;
  tip?: string;
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

const sections: HelpSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: <IconBook />,
    title: 'What is Knowledge Vault?',
    description: 'Knowledge Vault centralizes your team\'s operational knowledge — decisions, routines, and context — in one searchable, AI-queryable place.',
    items: [
      { title: 'Zero context loss', body: 'Every decision, routine, and exception is recorded. New team members get up to speed in minutes, not weeks.' },
      { title: 'Invisible capture', body: 'Knowledge flows in where work happens: WhatsApp audio messages, Telegram alerts, GitHub pushes, VS Code, and the CLI.' },
      { title: 'AI-powered retrieval', body: 'Ask questions in natural language. The AI answers from your actual project data, not generic internet knowledge.' },
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
    description: 'The Ask AI page is a chat interface grounded in your knowledge base. Ask questions, filter by project, and get answers with source citations.',
    items: [
      { title: 'Asking a question', body: 'Navigate to "Ask AI" in the sidebar. Type any question about your projects, past decisions, or technical context.' },
      { title: 'Filtering by project', body: 'Use the project filter at the top to scope responses to a specific project. This improves precision.' },
      { title: 'Conversation history', body: 'Sessions are saved as notes in your knowledge base and can be re-opened from the AI history panel.' },
      { title: 'WhatsApp /ask command', body: 'Once WhatsApp is connected, send "/ask <question>" to the Knowledge Vault bot to get AI answers in chat.', code: '/ask what was decided about the auth architecture last week?' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: <IconPlug />,
    title: 'Integrations',
    description: 'Connect your existing tools so knowledge is captured where work happens — without switching context.',
    items: [
      { title: 'WhatsApp', body: 'Send audio or text to the Knowledge Vault bot. Audio is transcribed and structured into notes. Use /ask to search directly from the chat.', tip: 'Go to Settings → Integrations → WhatsApp and follow the QR code pairing flow.' },
      { title: 'Telegram', body: 'Receive pipeline failure alerts, code review summaries, and GitHub push notifications in Telegram.', tip: 'Go to Settings → Integrations → Telegram and paste your bot token.' },
      { title: 'GitHub Push', body: 'On every push, the system analyzes commits and diffs with AI, stores summaries, and sends WhatsApp alerts for relevant issues.', code: '# Add webhook in your GitHub repo settings:\n# URL: https://your-app.com/api/github/webhook\n# Content type: application/json\n# Events: Push' },
    ],
  },
  {
    id: 'cli',
    label: 'CLI Tool',
    icon: <IconTerminal />,
    title: 'CLI Tool (kb)',
    description: 'The kb CLI syncs local files, directories, and AI session histories directly to your knowledge base from the terminal.',
    items: [
      { title: 'Installation', body: 'Install the CLI globally via npm and initialize it with your API token.', code: 'npm install -g @pedroaugusto04/kb-cli\nkb init' },
      { title: 'Syncing AI sessions', body: 'Sync AI assistant sessions (Claude Code, Codex, Antigravity, OpenCode) to your knowledge base.', code: 'kb sync-ai' },
      { title: 'Syncing files and directories', body: 'Send individual files or entire directories to the knowledge base.', code: 'kb sync --file ./README.md\nkb sync --dir ./docs' },
      { title: 'Finding your API token', body: 'Go to Profile → API Tokens in the app to generate a personal access token. Use it when running kb init.', tip: 'Never commit tokens to version control.' },
    ],
  },
  {
    id: 'vscode',
    label: 'VS Code',
    icon: <IconCode />,
    title: 'VS Code Extension',
    description: 'The Knowledge Vault VS Code extension brings the knowledge base into your editor — save code, ask questions, and import AI sessions without leaving VS Code.',
    items: [
      { title: 'Installation', body: 'Open VS Code → Extensions → Search "Knowledge Vault" → Install.', tip: 'After installing, run "Knowledge Vault: Sign In" from the Command Palette.' },
      { title: 'Saving code snippets', body: 'Select any code → Right-click → "Save to Knowledge Vault". The snippet is stored as a note with file path and language metadata.' },
      { title: 'Quick AI questions', body: 'Use the sidebar chat or Command Palette to ask questions about your knowledge base without switching tabs.' },
      { title: 'Importing AI sessions', body: 'The extension detects AI assistant sessions in your workspace and lets you import them with one click from the sidebar.' },
    ],
  },
  {
    id: 'reminders',
    label: 'Reminders',
    icon: <IconBell />,
    title: 'Reminders',
    description: 'Attach reminders to notes so important decisions, reviews, or follow-ups surface at the right time — delivered via WhatsApp.',
    items: [
      { title: 'Setting a reminder', body: 'When creating or editing a note, set a reminder date and time. The system will send a WhatsApp message with the note content at that time.', tip: 'WhatsApp must be connected for reminder delivery to work.' },
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

  return (
    <div className="help-page">
      {/* ── Sidebar ── */}
      <div className="help-sidebar">
        <div className="help-sidebar-header">
          <span className="help-sidebar-logo-icon"><IconBook /></span>
          <div>
            <strong>Documentation</strong>
            <small>Knowledge Vault guide</small>
          </div>
        </div>
        <nav className="help-nav" aria-label="Help sections">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`help-nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
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

        <div className="help-cards">
          {current.items.map((item, i) => (
            <div key={i} className="help-card">
              <h3 className="help-card-title">{item.title}</h3>
              <p className="help-card-body">{item.body}</p>
              {item.code && (
                <pre className="help-code-block"><code>{item.code}</code></pre>
              )}
              {item.tip && (
                <div className="help-tip">
                  <IconInfo />
                  <span>{item.tip}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="help-footer-nav">
          {currentIdx > 0 && (
            <button type="button" className="help-page-nav-btn" onClick={() => setActiveSection(sections[currentIdx - 1].id)}>
              <span className="help-page-nav-icon help-page-nav-icon--prev">{sections[currentIdx - 1].icon}</span>
              <div className="help-page-nav-text">
                <small>Previous</small>
                <span>{sections[currentIdx - 1].label}</span>
              </div>
            </button>
          )}
          {currentIdx < sections.length - 1 && (
            <button type="button" className="help-page-nav-btn next" onClick={() => setActiveSection(sections[currentIdx + 1].id)}>
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
