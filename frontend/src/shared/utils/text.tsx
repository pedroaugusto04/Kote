import React from 'react';

export function normalizeComparableText(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}

export function sameText(left: string, right: string): boolean {
  return normalizeComparableText(left) === normalizeComparableText(right);
}

export function stripSourceHeader(rawText: string): string {
  if (!rawText) return rawText;
  const lines = rawText.split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex !== -1) {
    const firstLine = lines[firstContentIndex].trim();
    if (firstLine.toLowerCase().startsWith('source:')) {
      if (!rawText.includes('\n')) {
        const withoutPrefix = firstLine.substring(7).trim();
        const providers = [
          'antigravity',
          'claude code',
          'claude',
          'open code',
          'open-code',
          'opencode',
          'codex',
          'ai-chat',
          'whatsapp',
          'evolution',
          'github',
          'api',
          'manual',
        ];
        for (const provider of providers) {
          if (withoutPrefix.toLowerCase().startsWith(provider)) {
            return withoutPrefix.substring(provider.length).replace(/^[.,\s:-]+/, '').trim();
          }
        }
        return withoutPrefix.replace(/^[^\s]+/, '').replace(/^[.,\s:-]+/, '').trim();
      }

      const remaining = [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)];
      while (remaining.length > 0 && remaining[0].trim() === '') {
        remaining.shift();
      }
      return remaining.join('\n');
    }
  }
  return rawText;
}

export function makeTitleClickable(title: string): { text: string; url?: string } {
  if (!title) return { text: title };
  // Match URLs at the end of the title (pattern: " - https://..." or " - http://...")
  const urlPattern = / - (https?:\/\/[^\s]+)$/;
  const match = title.match(urlPattern);
  if (match) {
    const url = match[1];
    const text = title.substring(0, match.index);
    return { text, url };
  }
  return { text: title };
}

const SEVERITY_CLASS_NAMES: Record<string, string> = {
  INFO: 'markdown-severity markdown-severity-info',
  LOW: 'markdown-severity markdown-severity-low',
  MEDIUM: 'markdown-severity markdown-severity-medium',
  HIGH: 'markdown-severity markdown-severity-high',
  CRITICAL: 'markdown-severity markdown-severity-critical',
};

export function processTextWithBadges(child: React.ReactNode): React.ReactNode {
  if (typeof child !== 'string') return child;

  const parts: React.ReactNode[] = [];
  const tokenPattern = /(\[(?:INFO|LOW|MEDIUM|HIGH|CRITICAL)\])/gi;
  let lastIndex = 0;

  for (const match of child.matchAll(tokenPattern)) {
    if (match.index > lastIndex) {
      parts.push(child.slice(lastIndex, match.index));
    }

    const token = match[0];
    const severity = token.slice(1, -1).toUpperCase();
    if (SEVERITY_CLASS_NAMES[severity]) {
      parts.push(
        <span className={SEVERITY_CLASS_NAMES[severity]} key={`${match.index}-${token}`}>
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

export function processTextWithLinks(child: React.ReactNode): React.ReactNode {
  if (typeof child !== 'string') return child;

  const parts: React.ReactNode[] = [];
  const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  let lastIndex = 0;

  for (const match of child.matchAll(urlPattern)) {
    if (match.index > lastIndex) {
      parts.push(child.slice(lastIndex, match.index));
    }

    const url = match[0];
    parts.push(
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="auto-link"
        key={`${match.index}-${url}`}
      >
        {url}
      </a>,
    );

    lastIndex = match.index + url.length;
  }

  if (lastIndex < child.length) {
    parts.push(child.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : child;
}

export function convertUrlsToLinks(markdown: string): string {
  // Convert URLs in plain text to markdown format
  const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  let result = markdown;
  let match;
  const matches: Array<{ match: string; index: number }> = [];

  // First, collect all matches with their indices
  while ((match = urlPattern.exec(markdown)) !== null) {
    matches.push({ match: match[0], index: match.index });
  }

  // Process matches in reverse order to avoid index shifting
  for (let i = matches.length - 1; i >= 0; i--) {
    const { match: url, index } = matches[i];
    const precedingChar = markdown[index - 1];
    const followingChar = markdown[index + url.length];

    // Skip if already in markdown link format [text](url)
    if (precedingChar === '(' && followingChar === ')') {
      continue;
    }

    // Replace with markdown link format
    result = result.slice(0, index) + `[${url}](${url})` + result.slice(index + url.length);
  }

  return result;
}
