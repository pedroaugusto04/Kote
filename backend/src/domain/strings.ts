export function slugify(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Slugifies a project name with fallback to 'inbox'
 */
export function slugifyProjectName(value: string): string {
  return slugify(value) || 'inbox';
}

/**
 * Slugifies a workspace name
 */
export function slugifyWorkspaceName(value: string): string {
  return slugify(value);
}

/**
 * Slugifies a tag name
 */
export function slugifyTagName(value: string): string {
  return slugify(value);
}

export function toUrlSlug(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function sanitizeFileStem(value: string, fallback = 'entry'): string {
  const slugified = slugify(value) || fallback;
  // Limit to 100 chars to prevent index row size exceeding PostgreSQL btree limit
  // Path format: 20 Inbox/project/folder/YYYY/MM/YYYYMMDD-HHMMSS-{title}.md
  // Max safe path length ~2700 bytes, title should be ~100 chars to stay safe
  return slugified.length > 100 ? slugified.slice(0, 100) : slugified;
}

export function trimText(value: string, fallback = ''): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

export function collapseWhitespace(value: string): string {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeComparableText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}

export function normalizeMultiline(value: string): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function stripMarkdownFences(value: string): string {
  return String(value || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Robustly extracts a JSON object from text that may contain markdown fences,
 * conversational preamble, or trailing commentary.
 */
export function extractJsonObject<T = Record<string, unknown>>(text: string): T | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // 1. Direct parse after stripping markdown fences
  try {
    const direct = JSON.parse(stripMarkdownFences(trimmed));
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return direct as T;
    }
  } catch {
    // Direct parse failed, proceed to code block extraction
  }

  // 2. Search for ```json ... ``` or ``` ... ``` blocks
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(trimmed)) !== null) {
    const candidate = match[1].trim();
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as T;
      }
    } catch {
      // Code block content was not valid JSON, check next match
    }
  }

  // 3. Search for outermost { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as T;
      }
    } catch {
      // Candidate substring was not valid JSON
    }
  }

  return null;
}

/**
 * Removes any trailing or leaked JSON blocks/objects from a user-facing answer string.
 */
export function cleanAnswerText(value: string): string {
  if (!value || typeof value !== 'string') return '';
  let cleaned = value.trim();

  // Strip trailing markdown code blocks containing json with answer/confidence/sources/replyText/resolvedDraft
  cleaned = cleaned
    .replace(
      /```(?:json)?\s*\{[\s\S]*?(?:"answer"|"confidence"|"sources"|"replyText"|"resolvedDraft")[\s\S]*?\}\s*```\s*$/i,
      '',
    )
    .trim();

  // Strip trailing raw json object containing answer/confidence/sources/replyText/resolvedDraft
  cleaned = cleaned
    .replace(
      /\{[\s\S]*?(?:"answer"|"confidence"|"sources"|"replyText"|"resolvedDraft")[\s\S]*?\}\s*$/i,
      '',
    )
    .trim();

  return cleaned || value.trim();
}

export function getBase64ByteLength(base64: string): number {
  if (!base64) return 0;
  const trimmed = base64.trim();
  const len = trimmed.length;
  if (len === 0) return 0;
  let padding = 0;
  if (trimmed.endsWith('==')) {
    padding = 2;
  } else if (trimmed.endsWith('=')) {
    padding = 1;
  }
  return (len * 3) / 4 - padding;
}

export function calculateAttachmentSize(sizeBytes?: number | null, dataBase64?: string | null): number {
  if (sizeBytes && sizeBytes > 0) {
    return sizeBytes;
  }
  if (dataBase64) {
    return getBase64ByteLength(dataBase64);
  }
  return 0;
}

export function formatDisplayToken(value: string | null | undefined, fallback = 'Not Defined'): string {
  const formatted = String(value || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
  return formatted || fallback;
}

export function displayNameFromSlug(value: string | null | undefined): string {
  return formatDisplayToken(value, '');
}

export const displayNameFromProjectSlug = displayNameFromSlug;

export function extractAppNameFromEmail(emailFrom?: string | null, fallback = 'Kote'): string {
  const raw = String(emailFrom || '');
  const match = raw.match(/^\s*([^<]+)\s*</);
  return match && match[1] ? match[1].trim() : fallback;
}


