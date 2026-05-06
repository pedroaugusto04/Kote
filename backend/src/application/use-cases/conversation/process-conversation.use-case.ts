import { Injectable } from '@nestjs/common';

import { type ConversationInput, conversationStateSchema, type ConversationState } from '../../../contracts/conversation.js';
import { CredentialRecordStatus, ConversationConfidence, ConversationPhase, IntegrationProvider, KnowledgeKind, QueryMode } from '../../../contracts/enums.js';
import { slugify } from '../../../domain/strings.js';
import { normalizeDate, normalizeTime, nowIso } from '../../../domain/time.js';
import { ConversationExtractionGateway } from '../../ports/conversation-extraction.port.js';
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
import { ContentQueryRepository, ContentRepository } from '../../ports/content.repository.js';
import { CredentialRepository } from '../../ports/integrations.repository.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/runtime-environment.port.js';
import { ConversationStateRepository } from '../../ports/workflow-state.repository.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';
import { QueryKnowledgeUseCase } from '../query/query-knowledge.use-case.js';

@Injectable()
export class ProcessConversationUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly conversationStates: ConversationStateRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly conversationExtractionGateway: ConversationExtractionGateway,
    private readonly credentials?: CredentialRepository,
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
      environmentProvider: this.environmentProvider,
      conversationExtractionGateway: this.conversationExtractionGateway,
      credentials: this.credentials,
    });
  }
}

type ProcessConversationArgs = {
  input: ConversationInput;
  userId: string;
  workspaceSlug: string;
  contentRepository: ContentRepository;
  contentQueryRepository: ContentQueryRepository;
  conversationStates: ConversationStateRepository;
  ingestEntryUseCase: IngestEntryUseCase;
  environmentProvider: RuntimeEnvironmentProvider;
  conversationExtractionGateway: ConversationExtractionGateway;
  credentials?: CredentialRepository;
};

type ConversationContext = {
  key: string;
  message: string;
  current: ConversationState;
  findProjectSlug: (value: string) => string;
};

async function processConversationInPostgres(args: ProcessConversationArgs) {
  const environment = args.environmentProvider.read();
  const context = await loadConversationContext(args, environment.conversationTimeoutMs);
  const command = context.current.phase === ConversationPhase.Idle ? parseKnowledgeCommand(context.message) : null;

  if (isCancel(context.message)) {
    await args.conversationStates.clear(args.userId, args.workspaceSlug, context.key);
    return { action: 'reply', replyText: 'Conversa cancelada. Envie uma nova nota quando quiser.', payload: null };
  }

  if (command) {
    const result = await new QueryKnowledgeUseCase(args.contentQueryRepository).execute({
      query: command.query,
      mode: QueryMode.Answer,
      workspaceSlug: args.workspaceSlug,
      projectSlug: '',
      limit: 5,
      page: 1,
      pageSize: 10,
    }, args.userId);
    const lines = [
      result.answer.answer,
      '',
      ...result.answer.bullets.slice(0, 4).map((item) => `- ${item}`),
      result.matches.length ? '' : '',
      ...result.matches.slice(0, 4).map((item) => `Fonte: ${item.path}`),
    ].filter(Boolean);
    return { action: 'reply', replyText: lines.join('\n'), payload: null };
  }

  return dispatchConversationPhase(args, context, environment);
}

async function loadConversationContext(args: ProcessConversationArgs, timeoutMs: number): Promise<ConversationContext> {
  const key = conversationKey(args.input);
  const saved = await args.conversationStates.get(args.userId, args.workspaceSlug, key);
  const parsedState = saved ? conversationStateSchema.safeParse(saved.state) : null;
  const current = parsedState?.success && !isExpired(parsedState.data, timeoutMs) ? parsedState.data : { ...emptyConversationState };
  const projects = await args.contentRepository.listProjects(args.userId);
  return {
    key,
    message: args.input.messageText.trim(),
    current,
    findProjectSlug: (value: string) => {
      const normalized = slugify(value);
      return projects.find((project) => project.projectSlug === normalized || project.aliases.includes(normalized))?.projectSlug || normalized;
    },
  };
}

function dispatchConversationPhase(args: ProcessConversationArgs, context: ConversationContext, environment: RuntimeEnvironment) {
  switch (context.current.phase) {
    case ConversationPhase.Idle:
      return handleIdlePhase(args, context, environment);
    case ConversationPhase.AwaitingKind:
      return handleAwaitingKindPhase(args, context);
    case ConversationPhase.AwaitingProject:
      return handleAwaitingProjectPhase(args, context);
    case ConversationPhase.AwaitingReminderDate:
      return handleAwaitingReminderDatePhase(args, context);
    case ConversationPhase.AwaitingReminderTime:
      return handleAwaitingReminderTimePhase(args, context);
    case ConversationPhase.AwaitingConfirmation:
      return handleAwaitingConfirmationPhase(args, context);
    default:
      return Promise.resolve({ action: 'ignore', replyText: '', payload: null });
  }
}

async function handleIdlePhase(args: ProcessConversationArgs, context: ConversationContext, environment: RuntimeEnvironment) {
  const aiExtracted = await resolveAiExtraction(args, context, environment);
  const nextState: ConversationState = {
    ...emptyConversationState,
    rawText: aiExtracted.rawText || context.message,
    projectSlug: aiExtracted.projectSlug ? context.findProjectSlug(aiExtracted.projectSlug) : '',
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
    await persistConversationState(args, context.key, nextState);
    return { action: 'reply', replyText: 'Nao consegui extrair o texto principal. Envie a nota novamente.', payload: null };
  }
  if (hasConfidentStructuredExtraction(args.input, aiExtracted, nextState)) {
    nextState.phase = nextState.reminderDate ? ConversationPhase.AwaitingConfirmation : ConversationPhase.AwaitingReminderDate;
  }
  await persistConversationState(args, context.key, nextState);
  if (!aiExtracted.kind) return { action: 'reply', replyText: `Nova nota recebida:\n"${nextState.rawText}"\n\n${kindPrompt()}`, payload: null };
  if (!nextState.projectSlug) return { action: 'reply', replyText: `Tipo detectado: ${nextState.kind}\n\nQual o projeto? Responda com o slug ou alias. Envie "inbox" para geral.`, payload: null };
  if (!nextState.reminderDate) return { action: 'reply', replyText: 'Deseja agendar um lembrete? Envie a data (DD/MM/AAAA, hoje, amanhã) ou 9 para pular.', payload: null };
  return { action: 'reply', replyText: confirmationPrompt(nextState), payload: null };
}

async function handleAwaitingKindPhase(args: ProcessConversationArgs, context: ConversationContext) {
  const kind = isSkip(context.message) ? context.current.kind : parseKind(context.message);
  if (!kind) return { action: 'reply', replyText: `Nao entendi.\n\n${kindPrompt()}`, payload: null };
  const nextState = {
    ...context.current,
    kind,
    canonicalType: inferInteractiveCanonicalType(kind),
    importance: defaultImportanceForKind(kind),
    phase: ConversationPhase.AwaitingProject,
    updatedAt: nowIso(),
  };
  await persistConversationState(args, context.key, nextState);
  return { action: 'reply', replyText: 'Qual o projeto? Responda com o slug ou alias. Envie "inbox" para geral.', payload: null };
}

async function handleAwaitingProjectPhase(args: ProcessConversationArgs, context: ConversationContext) {
  const project = isSkip(context.message) && context.current.projectSlug
    ? context.current.projectSlug
    : context.message.toLowerCase() === 'inbox'
      ? 'inbox'
      : context.findProjectSlug(context.message);
  if (!project) return { action: 'reply', replyText: 'Projeto invalido. Responda com o slug, alias ou "inbox".', payload: null };
  const nextState = { ...context.current, projectSlug: project, phase: ConversationPhase.AwaitingReminderDate, updatedAt: nowIso() };
  await persistConversationState(args, context.key, nextState);
  return { action: 'reply', replyText: 'Deseja agendar um lembrete? Envie a data (DD/MM/AAAA, hoje, amanhã) ou 9 para pular.', payload: null };
}

async function handleAwaitingReminderDatePhase(args: ProcessConversationArgs, context: ConversationContext) {
  if (isSkip(context.message)) {
    const nextState = { ...context.current, reminderDate: '', reminderTime: '', phase: ConversationPhase.AwaitingConfirmation, updatedAt: nowIso() };
    await persistConversationState(args, context.key, nextState);
    return { action: 'reply', replyText: confirmationPrompt(nextState), payload: null };
  }
  const date = normalizeDate(context.message);
  if (!date) return { action: 'reply', replyText: 'Data invalida. Use DD/MM/AAAA, YYYY-MM-DD, hoje ou amanhã.', payload: null };
  const nextState = { ...context.current, reminderDate: date, phase: ConversationPhase.AwaitingReminderTime, updatedAt: nowIso() };
  await persistConversationState(args, context.key, nextState);
  return { action: 'reply', replyText: `Data: ${date}. Envie o horario HH:mm ou 9 para lembrete sem horario exato.`, payload: null };
}

async function handleAwaitingReminderTimePhase(args: ProcessConversationArgs, context: ConversationContext) {
  if (isSkip(context.message)) {
    const nextState = { ...context.current, reminderTime: '', phase: ConversationPhase.AwaitingConfirmation, updatedAt: nowIso() };
    await persistConversationState(args, context.key, nextState);
    return { action: 'reply', replyText: confirmationPrompt(nextState), payload: null };
  }
  const time = normalizeTime(context.message);
  if (!time) return { action: 'reply', replyText: 'Horario invalido. Use HH:mm.', payload: null };
  const nextState = { ...context.current, reminderTime: time, phase: ConversationPhase.AwaitingConfirmation, updatedAt: nowIso() };
  await persistConversationState(args, context.key, nextState);
  return { action: 'reply', replyText: confirmationPrompt(nextState), payload: null };
}

async function handleAwaitingConfirmationPhase(args: ProcessConversationArgs, context: ConversationContext) {
  if (isSkip(context.message)) {
    await args.conversationStates.clear(args.userId, args.workspaceSlug, context.key);
    return { action: 'reply', replyText: 'Nota descartada.', payload: null };
  }
  if (!isConfirm(context.message)) return { action: 'reply', replyText: confirmationPrompt(context.current), payload: null };
  const payload = buildConversationPayload(args.input, context.current);
  const ingestResult = await args.ingestEntryUseCase.execute(payload, args.userId, args.workspaceSlug);
  await args.conversationStates.clear(args.userId, args.workspaceSlug, context.key);
  return { action: 'submit', replyText: 'Nota ingerida.', payload, ingestResult };
}

async function resolveAiExtraction(
  args: ProcessConversationArgs,
  context: ConversationContext,
  environment: RuntimeEnvironment,
) {
  if (args.input.agentResult?.extracted) return args.input.agentResult.extracted;
  if (!args.credentials) return {};
  const aiCredential = await args.credentials.findCredential(args.userId, args.workspaceSlug, IntegrationProvider.AiConversation);
  const aiEnabled = Boolean(aiCredential && aiCredential.status === CredentialRecordStatus.Connected && !aiCredential.revokedAt);
  if (!aiEnabled) return {};
  const projects = await args.contentRepository.listProjects(args.userId);
  return (await args.conversationExtractionGateway.extract(
    {
      provider: environment.conversationAiProvider,
      baseUrl: environment.conversationAiBaseUrl,
      model: environment.conversationAiModel,
      apiKey: environment.conversationAiApiKey,
    },
    {
      messageText: context.message,
      projectSlugs: projects.map((project) => project.projectSlug),
    },
  )) || {};
}

function hasConfidentStructuredExtraction(
  input: ConversationInput,
  extracted: Record<string, unknown>,
  nextState: ConversationState,
) {
  const extractedKind = typeof extracted.kind === 'string' && extracted.kind.length > 0;
  const extractedProject = typeof extracted.projectSlug === 'string' && extracted.projectSlug.trim().length > 0;
  const extractedReminder = typeof extracted.reminderDate === 'string' && extracted.reminderDate.trim().length > 0;
  const highConfidence = input.agentResult?.confidence === ConversationConfidence.High;
  return (highConfidence || extractedKind || extractedProject || extractedReminder) && nextState.projectSlug.length > 0 && extractedKind;
}

async function persistConversationState(args: ProcessConversationArgs, key: string, state: ConversationState) {
  await args.conversationStates.upsert(args.userId, args.workspaceSlug, key, state);
}

export { processConversationInPostgres };
