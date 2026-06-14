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
          'n8n',
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


