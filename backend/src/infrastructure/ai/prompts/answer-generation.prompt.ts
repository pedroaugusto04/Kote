import { z } from 'zod';

import type { AnswerContextChunk, AnswerGenerationResponse } from '../../../application/ports/query/answer-generation.gateway.js';
import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import { ConversationConfidence } from '../../../contracts/enums.js';

export const answerGenerationResponseSchema = z.object({
  answer: z.string().trim().default(''),
  confidence: z.nativeEnum(ConversationConfidence).default(ConversationConfidence.Medium),
  requestedAttachments: z.boolean().default(false),
  requestedAttachmentPattern: z.string().optional(),
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
    'The conversationHistory contains recent questions and answers for context. Use it to understand references (like pronouns "it", "they", "that project") in the user\'s current question.',
    'Decide whether the user is explicitly asking you to send or return attached files from the cited notes, and set requestedAttachments accordingly.',
    'Cite the sources you used to construct your answer in the sources array. Every cited source must have a noteId matching one of the provided context chunks.',
    'Assess your confidence in the answer based on how well the context covers the question (high, medium, or low).',
    'Return strict JSON only. Do not wrap the response in markdown or use markdown code blocks.',
    'Set requestedAttachments to true only when the user is asking to receive the actual file or attachment, not when they only want information about it.',
    'When requestedAttachments is true, compose a very brief and friendly message in the answer field, stating that you are sending the requested files/attachments for them (since the actual files will be appended by the system, you do not need to provide their text content).',
    'If the user is requesting a specific file or type of file (e.g. "summary", "data science summary pdf", "contract"), set requestedAttachmentPattern to a short lowercase search term or extension that filters the attachment name. Leave it empty/undefined if they ask to receive all attachments or if they only want information.',
    'Use this JSON shape: {"answer": "your markdown formatted answer", "confidence": "high|medium|low", "requestedAttachments": false, "requestedAttachmentPattern": "...", "sources": [{"noteId": "...", "title": "...", "path": "..."}]}',
  ].join('\n');
}

export function buildAnswerGenerationPrompt(payload: {
  question: string;
  context: AnswerContextChunk[];
  conversationHistory?: AskConversationTurn[];
}) {
  return JSON.stringify({
    question: payload.question,
    conversationHistory: payload.conversationHistory?.map((turn) => ({
      question: turn.question,
      answer: turn.answer,
    })),
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
    requestedAttachments: parsed.requestedAttachments,
    requestedAttachmentPattern: parsed.requestedAttachmentPattern,
    sources: filteredSources,
  };
}
