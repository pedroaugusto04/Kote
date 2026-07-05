import { useState, type ReactNode, Children, createContext, useContext, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import Prism from 'prismjs';
import DOMPurify from 'dompurify';
import 'prismjs/themes/prism-tomorrow.css';

// Lazy load PrismJS language components to reduce initial bundle size
let prismLanguagesLoaded = false;
const loadPrismLanguages = async () => {
  if (typeof window === 'undefined' || prismLanguagesLoaded) return;
  await Promise.all([
    // @ts-ignore - PrismJS language components are untyped
    import('prismjs/components/prism-typescript.js'),
    // @ts-ignore - PrismJS language components are untyped
    import('prismjs/components/prism-javascript.js'),
    // @ts-ignore - PrismJS language components are untyped
    import('prismjs/components/prism-python.js'),
    // @ts-ignore - PrismJS language components are untyped
    import('prismjs/components/prism-css.js'),
    // @ts-ignore - PrismJS language components are untyped
    import('prismjs/components/prism-json.js'),
    // @ts-ignore - PrismJS language components are untyped
    import('prismjs/components/prism-bash.js'),
  ]);
  prismLanguagesLoaded = true;
};

const severityClassNames: Record<string, string> = {
  INFO: 'markdown-severity markdown-severity-info',
  LOW: 'markdown-severity markdown-severity-low',
  MEDIUM: 'markdown-severity markdown-severity-medium',
  HIGH: 'markdown-severity markdown-severity-high',
  CRITICAL: 'markdown-severity markdown-severity-critical',
};

const PreContext = createContext(false);

function processTextWithBadges(child: ReactNode): ReactNode {
  if (typeof child !== 'string') return child;

  const parts: ReactNode[] = [];
  const tokenPattern = /(\[(?:INFO|LOW|MEDIUM|HIGH|CRITICAL)\])/gi;
  let lastIndex = 0;

  for (const match of child.matchAll(tokenPattern)) {
    if (match.index > lastIndex) {
      parts.push(child.slice(lastIndex, match.index));
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
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < child.length) {
    parts.push(child.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : child;
}

function processChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    return processTextWithBadges(child);
  });
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

  const highlightedHtml = useMemo(() => {
    const cleanLanguage = language.toLowerCase();
    const grammar = Prism.languages[cleanLanguage] || Prism.languages.clike || Prism.languages.markup;
    const lang = Prism.languages[cleanLanguage] ? cleanLanguage : 'markup';
    const rawHtml = Prism.highlight(code, grammar, lang);
    return DOMPurify.sanitize(rawHtml);
  }, [code, language]);

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-block-header">
        <span className="markdown-code-block-lang">{language}</span>
        <button className="markdown-code-block-copy" onClick={handleCopy} type="button">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className={`markdown-code-block-content language-${language}`}>
        <code
          className={`language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
}

export function MarkdownView({ markdown }: { markdown: string }) {
  // Load Prism languages on mount to reduce initial bundle size
  useEffect(() => {
    loadPrismLanguages();
  }, []);

  return (
    <div className="markdown">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p>{processChildren(children)}</p>,
          li: ({ children }) => <li>{processChildren(children)}</li>,
          h1: ({ children }) => <h1>{processChildren(children)}</h1>,
          h2: ({ children }) => <h2>{processChildren(children)}</h2>,
          h3: ({ children }) => <h3>{processChildren(children)}</h3>,
          h4: ({ children }) => <h4>{processChildren(children)}</h4>,
          strong: ({ children }) => <strong>{processChildren(children)}</strong>,
          pre: ({ children }) => (
            <PreContext.Provider value={true}>
              {children}
            </PreContext.Provider>
          ),
          code({
            children,
            className,
            node,
            ...rest
          }: React.ComponentPropsWithoutRef<'code'> & { node?: unknown }) {
            const isInsidePre = useContext(PreContext);
            const match = /language-(\w+)/.exec(className || '');
            
            if (isInsidePre) {
              return (
                <CodeBlockView
                  code={String(children).replace(/\n$/, '')}
                  language={match ? match[1] : 'code'}
                />
              );
            }

            return (
              <code {...rest} className={className}>
                {children}
              </code>
            );
          }
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
