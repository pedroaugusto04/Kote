import { z } from 'zod';

import type { AnswerContextChunk, AnswerGenerationResponse } from '../../../application/ports/answer-generation.gateway.js';

export const answerGenerationResponseSchema = z.object({
  answer: z.string().trim().default(''),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  sources: z.array(
    z.object({
      noteId: z.string().trim(),
      title: z.string().trim().default(''),
      path: z.string().trim().default(''),
    }),
  ).default([]),
});

export function buildAnswerGenerationSystemPrompt() {
  return [
    'You are a helpful knowledge base assistant.',
    'Answer the user\'s question ONLY using the provided context chunks. Do not use external knowledge or invent facts.',
    'The answer must be in the same language as the user\'s question.',
    'Cite the sources you used to construct your answer in the sources array. Every cited source must have a noteId matching one of the provided context chunks.',
    'Assess your confidence in the answer based on how well the context covers the question (high, medium, or low).',
    'Return strict JSON only. Do not wrap the response in markdown or use markdown code blocks.',
    'Use this JSON shape: {"answer": "your markdown formatted answer", "confidence": "high|medium|low", "sources": [{"noteId": "...", "title": "...", "path": "..."}]}',
  ].join('\n');
}

export function buildAnswerGenerationPrompt(payload: {
  question: string;
  context: AnswerContextChunk[];
}) {
  return JSON.stringify({
    question: payload.question,
    context: payload.context.map((c) => ({
      noteId: c.noteId,
      title: c.title,
      path: c.path,
      text: c.chunkText,
    })),
  });
}

export function parseAnswerGenerationResponse(
  input: unknown,
  context: AnswerContextChunk[],
): AnswerGenerationResponse {
  const parsed = answerGenerationResponseSchema.parse(input);
  const contextNoteIds = new Set(context.map((c) => c.noteId));
  const noteMap = new Map(context.map((c) => [c.noteId, { title: c.title, path: c.path }]));

  // Ensure we only return sources that actually exist in the context
  const filteredSources = parsed.sources
    .filter((s) => contextNoteIds.has(s.noteId))
    .map((s) => {
      const original = noteMap.get(s.noteId);
      return {
        noteId: s.noteId,
        title: original?.title || s.title || '',
        path: original?.path || s.path || '',
      };
    });

  return {
    answer: parsed.answer,
    confidence: parsed.confidence,
    sources: filteredSources,
  };
}
