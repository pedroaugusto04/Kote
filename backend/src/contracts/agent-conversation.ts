import { z } from 'zod';

import { CanonicalType, ConversationConfidence, Importance, KnowledgeKind } from './enums.js';

const agentApprovalSchema = z.enum(['none', 'folder_create', 'final_confirmation']);
const agentActionSchema = z.enum(['ask', 'confirm', 'create_and_confirm', 'cancel', 'submit']);
const agentApprovalIntentSchema = z.enum(['none', 'approve', 'reject', 'cancel', 'unclear']);
const nullishToUndefined = (value: unknown) => value == null ? undefined : value;
const defaultStringSchema = z.preprocess(nullishToUndefined, z.string().default(''));
const defaultStringArraySchema = z.preprocess(nullishToUndefined, z.array(defaultStringSchema).default([]));
const defaultKnowledgeKindSchema = z.preprocess(nullishToUndefined, z.nativeEnum(KnowledgeKind).default(KnowledgeKind.Note));
const defaultCanonicalTypeSchema = z.preprocess(nullishToUndefined, z.nativeEnum(CanonicalType).default(CanonicalType.Event));
const defaultImportanceSchema = z.preprocess(nullishToUndefined, z.nativeEnum(Importance).default(Importance.Low));
const defaultApprovalSchema = z.preprocess(nullishToUndefined, agentApprovalSchema.default('none'));
const defaultActionSchema = z.preprocess(nullishToUndefined, agentActionSchema.default('ask'));
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
  folderApproved: z.preprocess(nullishToUndefined, z.boolean().default(false)),
});

export const agentConversationStateSchema = z.object({
  draft: agentConversationDraftSchema.default({}),
  project: agentConversationProjectDecisionSchema.default({}),
  folder: agentConversationFolderDecisionSchema.default({}),
  pendingApproval: defaultApprovalSchema,
  lastQuestion: defaultStringSchema,
  lastUserMessage: defaultStringSchema,
  lastAgentAction: defaultActionSchema,
  confidence: defaultConfidenceSchema,
  updatedAt: defaultStringSchema,
});

export const conversationAgentDecisionSchema = z.object({
  replyText: defaultStringSchema,
  resolvedDraft: agentConversationDraftSchema.default({}),
  selectedProjectSlug: defaultStringSchema,
  selectedFolderId: defaultStringSchema,
  suggestedFolderPath: defaultStringArraySchema,
  placeInRoot: z.preprocess(nullishToUndefined, z.boolean().default(false)),
  pendingApproval: defaultApprovalSchema,
  approvalIntent: z.preprocess(nullishToUndefined, agentApprovalIntentSchema.default('none')),
  confidence: defaultConfidenceSchema,
  action: defaultActionSchema,
});

export type AgentConversationApproval = z.infer<typeof agentApprovalSchema>;
export type AgentConversationAction = z.infer<typeof agentActionSchema>;
export type AgentConversationApprovalIntent = z.infer<typeof agentApprovalIntentSchema>;
export type AgentConversationDraft = z.infer<typeof agentConversationDraftSchema>;
export type AgentConversationState = z.infer<typeof agentConversationStateSchema>;
export type ConversationAgentDecision = z.infer<typeof conversationAgentDecisionSchema>;
