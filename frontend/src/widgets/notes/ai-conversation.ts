export type AiConversationTurn = { role: 'user' | 'assistant'; content: string };

/**
 * Parses the markdown content of an AI-synced note into a list of typed turns.
 *
 * The CLI sync command (`sync-ai`) emits each turn as:
 *   ### 👤 User
 *   {content}
 *
 *   ### 🤖 Assistant
 *   {content}
 *
 * Returns an empty array when the pattern is not present so callers can fall
 * back to the regular MarkdownView without any special-casing.
 */
export function parseAiConversationTurns(markdown: string): AiConversationTurn[] {
  if (!markdown) return [];
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!/^### (?:👤 User|🤖 Assistant)\s*$/m.test(normalized)) return [];

  const turns: AiConversationTurn[] = [];
  let currentRole: 'user' | 'assistant' | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentRole && currentLines.some((l) => l.trim())) {
      turns.push({ role: currentRole, content: currentLines.join('\n').trim() });
    }
  };

  for (const line of normalized.split('\n')) {
    if (/^### 👤 User\s*$/.test(line)) {
      flush();
      currentRole = 'user';
      currentLines = [];
    } else if (/^### 🤖 Assistant\s*$/.test(line)) {
      flush();
      currentRole = 'assistant';
      currentLines = [];
    } else if (currentRole !== null) {
      currentLines.push(line);
    }
  }

  flush();
  return turns;
}
