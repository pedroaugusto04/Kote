export const NOTE_BODY_SEARCH_TEXT_LIMIT = 100_000;

export function buildNoteBodySearchText(markdown: string, rawTextFallback = ''): string {
  const source = String(markdown || '').trim() || String(rawTextFallback || '').trim();
  if (!source) return '';

  let text = source;
  // Keep fenced-code contents searchable. Removing the whole block made code
  // identifiers invisible to FTS, which is especially harmful for lineage.
  text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, '$1$2');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  if (text.length > NOTE_BODY_SEARCH_TEXT_LIMIT) {
    return text.slice(0, NOTE_BODY_SEARCH_TEXT_LIMIT);
  }
  return text;
}

export function resolveNoteBodySearchText(
  markdown: string | undefined,
  metadata: Record<string, unknown> | undefined,
): string {
  const rawText = metadata && typeof metadata.rawText === 'string' ? metadata.rawText : '';
  return buildNoteBodySearchText(String(markdown || ''), rawText);
}
