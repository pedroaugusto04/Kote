import { z } from 'zod';

import { slugify } from '../domain/strings.js';
import { buildReminderAt, normalizeDate, normalizeTime } from '../domain/time.js';
import { CanonicalType, EventType, Importance, KnowledgeKind, KnowledgeStatus, ReviewFindingSeverity, SourceChannel } from './enums.js';

export const sourceChannelSchema = z.nativeEnum(SourceChannel);
export const eventTypeSchema = z.nativeEnum(EventType);
export const kindSchema = z.nativeEnum(KnowledgeKind);
export const canonicalTypeSchema = z.nativeEnum(CanonicalType);
export const importanceSchema = z.nativeEnum(Importance);
export const statusSchema = z.nativeEnum(KnowledgeStatus);

const reviewFindingSchema = z.object({
  severity: z.nativeEnum(ReviewFindingSeverity).default(ReviewFindingSeverity.Medium),
  file: z.string().default(''),
  summary: z.string().min(1),
  recommendation: z.string().default(''),
});

const attachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().default('application/octet-stream'),
  sizeBytes: z.number().int().nonnegative().default(0),
  dataBase64: z.string().default(''),
});

export const ingestPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.object({
      channel: sourceChannelSchema,
      system: z.string().min(1),
      actor: z.string().default(''),
      conversationId: z.string().default(''),
      correlationId: z.string().min(1),
    }),
    event: z.object({
      type: eventTypeSchema,
      occurredAt: z.string().datetime().or(z.string().min(1)),
      projectSlug: z.string().min(1),
    }),
    content: z.object({
      rawText: z.string().min(1),
      title: z.string().default(''),
      attachments: z.array(attachmentSchema).default([]),
      sections: z
        .object({
          summary: z.string().default(''),
          impact: z.string().default(''),
          risks: z.array(z.string()).default([]),
          nextSteps: z.array(z.string()).default([]),
          reviewFindings: z.array(reviewFindingSchema).default([]),
        })
        .default({}),
    }),
    classification: z.object({
      kind: kindSchema,
      canonicalType: canonicalTypeSchema,
      importance: importanceSchema,
      status: statusSchema.optional(),
      tags: z.array(z.string()).default([]),
      decisionFlag: z.boolean().default(false),
    }),
    actions: z
      .object({
        reminderDate: z.string().default(''),
        reminderTime: z.string().default(''),
        followUpBy: z.string().default(''),
      })
      .default({}),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .transform((payload) => ({
    ...payload,
    event: {
      ...payload.event,
      projectSlug: slugify(payload.event.projectSlug) || 'inbox',
    },
    classification: {
      ...payload.classification,
      tags: [...new Set(payload.classification.tags.map((tag) => slugify(tag)).filter(Boolean))],
    },
    actions: {
      ...payload.actions,
      reminderDate: normalizeDate(payload.actions.reminderDate || ''),
      reminderTime: normalizeTime(payload.actions.reminderTime || ''),
      followUpBy: normalizeDate(payload.actions.followUpBy || ''),
    },
  }))
  .superRefine((payload, ctx) => {
    if (payload.actions.reminderTime && !payload.actions.reminderDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actions', 'reminderTime'],
        message: 'Reminder time requires reminder date.',
      });
    }
  });

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

export function withDerivedReminderAt(payload: IngestPayload): IngestPayload & { actions: IngestPayload['actions'] & { reminderAt: string } } {
  return {
    ...payload,
    actions: {
      ...payload.actions,
      reminderAt: buildReminderAt(payload.actions.reminderDate || '', payload.actions.reminderTime || ''),
    },
  };
}
