import { z } from 'zod';

const defaultStringSchema = z.preprocess((v) => (v == null ? undefined : v), z.string().default(''));

export const askConversationTurnSchema = z.object({
  question: defaultStringSchema,
  answer: defaultStringSchema,
  projectSlug: defaultStringSchema,
  timestamp: defaultStringSchema,
});

export const askConversationStateSchema = z.object({
  turns: z.array(askConversationTurnSchema).default([]),
  updatedAt: defaultStringSchema,
});

export type AskConversationTurn = z.infer<typeof askConversationTurnSchema>;
export type AskConversationState = z.infer<typeof askConversationStateSchema>;

export const ASK_CONVERSATION_MAX_TURNS = 5;
export const ASK_CONVERSATION_TTL_MS = 15 * 60 * 1000;

export function emptyAskConversationState(): AskConversationState {
  return askConversationStateSchema.parse({});
}

export function pushAskTurn(
  state: AskConversationState,
  turn: AskConversationTurn,
): AskConversationState {
  const turns = [...state.turns, turn].slice(-ASK_CONVERSATION_MAX_TURNS);
  return askConversationStateSchema.parse({
    turns,
    updatedAt: new Date().toISOString(),
  });
}

export function isAskStateExpired(state: AskConversationState): boolean {
  const updatedAt = Date.parse(state.updatedAt || '');
  if (!Number.isFinite(updatedAt)) return false;
  return Date.now() - updatedAt > ASK_CONVERSATION_TTL_MS;
}
