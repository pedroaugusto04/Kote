import { CanonicalType, ConversationConfidence, Importance, KnowledgeKind } from './enums.js';

const approvalValues = new Set(['none', 'final_confirmation']);
const approvalIntentValues = new Set(['none', 'approve', 'reject', 'cancel', 'unclear']);
const turnIntentValues = new Set(['modify_current', 'new_capture', 'unrelated', 'unclear']);
const actionValues = new Set(['ask', 'confirm', 'cancel', 'submit']);
const canonicalTypeValues = new Set(Object.values(CanonicalType));
const confidenceValues = new Set(Object.values(ConversationConfidence));
const importanceValues = new Set(Object.values(Importance));
const knowledgeKindValues = new Set(Object.values(KnowledgeKind));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function enumValueOrUndefined<T extends string>(value: unknown, allowedValues: ReadonlySet<T>): T | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return allowedValues.has(trimmed as T) ? trimmed as T : undefined;
}

function hasReminderDate(value: unknown) {
  return typeof value === 'string' && Boolean(value.trim());
}

function normalizeDraft(input: unknown) {
  if (!isRecord(input)) return input;

  const draft = { ...input };
  const kind = draft.kind === 'reminder'
    ? KnowledgeKind.Note
    : enumValueOrUndefined(draft.kind, knowledgeKindValues);
  draft.kind = kind;

  const canonicalType = enumValueOrUndefined(draft.canonicalType, canonicalTypeValues);
  if (hasReminderDate(draft.reminderDate) && (!canonicalType || canonicalType === CanonicalType.Event)) {
    draft.canonicalType = CanonicalType.Followup;
  } else {
    draft.canonicalType = canonicalType;
  }

  draft.importance = enumValueOrUndefined(draft.importance, importanceValues);
  return draft;
}

export function normalizeConversationAgentDecisionInput(input: unknown): unknown {
  if (!isRecord(input)) return input;

  return {
    ...input,
    resolvedDraft: normalizeDraft(input.resolvedDraft),
    pendingApproval: enumValueOrUndefined(input.pendingApproval, approvalValues),
    approvalIntent: enumValueOrUndefined(input.approvalIntent, approvalIntentValues),
    turnIntent: enumValueOrUndefined(input.turnIntent, turnIntentValues),
    confidence: enumValueOrUndefined(input.confidence, confidenceValues),
    action: enumValueOrUndefined(input.action, actionValues),
  };
}
