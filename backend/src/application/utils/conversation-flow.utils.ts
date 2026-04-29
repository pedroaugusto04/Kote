import type { ConversationInput, ConversationState } from '../../contracts/conversation.js';
import {
  CanonicalType,
  ConversationPhase,
  EventType,
  Importance,
  KnowledgeKind,
  KnowledgeStatus,
  SourceChannel,
} from '../../contracts/enums.js';
import { ingestPayloadSchema, type IngestPayload } from '../../contracts/ingest.js';
import { slugify } from '../../domain/strings.js';
import { buildReminderAt, nowIso } from '../../domain/time.js';

export const emptyConversationState: ConversationState = {
  phase: ConversationPhase.Idle,
  rawText: '',
  projectSlug: '',
  kind: KnowledgeKind.Note,
  canonicalType: CanonicalType.Event,
  importance: Importance.Low,
  tags: [],
  reminderDate: '',
  reminderTime: '',
  media: {
    fileName: '',
    mimeType: 'application/octet-stream',
    sizeBytes: 0,
    dataBase64: '',
  },
  updatedAt: '',
};

export function conversationKey(input: ConversationInput): string {
  return `${input.groupId}:${input.senderId}`;
}

export function isExpired(state: ConversationState, timeoutMs: number): boolean {
  if (!state.updatedAt || state.phase === ConversationPhase.Idle) return false;
  return Date.now() - new Date(state.updatedAt).getTime() > timeoutMs;
}

export function isCancel(text: string): boolean {
  return ['cancelar', 'cancel', 'cancela', 'sair', '0'].includes(text.toLowerCase().trim());
}

export function isConfirm(text: string): boolean {
  return ['sim', 's', 'confirmar', '1', 'ok', 'enviar'].includes(text.toLowerCase().trim());
}

export function isSkip(text: string): boolean {
  return ['pular', 'skip', 'nao', 'não', 'n', '9', 'sem'].includes(text.toLowerCase().trim());
}

export function parseKnowledgeCommand(text: string): { query: string } | null {
  const commandMatch = String(text || '').trim().match(/^\/(buscar|consultar|perguntar|ask)\s+(.+)$/i);
  const query = String(commandMatch?.[2] || '').trim();
  return query ? { query } : null;
}

export function parseKind(text: string): ConversationState['kind'] | '' {
  const normalized = text.trim().toLowerCase();
  if (normalized === '1' || normalized === 'note' || normalized === 'nota') return KnowledgeKind.Note;
  if (normalized === '2' || normalized === 'bug') return KnowledgeKind.Bug;
  if (normalized === '3' || normalized === 'summary' || normalized === 'resumo') return KnowledgeKind.Summary;
  if (normalized === '4' || normalized === 'article' || normalized === 'artigo') return KnowledgeKind.Article;
  if (normalized === '5' || normalized === 'daily') return KnowledgeKind.Daily;
  return '';
}

export function kindPrompt(): string {
  return [
    'Qual o tipo da nota?',
    '1. Nota geral',
    '2. Bug / incidente',
    '3. Resumo',
    '4. Artigo / documentacao',
    '5. Daily',
    '9. Pular',
    '0. Cancelar',
  ].join('\n');
}

export function confirmationPrompt(state: ConversationState): string {
  return [
    'Resumo da nota:',
    `Texto: ${state.rawText}`,
    `Tipo: ${state.kind}`,
    `Projeto: ${state.projectSlug || 'inbox'}`,
    `Lembrete: ${state.reminderDate ? `${state.reminderDate}${state.reminderTime ? ` ${state.reminderTime}` : ''}` : 'sem lembrete'}`,
    state.tags.length ? `Tags: ${state.tags.join(', ')}` : '',
    '',
    '1. Confirmar',
    '9. Descartar',
    '0. Cancelar',
  ]
    .filter(Boolean)
    .join('\n');
}

export function inferInteractiveCanonicalType(kind: ConversationState['kind']): ConversationState['canonicalType'] {
  if (kind === KnowledgeKind.Bug) return CanonicalType.Incident;
  if (kind === KnowledgeKind.Summary || kind === KnowledgeKind.Article) return CanonicalType.Knowledge;
  return CanonicalType.Event;
}

export function defaultImportanceForKind(kind: ConversationState['kind']): ConversationState['importance'] {
  if (kind === KnowledgeKind.Bug) return Importance.High;
  if (kind === KnowledgeKind.Summary || kind === KnowledgeKind.Article) return Importance.Medium;
  return Importance.Low;
}

export function normalizeConversationTags(tags: unknown): string[] {
  return Array.isArray(tags) ? tags.map((item) => slugify(item)).filter(Boolean) : [];
}

export function buildConversationPayload(input: ConversationInput, state: ConversationState): IngestPayload {
  return ingestPayloadSchema.parse({
    schemaVersion: 1,
    source: {
      channel: SourceChannel.Whatsapp,
      system: 'evolution-api',
      actor: input.senderId,
      conversationId: input.groupId,
      correlationId: `wpp:${input.messageId || Date.now().toString()}`,
    },
    event: {
      type: EventType.ManualNote,
      occurredAt: nowIso(),
      projectSlug: state.projectSlug || 'inbox',
    },
    content: {
      rawText: state.rawText,
      title: '',
      attachments: state.media.fileName ? [state.media] : [],
      sections: {
        summary: state.rawText,
        impact: '',
        risks: [],
        nextSteps: [],
        reviewFindings: [],
      },
    },
    classification: {
      kind: state.kind,
      canonicalType: state.canonicalType,
      importance: state.importance,
      status: state.canonicalType === CanonicalType.Event ? KnowledgeStatus.Active : KnowledgeStatus.Open,
      tags: state.tags,
      decisionFlag: state.canonicalType === CanonicalType.Decision,
    },
    actions: {
      reminderDate: state.reminderDate,
      reminderTime: state.reminderTime,
      followUpBy: '',
    },
    metadata: {
      reminderAt: buildReminderAt(state.reminderDate, state.reminderTime),
    },
  });
}
