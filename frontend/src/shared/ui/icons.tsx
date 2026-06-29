export function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M11.9 1.6a1.5 1.5 0 0 1 2.1 2.1l-7.7 7.7-3.3.9.9-3.3z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.8 3.7l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M2.8 4.2h10.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.2 2.7h3.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4.1 4.2l.6 8.1h6.6l.6-8.1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function ResolveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 8.1l1.7 1.7 3.4-3.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
    </svg>
  );
}

export function ArchiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M2.7 4.1h10.6v7.2a1 1 0 0 1-1 1H3.7a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
      <path d="M2.3 3h11.4v2.3H2.3z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
      <path d="M6 7.6h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={className} style={{ width: '1em', height: '1em' }}>
      <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 10l4.5 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function GitHubIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export function WhatsAppIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <img
      className={className}
      style={style}
      src="https://cdn.simpleicons.org/whatsapp/25D366"
      alt="WhatsApp"
      width="24"
      height="24"
    />
  );
}

export function TelegramIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4 20-7z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function MessagesIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function SparklesIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5 5 3Z" />
      <path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" />
    </svg>
  );
}

export function UserIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function ApiIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

export function InfoIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function VscodeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <img
      className={className}
      style={style}
      src="/kote/vscode-logo.svg"
      alt="VS Code"
      width="24"
      height="24"
    />
  );
}

export function CliIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

export function SourceIcon({ source, className, style }: { source?: string | null; className?: string; style?: React.CSSProperties }) {
  if (!source) return null;
  const normalized = source.toLowerCase().trim();
  if (normalized === 'kote') {
    return <SparklesIcon className={className} style={style} />;
  }
  if (normalized.includes('whatsapp') || normalized.includes('evolution')) {
    return <WhatsAppIcon className={className} style={style} />;
  }
  if (normalized.includes('github')) {
    return <GitHubIcon className={className} style={style} />;
  }
  if (normalized.includes('n8n') || normalized.includes('api')) {
    return <ApiIcon className={className} style={style} />;
  }
  if (
    normalized === 'ide' ||
    normalized.includes('vscode')
  ) {
    return <VscodeIcon className={className} style={style} />;
  }
  if (
    normalized === 'cli' ||
    normalized.includes('kote-cli')
  ) {
    return <CliIcon className={className} style={style} />;
  }
  if (
    normalized === 'ai-chat' ||
    normalized.includes('antigravity') ||
    normalized.includes('codex') ||
    normalized.includes('claude') ||
    normalized.includes('open-code') ||
    normalized.includes('opencode')
  ) {
    return <SparklesIcon className={className} style={style} />;
  }
  return <UserIcon className={className} style={style} />;
}
