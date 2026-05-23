import type { ReactNode } from 'react';

const severityClassNames: Record<string, string> = {
  INFO: 'markdown-severity markdown-severity-info',
  LOW: 'markdown-severity markdown-severity-low',
  MEDIUM: 'markdown-severity markdown-severity-medium',
  HIGH: 'markdown-severity markdown-severity-high',
  CRITICAL: 'markdown-severity markdown-severity-critical',
};

export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="markdown">
      {markdown.split('\n').map((line, index) => {
        if (line.startsWith('# ')) return <h1 key={index}>{renderInlineMarkdown(line.slice(2))}</h1>;
        if (line.startsWith('## ')) return <h2 key={index}>{renderInlineMarkdown(line.slice(3))}</h2>;
        if (line.startsWith('- ')) return <p key={index}>- {renderInlineMarkdown(line.slice(2))}</p>;
        if (!line.trim()) return null;

        return <p key={index}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const tokenPattern = /(\*\*[^*]+\*\*|\[(?:INFO|LOW|MEDIUM|HIGH|CRITICAL)\])/gi;
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const severity = token.slice(1, -1).toUpperCase();
    if (severityClassNames[severity]) {
      parts.push(
        <span className={severityClassNames[severity]} key={`${match.index}-${token}`}>
          {token}
        </span>,
      );
    } else {
      parts.push(<strong key={`${match.index}-${token}`}>{renderInlineMarkdown(token.slice(2, -2))}</strong>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
