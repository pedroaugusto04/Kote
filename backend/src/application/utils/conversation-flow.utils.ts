import type { ConversationInput, ConversationState } from '../../contracts/conversation.js';
import {
  CanonicalType,
  ConversationPhase,
  Importance,
  KnowledgeKind,
} from '../../contracts/enums.js';
import type { IngestPayload } from '../../contracts/ingest.js';
import { defaultStatus } from '../../domain/classification.js';
import { slugify } from '../../domain/strings.js';
import { buildConversationIngestPayload } from './conversation-payload.utils.js';

export { isCancel, isConfirm, isSkip } from './conversation-command.utils.js';

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

export function projectPrompt(projects: Array<{ projectSlug: string; displayName: string; aliases: string[] }>): string {
  const lines = [
    'Qual o projeto? Responda com o slug ou alias. Envie "inbox" para geral.',
    '',
    'Projetos do workspace:',
    '0. inbox',
    ...projects.map((project, index) => {
      const aliases = project.aliases.length ? ` (aliases: ${project.aliases.join(', ')})` : '';
      return `${index + 1}. ${project.projectSlug} - ${project.displayName}${aliases}`;
    }),
  ];
  return lines.join('\n');
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

export function normalizeConversationTags(tags: unknown): string[] {
  return Array.isArray(tags) ? tags.map((item) => slugify(item)).filter(Boolean) : [];
}

export function buildConversationPayload(input: ConversationInput, state: ConversationState, reminderTimeZone = 'America/Sao_Paulo'): IngestPayload {
  return buildConversationIngestPayload({
    input,
    correlationPrefix: 'wpp',
    projectSlug: state.projectSlug || 'inbox',
    rawText: state.rawText,
    media: state.media,
    kind: state.kind,
    canonicalType: state.canonicalType,
    importance: state.importance,
    status: defaultStatus(state.canonicalType),
    tags: state.tags,
    reminderDate: state.reminderDate,
    reminderTime: state.reminderTime,
    reminderTimeZone,
  });
}
