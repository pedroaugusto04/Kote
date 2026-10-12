import type { ConversationInput } from '../../../contracts/conversation.js';
import {
  CanonicalType,
  EventType,
  Importance,
  KnowledgeKind,
  KnowledgeStatus,
  SourceChannel,
} from '../../../contracts/enums.js';
import type { IngestPayload } from '../../../contracts/ingest.js';
import { buildIngestPayload } from '../../mappers/ingest.mapper.js';
import { nowIso } from '../../../domain/time.js';

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
  return buildIngestPayload({
    source: {
      channel: payload.sourceChannel || SourceChannel.External,
      system: payload.sourceSystem || 'external',
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
    },
    metadata: payload.metadata || {},
  });
}
