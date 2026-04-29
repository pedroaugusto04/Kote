import { z } from 'zod';

import { CanonicalType, ConversationConfidence, ConversationMissingField, ConversationPhase, Importance, KnowledgeKind } from './enums.js';

export const conversationInputSchema = z.object({
  messageText: z.string().default(''),
  senderId: z.string().min(1),
  groupId: z.string().min(1),
  messageId: z.string().default(''),
  hasMedia: z.boolean().default(false),
  media: z
    .object({
      fileName: z.string().default(''),
      mimeType: z.string().default('application/octet-stream'),
      sizeBytes: z.number().int().nonnegative().default(0),
      dataBase64: z.string().default(''),
    })
    .default({}),
  agentResult: z
    .object({
      extracted: z
        .object({
          rawText: z.string().optional(),
          projectSlug: z.string().optional(),
          kind: z.nativeEnum(KnowledgeKind).optional(),
          canonicalType: z.nativeEnum(CanonicalType).optional(),
          importance: z.nativeEnum(Importance).optional(),
          tags: z.array(z.string()).optional(),
          reminderDate: z.string().optional(),
          reminderTime: z.string().optional(),
        })
        .default({}),
      missingFields: z.array(z.nativeEnum(ConversationMissingField)).default([]),
      nextQuestion: z.string().optional(),
      confidence: z.nativeEnum(ConversationConfidence).default(ConversationConfidence.Low),
    })
    .optional(),
});

export type ConversationInput = z.infer<typeof conversationInputSchema>;

export const conversationStateSchema = z.object({
  phase: z.nativeEnum(ConversationPhase),
  rawText: z.string().default(''),
  projectSlug: z.string().default(''),
  kind: z.nativeEnum(KnowledgeKind).default(KnowledgeKind.Note),
  canonicalType: z.nativeEnum(CanonicalType).default(CanonicalType.Event),
  importance: z.nativeEnum(Importance).default(Importance.Low),
  tags: z.array(z.string()).default([]),
  reminderDate: z.string().default(''),
  reminderTime: z.string().default(''),
  media: z
    .object({
      fileName: z.string().default(''),
      mimeType: z.string().default('application/octet-stream'),
      sizeBytes: z.number().int().nonnegative().default(0),
      dataBase64: z.string().default(''),
    })
    .default({}),
  updatedAt: z.string().default(''),
});

export type ConversationState = z.infer<typeof conversationStateSchema>;
