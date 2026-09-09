import { z } from 'zod';
import type { NoteSynthesisItem } from '../../../application/models/note-synthesis.models.js';

const itemSchema = z.object({
  kind: z.enum(['goal','outcome','decision','change','failed_attempt','open_item','fact']),
  text: z.string().trim().min(1).max(1000),
  status: z.enum(['current','historical','rejected','superseded','unknown']).default('unknown'),
  turnRefs: z.array(z.number().int().min(1)).max(12).default([]),
  files: z.array(z.string().trim().min(1).max(180)).max(10).default([]),
  entities: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
});
const resultSchema = z.object({ overview: z.string().trim().min(1).max(2000), memory: z.array(itemSchema).max(40) });

export function buildAiSessionSynthesisSystemPrompt() {
  return `You synthesize an AI coding session into durable project memory. Return ONLY valid JSON with keys overview and memory. The overview is a concise factual summary. memory contains explicit goals, outcomes, decisions, changes, failed attempts, open items, and facts. Never invent information, never expose chain-of-thought, and mark uncertainty as unknown. Preserve rejected or superseded alternatives with their status. turnRefs refer to the numbered transcript turns. Write in the dominant language of the transcript.`;
}

export function buildAiSessionSynthesisPrompt(transcript: string, language: string) {
  return JSON.stringify({ language, transcript });
}

export function parseAiSessionSynthesis(value: unknown): { overview: string; memory: NoteSynthesisItem[] } {
  const parsed = resultSchema.parse(value);
  return { overview: parsed.overview, memory: parsed.memory };
}
