import { useState, type ReactNode } from 'react';

const severityClassNames: Record<string, string> = {
  INFO: 'markdown-severity markdown-severity-info',
  LOW: 'markdown-severity markdown-severity-low',
  MEDIUM: 'markdown-severity markdown-severity-medium',
  HIGH: 'markdown-severity markdown-severity-high',
  CRITICAL: 'markdown-severity markdown-severity-critical',
};

type Block =
  | { type: 'header1'; text: string }
  | { type: 'header2'; text: string }
  | { type: 'list-item'; text: string }
  | { type: 'code'; code: string; language: string }
  | { type: 'paragraph'; text: string };

function parseMarkdownBlocks(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: Block[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLanguage = '';

  for (const line of lines) {
    const isCodeFence = line.trim().startsWith('```');
    if (isCodeFence) {
      if (inCodeBlock) {
        // End of code block
        blocks.push({
          type: 'code',
          code: codeLines.join('\n'),
          language: codeLanguage,
        });
        codeLines = [];
        codeLanguage = '';
        inCodeBlock = false;
      } else {
        // Start of code block
        inCodeBlock = true;
        codeLanguage = line.trim().slice(3).trim() || 'code';
      }
    } else if (inCodeBlock) {
      codeLines.push(line);
    } else {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      if (line.startsWith('# ')) {
        blocks.push({ type: 'header1', text: line.slice(2) });
      } else if (line.startsWith('## ')) {
        blocks.push({ type: 'header2', text: line.slice(3) });
      } else if (line.startsWith('- ')) {
        blocks.push({ type: 'list-item', text: line.slice(2) });
      } else {
        blocks.push({ type: 'paragraph', text: line });
      }
    }
  }

  // Handle unclosed code blocks
  if (inCodeBlock && codeLines.length > 0) {
    blocks.push({
      type: 'code',
      code: codeLines.join('\n'),
      language: codeLanguage,
    });
  }

  return blocks;
}

function CodeBlockView({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-block-header">
        <span className="markdown-code-block-lang">{language}</span>
        <button className="markdown-code-block-copy" onClick={handleCopy} type="button">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="markdown-code-block-content">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownView({ markdown }: { markdown: string }) {
  const blocks = parseMarkdownBlocks(markdown);

  return (
    <div className="markdown">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'header1':
            return <h1 key={index}>{renderInlineMarkdown(block.text)}</h1>;
          case 'header2':
            return <h2 key={index}>{renderInlineMarkdown(block.text)}</h2>;
          case 'list-item':
            return <p key={index}>- {renderInlineMarkdown(block.text)}</p>;
          case 'code':
            return <CodeBlockView key={index} code={block.code} language={block.language} />;
          case 'paragraph':
          default:
            return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
        }
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
