import { AI_SESSION_SYNTHESIS_PROCESSING } from '../../constants/ai-session-synthesis.constants.js';
import crypto from 'node:crypto';
import type { NoteSynthesisItem } from '../../models/note-synthesis.models.js';

export type AiSessionTurn = { role: 'user' | 'assistant'; text: string; number: number };

export type SynthesisRetrievalChunk = { chunkText: string; sourceRefs: number[] };

const SYNTHESIS_RETRIEVAL_CHUNK_MAX_CHARS = 2_400;

export function getAiSessionSourceHash(markdown: string | null | undefined): string {
  return crypto.createHash('sha256').update(markdown || '').digest('hex');
}

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

export function formatSynthesisForRetrieval(overview: string, memory: NoteSynthesisItem[]): string {
  const items = memory.map(formatSynthesisMemoryItem);
  return [`Session overview: ${overview.trim()}`, ...items].filter(Boolean).join("\n");
}

/**
 * Builds compact retrieval units without losing the relationship between a
 * memory item and the transcript turns that support it.
 */
export function buildSynthesisRetrievalChunks(overview: string, memory: NoteSynthesisItem[]): SynthesisRetrievalChunk[] {
  const units = [
    overview.trim() ? { text: `Session overview: ${overview.trim()}`, refs: memory.flatMap((item) => item.turnRefs || []) } : null,
    ...memory.map((item) => ({
      text: formatSynthesisMemoryItem(item),
      refs: item.turnRefs || [],
    })),
  ].filter((unit): unit is { text: string; refs: number[] } => Boolean(unit?.text));

  const chunks: SynthesisRetrievalChunk[] = [];
  let text = '';
  let refs: number[] = [];
  for (const unit of units) {
    const candidate = text ? `${text}\n${unit.text}` : unit.text;
    if (text && candidate.length > SYNTHESIS_RETRIEVAL_CHUNK_MAX_CHARS) {
      chunks.push({ chunkText: text, sourceRefs: [...new Set(refs)] });
      text = unit.text;
      refs = [...unit.refs];
    } else {
      text = candidate;
      refs.push(...unit.refs);
    }
  }
  if (text) chunks.push({ chunkText: text, sourceRefs: [...new Set(refs)] });
  return chunks;
}

function formatSynthesisMemoryItem(item: NoteSynthesisItem): string {
  const kind = item.kind.replace(/_/g, ' ');
  const details = [
    item.files?.length ? `Files: ${item.files.join(', ')}` : '',
    item.entities?.length ? `Entities: ${item.entities.join(', ')}` : '',
  ].filter(Boolean).join(' | ');
  return `${kind} [${item.status}]: ${item.text}${details ? ` | ${details}` : ''}`;
}

export function buildSynthesisTranscript(turns: AiSessionTurn[]): string {
  return turns.map((turn) => `TURN ${turn.number} [${turn.role.toUpperCase()}]\n${turn.text}`).join('\n\n');
}

