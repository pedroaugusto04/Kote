import { Injectable } from '@nestjs/common';

import { extractConversationFields } from '../../../adapters/ai.js';
import { readEnvironment } from '../../../adapters/environment.js';
import { type ConversationInput, conversationStateSchema, type ConversationState } from '../../../contracts/conversation.js';
import { ConversationConfidence, ConversationPhase, KnowledgeKind, QueryMode } from '../../../contracts/enums.js';
import { slugify } from '../../../domain/strings.js';
import { normalizeDate, normalizeTime, nowIso } from '../../../domain/time.js';
import {
  buildConversationPayload,
  confirmationPrompt,
  conversationKey,
  defaultImportanceForKind,
  emptyConversationState,
  inferInteractiveCanonicalType,
  isCancel,
  isConfirm,
  isExpired,
  isSkip,
  kindPrompt,
  normalizeConversationTags,
  parseKind,
  parseKnowledgeCommand,
} from '../../utils/conversation-flow.utils.js';
import { ContentQueryRepository, ContentRepository, ConversationStateRepository } from '../../ports/repositories.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';
import { QueryKnowledgeUseCase } from '../query/query-knowledge.use-case.js';

@Injectable()
export class ProcessConversationUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly conversationStates: ConversationStateRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
  ) {}

  async execute(input: ConversationInput, userId: string, workspaceSlug = 'default') {
    return processConversationInPostgres({
      input,
      userId,
      workspaceSlug: slugify(workspaceSlug) || 'default',
      contentRepository: this.contentRepository,
      contentQueryRepository: this.contentQueryRepository,
      conversationStates: this.conversationStates,
      ingestEntryUseCase: this.ingestEntryUseCase,
    });
  }
}

async function processConversationInPostgres(args: {
  input: ConversationInput;
  userId: string;
  workspaceSlug: string;
  contentRepository: ContentRepository;
  contentQueryRepository: ContentQueryRepository;
  conversationStates: ConversationStateRepository;
  ingestEntryUseCase: IngestEntryUseCase;
}) {
  const environment = readEnvironment();
  if (environment.allowedGroupId && args.input.groupId !== environment.allowedGroupId) {
    return { action: 'ignore', replyText: '', payload: null };
  }

  const key = conversationKey(args.input);
  const saved = await args.conversationStates.get(args.userId, args.workspaceSlug, key);
  const parsedState = saved ? conversationStateSchema.safeParse(saved.state) : null;
  const current = parsedState?.success && !isExpired(parsedState.data, environment.conversationTimeoutMs) ? parsedState.data : { ...emptyConversationState };
  const message = args.input.messageText.trim();
  const command = current.phase === ConversationPhase.Idle ? parseKnowledgeCommand(message) : null;

  if (isCancel(message)) {
    await args.conversationStates.clear(args.userId, args.workspaceSlug, key);
    return { action: 'reply', replyText: 'Conversa cancelada. Envie uma nova nota quando quiser.', payload: null };
  }

  const projects = await args.contentRepository.listProjects(args.userId);
  const findProjectSlug = (value: string) => {
    const normalized = slugify(value);
    return projects.find((project) => project.projectSlug === normalized || project.aliases.includes(normalized))?.projectSlug || normalized;
  };

  if (command) {
    const result = await new QueryKnowledgeUseCase(args.contentQueryRepository).execute({ query: command.query, mode: QueryMode.Answer, workspaceSlug: args.workspaceSlug, projectSlug: '', limit: 5 }, args.userId);
    const lines = [
      result.answer.answer,
      '',
      ...result.answer.bullets.slice(0, 4).map((item) => `- ${item}`),
      result.answer.citedPaths.length ? '' : '',
      ...result.answer.citedPaths.slice(0, 4).map((item) => `Fonte: ${item}`),
    ].filter(Boolean);
    return { action: 'reply', replyText: lines.join('\n'), payload: null };
  }

  if (current.phase === ConversationPhase.Idle) {
    const aiExtracted =
      args.input.agentResult?.extracted ||
      (await extractConversationFields(
        {
          provider: environment.conversationAiProvider,
          baseUrl: environment.conversationAiBaseUrl,
          model: environment.conversationAiModel,
          apiKey: environment.conversationAiApiKey,
        },
        {
          messageText: message,
          projectSlugs: projects.map((project) => project.projectSlug),
        },
      )) ||
      {};
    const nextState: ConversationState = {
      ...emptyConversationState,
      rawText: aiExtracted.rawText || message,
      projectSlug: aiExtracted.projectSlug ? findProjectSlug(aiExtracted.projectSlug) : '',
      kind: aiExtracted.kind || KnowledgeKind.Note,
      canonicalType: aiExtracted.canonicalType || inferInteractiveCanonicalType(aiExtracted.kind || KnowledgeKind.Note),
      importance: aiExtracted.importance || defaultImportanceForKind(aiExtracted.kind || KnowledgeKind.Note),
      tags: normalizeConversationTags(aiExtracted.tags),
      reminderDate: normalizeDate(aiExtracted.reminderDate || ''),
      reminderTime: normalizeTime(aiExtracted.reminderTime || ''),
      media: args.input.hasMedia ? args.input.media : emptyConversationState.media,
      updatedAt: nowIso(),
      phase: ConversationPhase.AwaitingKind,
    };
    if (!nextState.rawText) {
      await args.conversationStates.upsert(args.userId, args.workspaceSlug, key, nextState);
      return { action: 'reply', replyText: 'Nao consegui extrair o texto principal. Envie a nota novamente.', payload: null };
    }
    if ((args.input.agentResult?.confidence === ConversationConfidence.High || Object.keys(aiExtracted).length > 0) && nextState.projectSlug && aiExtracted.kind) {
      nextState.phase = nextState.reminderDate ? ConversationPhase.AwaitingConfirmation : ConversationPhase.AwaitingReminderDate;
    }
    await args.conversationStates.upsert(args.userId, args.workspaceSlug, key, nextState);
    if (!aiExtracted.kind) return { action: 'reply', replyText: `Nova nota recebida:\n"${nextState.rawText}"\n\n${kindPrompt()}`, payload: null };
    if (!nextState.projectSlug) return { action: 'reply', replyText: `Tipo detectado: ${nextState.kind}\n\nQual o projeto? Responda com o slug ou alias. Envie "inbox" para geral.`, payload: null };
    if (!nextState.reminderDate) return { action: 'reply', replyText: 'Deseja agendar um lembrete? Envie a data (DD/MM/AAAA, hoje, amanhã) ou 9 para pular.', payload: null };
    return { action: 'reply', replyText: confirmationPrompt(nextState), payload: null };
  }

  if (current.phase === ConversationPhase.AwaitingKind) {
    const kind = isSkip(message) ? current.kind : parseKind(message);
    if (!kind) return { action: 'reply', replyText: `Nao entendi.\n\n${kindPrompt()}`, payload: null };
    const nextState = { ...current, kind, canonicalType: inferInteractiveCanonicalType(kind), importance: defaultImportanceForKind(kind), phase: ConversationPhase.AwaitingProject, updatedAt: nowIso() };
    await args.conversationStates.upsert(args.userId, args.workspaceSlug, key, nextState);
    return { action: 'reply', replyText: 'Qual o projeto? Responda com o slug ou alias. Envie "inbox" para geral.', payload: null };
  }

  if (current.phase === ConversationPhase.AwaitingProject) {
    const project = isSkip(message) && current.projectSlug ? current.projectSlug : message.toLowerCase().trim() === 'inbox' ? 'inbox' : findProjectSlug(message);
    if (!project) return { action: 'reply', replyText: 'Projeto invalido. Responda com o slug, alias ou "inbox".', payload: null };
    const nextState = { ...current, projectSlug: project, phase: ConversationPhase.AwaitingReminderDate, updatedAt: nowIso() };
    await args.conversationStates.upsert(args.userId, args.workspaceSlug, key, nextState);
    return { action: 'reply', replyText: 'Deseja agendar um lembrete? Envie a data (DD/MM/AAAA, hoje, amanhã) ou 9 para pular.', payload: null };
  }

  if (current.phase === ConversationPhase.AwaitingReminderDate) {
    if (isSkip(message)) {
      const nextState = { ...current, reminderDate: '', reminderTime: '', phase: ConversationPhase.AwaitingConfirmation, updatedAt: nowIso() };
      await args.conversationStates.upsert(args.userId, args.workspaceSlug, key, nextState);
      return { action: 'reply', replyText: confirmationPrompt(nextState), payload: null };
    }
    const date = normalizeDate(message);
    if (!date) return { action: 'reply', replyText: 'Data invalida. Use DD/MM/AAAA, YYYY-MM-DD, hoje ou amanhã.', payload: null };
    const nextState = { ...current, reminderDate: date, phase: ConversationPhase.AwaitingReminderTime, updatedAt: nowIso() };
    await args.conversationStates.upsert(args.userId, args.workspaceSlug, key, nextState);
    return { action: 'reply', replyText: `Data: ${date}. Envie o horario HH:mm ou 9 para lembrete sem horario exato.`, payload: null };
  }

  if (current.phase === ConversationPhase.AwaitingReminderTime) {
    if (isSkip(message)) {
      const nextState = { ...current, reminderTime: '', phase: ConversationPhase.AwaitingConfirmation, updatedAt: nowIso() };
      await args.conversationStates.upsert(args.userId, args.workspaceSlug, key, nextState);
      return { action: 'reply', replyText: confirmationPrompt(nextState), payload: null };
    }
    const time = normalizeTime(message);
    if (!time) return { action: 'reply', replyText: 'Horario invalido. Use HH:mm.', payload: null };
    const nextState = { ...current, reminderTime: time, phase: ConversationPhase.AwaitingConfirmation, updatedAt: nowIso() };
    await args.conversationStates.upsert(args.userId, args.workspaceSlug, key, nextState);
    return { action: 'reply', replyText: confirmationPrompt(nextState), payload: null };
  }

  if (current.phase === ConversationPhase.AwaitingConfirmation) {
    if (isSkip(message)) {
      await args.conversationStates.clear(args.userId, args.workspaceSlug, key);
      return { action: 'reply', replyText: 'Nota descartada.', payload: null };
    }
    if (!isConfirm(message)) return { action: 'reply', replyText: confirmationPrompt(current), payload: null };
    const payload = buildConversationPayload(args.input, current);
    const ingestResult = await args.ingestEntryUseCase.execute(payload, args.userId, args.workspaceSlug);
    await args.conversationStates.clear(args.userId, args.workspaceSlug, key);
    return { action: 'submit', replyText: 'Nota ingerida.', payload, ingestResult };
  }

  return { action: 'ignore', replyText: '', payload: null };
}

export { processConversationInPostgres };
