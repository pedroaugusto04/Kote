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
  reminderAt: string;
  reminderTimeZone: string;
  metadata?: Record<string, unknown>;
};

export function buildConversationIngestPayload(payload: ConversationPayloadInput): IngestPayload {
  return ingestPayloadSchema.parse({
    source: {
      channel: payload.sourceChannel || SourceChannel.External,
      system: payload.sourceSystem || 'external',
      source: '',
      actor: payload.input.senderId,
      conversationId: payload.input.chatId,
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
      reminderAt: payload.reminderAt,
      followUpBy: '',
    },
    metadata: payload.metadata || {},
  });
}
