import { z } from 'zod';

import { conversationInputSchema } from '../../../contracts/conversation.js';
import { ReminderDispatchMode } from '../../../contracts/enums.js';
import { ingestPayloadSchema } from '../../../contracts/ingest.js';

export const ingestBodySchema = ingestPayloadSchema;
export const agentConversationBodySchema = conversationInputSchema;

export const workspaceQuerySchema = z.object({
  workspaceSlug: z.string().trim().default('default'),
}).transform((query) => ({
  workspaceSlug: query.workspaceSlug || 'default',
}));

export const reminderDispatchQuerySchema = z.object({
  workspaceSlug: z.string().trim().default('default'),
  mode: z.string().default(ReminderDispatchMode.Daily),
}).transform((query) => ({
  workspaceSlug: query.workspaceSlug || 'default',
  mode: query.mode === ReminderDispatchMode.Exact ? ReminderDispatchMode.Exact : ReminderDispatchMode.Daily,
}));

export type IngestBody = z.infer<typeof ingestBodySchema>;
export type AgentConversationBody = z.infer<typeof agentConversationBodySchema>;
export type WorkspaceQuery = z.infer<typeof workspaceQuerySchema>;
export type ReminderDispatchQuery = z.infer<typeof reminderDispatchQuerySchema>;
