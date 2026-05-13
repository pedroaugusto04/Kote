import type { ConversationInput } from '../../contracts/conversation.js';
import {
  CanonicalType,
  EventType,
  Importance,
  KnowledgeKind,
  KnowledgeStatus,
  SourceChannel,
} from '../../contracts/enums.js';
import { ingestPayloadSchema, type IngestPayload } from '../../contracts/ingest.js';
import { buildReminderAt, nowIso } from '../../domain/time.js';

type ConversationPayloadInput = {
  input: ConversationInput;
  sourceChannel?: SourceChannel;
  sourceSystem?: string;
  correlationPrefix: string;
  projectSlug: string;
  rawText: string;
  title?: string;
  media?: ConversationInput['media'];
  kind: KnowledgeKind;
  canonicalType: CanonicalType;
  importance: Importance;
  status?: KnowledgeStatus;
  tags: string[];
  reminderDate: string;
  reminderTime: string;
  reminderTimeZone: string;
  metadata?: Record<string, unknown>;
};

export function buildConversationIngestPayload(payload: ConversationPayloadInput): IngestPayload {
  const reminderAt = buildReminderAt(payload.reminderDate, payload.reminderTime, payload.reminderTimeZone);
  return ingestPayloadSchema.parse({
    source: {
      channel: payload.sourceChannel || SourceChannel.Whatsapp,
      system: payload.sourceSystem || 'evolution-api',
      actor: payload.input.senderId,
      conversationId: payload.input.groupId,
      correlationId: `${payload.correlationPrefix}:${payload.input.messageId || Date.now().toString()}`,
    },
    event: {
      type: EventType.ManualNote,
      occurredAt: nowIso(),
      projectSlug: payload.projectSlug || 'inbox',
    },
    content: {
      rawText: payload.rawText,
      title: payload.title || '',
      attachments: payload.media?.fileName ? [payload.media] : [],
      sections: {
        summary: payload.rawText,
        impact: '',
        risks: [],
        nextSteps: [],
        reviewFindings: [],
      },
    },
    classification: {
      kind: payload.kind,
      canonicalType: payload.canonicalType,
      importance: payload.importance,
      status: payload.status,
      tags: payload.tags,
      decisionFlag: payload.canonicalType === CanonicalType.Decision,
    },
    actions: {
      reminderDate: payload.reminderDate,
      reminderTime: payload.reminderTime,
      reminderAt,
      followUpBy: '',
    },
    metadata: payload.metadata || {},
  });
}
