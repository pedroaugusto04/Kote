import { z } from 'zod';

import { AgentConversationAction as AgentConversationActionEnum, CanonicalType, ConversationConfidence, Importance, KnowledgeKind } from './enums.js';
import { conversationMediaSchema } from './conversation.js';

const agentActionSchema = z.nativeEnum(AgentConversationActionEnum);
const nullishToUndefined = (value: unknown) => value == null ? undefined : value;
const blankishToUndefined = (value: unknown) => {
  if (value == null) return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return value;
};
const defaultStringSchema = z.preprocess(nullishToUndefined, z.string().default(''));
const defaultStringArraySchema = z.preprocess(nullishToUndefined, z.array(defaultStringSchema).default([]));
const defaultKnowledgeKindSchema = z.preprocess(nullishToUndefined, z.nativeEnum(KnowledgeKind).default(KnowledgeKind.Note));
const defaultCanonicalTypeSchema = z.preprocess(nullishToUndefined, z.nativeEnum(CanonicalType).default(CanonicalType.Event));
const defaultImportanceSchema = z.preprocess(nullishToUndefined, z.nativeEnum(Importance).default(Importance.Low));
const defaultActionSchema = z.preprocess(blankishToUndefined, agentActionSchema.default(AgentConversationActionEnum.Ask));
const defaultConfidenceSchema = z.preprocess(nullishToUndefined, z.nativeEnum(ConversationConfidence).default(ConversationConfidence.Low));

export const agentConversationDraftSchema = z.object({
  rawText: defaultStringSchema,
  title: defaultStringSchema,
  kind: defaultKnowledgeKindSchema,
  canonicalType: defaultCanonicalTypeSchema,
  importance: defaultImportanceSchema,
  tags: defaultStringArraySchema,
  reminderDate: defaultStringSchema,
  reminderTime: defaultStringSchema,
});

export const agentConversationProjectDecisionSchema = z.object({
  selectedProjectSlug: defaultStringSchema,
});

export const agentConversationFolderDecisionSchema = z.object({
  selectedFolderId: defaultStringSchema,
  suggestedFolderPath: defaultStringArraySchema,
  placeInRoot: z.preprocess(nullishToUndefined, z.boolean().default(false)),
});

export const agentConversationTurnSchema = z.object({
  userMessage: defaultStringSchema,
  agentReply: defaultStringSchema,
  action: defaultActionSchema,
});

export const agentConversationStateSchema = z.object({
  draft: agentConversationDraftSchema.default({}),
  media: conversationMediaSchema.default({}),
  project: agentConversationProjectDecisionSchema.default({}),
  folder: agentConversationFolderDecisionSchema.default({}),
  lastQuestion: defaultStringSchema,
  lastUserMessage: defaultStringSchema,
  lastAgentAction: defaultActionSchema,
  confidence: defaultConfidenceSchema,
  turns: z.array(agentConversationTurnSchema).default([]),
  updatedAt: defaultStringSchema,
});

export const conversationAgentDecisionSchema = z.object({
  replyText: defaultStringSchema,
  resolvedDraft: agentConversationDraftSchema.default({}),
  selectedProjectSlug: defaultStringSchema,
  selectedFolderId: defaultStringSchema,
  suggestedFolderPath: defaultStringArraySchema,
  placeInRoot: z.preprocess(nullishToUndefined, z.boolean().default(false)),
  confidence: defaultConfidenceSchema,
  action: defaultActionSchema,
});

export type AgentConversationAction = AgentConversationActionEnum;
export type AgentConversationDraft = z.infer<typeof agentConversationDraftSchema>;
export type AgentConversationState = z.infer<typeof agentConversationStateSchema>;
export type ConversationAgentDecision = z.infer<typeof conversationAgentDecisionSchema>;

export { normalizeConversationAgentDecisionInput } from './agent-conversation-normalizer.js';
