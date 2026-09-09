import { AI_SESSION_SYNTHESIS_PROCESSING } from '../../constants/ai-session-synthesis.constants.js';
import type { NoteSynthesisItem } from '../../models/note-synthesis.models.js';

export type AiSessionTurn = { role: 'user' | 'assistant'; text: string; number: number };

export function parseAiSessionTurns(markdown: string): AiSessionTurn[] {
  const turns: AiSessionTurn[] = [];
  let current: AiSessionTurn | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^###\s+(?:👤\s*)?(User|Assistant|✨\s*Assistant)\s*$/i);
    if (match) {
      if (current?.text.trim()) turns.push({ ...current, text: current.text.trim() });
      current = { role: /user/i.test(match[1]) ? 'user' : 'assistant', text: '', number: turns.length + 1 };
    } else if (current) {
      current.text += `${line}\n`;
    }
  }
  if (current?.text.trim()) turns.push({ ...current, text: current.text.trim() });
  return turns;
}

export function isDeterministicSynthesis(turns: AiSessionTurn[], markdown: string): boolean {
  return turns.length === 2
    && turns[0].role === 'user'
    && turns[1].role === 'assistant'
    && markdown.length <= AI_SESSION_SYNTHESIS_PROCESSING.deterministicMaxTranscriptChars;
}

export function buildDeterministicSynthesis(turns: AiSessionTurn[]): { overview: string; memory: NoteSynthesisItem[] } {
  const excerpt = AI_SESSION_SYNTHESIS_PROCESSING.deterministicExcerptChars;
  return {
    overview: turns[1].text.slice(0, excerpt),
    memory: [
      { kind: 'goal', text: turns[0].text.slice(0, excerpt), status: 'current', turnRefs: [1] },
      { kind: 'outcome', text: turns[1].text.slice(0, excerpt), status: 'current', turnRefs: [2] },
    ],
  };
}

export function buildSynthesisTranscript(turns: AiSessionTurn[]): string {
  return turns.map((turn) => `TURN ${turn.number} [${turn.role.toUpperCase()}]\n${turn.text}`).join('\n\n');
}

export function detectSynthesisLanguage(text: string): string {
  const portuguese = (text.match(/\b(o|a|de|que|para|com|não|uma|um|está)\b/gi) || []).length;
  const english = (text.match(/\b(the|and|for|with|not|this|that|is|are)\b/gi) || []).length;
  return portuguese > english ? 'pt-BR' : 'en';
}
