/**
 * AI Credit Cost Definitions
 *
 * This is the SINGLE SOURCE OF TRUTH for credit costs per AI operation type.
 * Adjust values here to recalibrate economics without touching use-case or service logic.
 *
 * Credit rationale (approximate relative costs):
 *  - GitHub code review: highest cost, processes large diffs + generates structured analysis
 *  - Project brief:      high cost, aggregates many notes + generates structured document
 *  - Ask knowledge:      medium cost, semantic search + LLM generation with context chunks
 *  - Note review:        medium cost, single note LLM processing
 *  - Agent conversation: lower per-turn, but accumulates across multi-turn dialogues
 *  - Audio transcription: cheapest, simple transcription without generation
 *
 * Keys must match the VALUES of the AiOperationType enum in plans.enums.ts.
 */

export const AI_CREDIT_COSTS: Record<string, number> = {
  /** Semantic knowledge query via web UI or webhook (/ask). */
  ask_knowledge: 4,

  /** Single agent conversation turn (WPP / Telegram). */
  agent_conversation_turn: 2,

  /** Full GitHub push review with AI analysis. */
  github_code_review: 8,

  /** Audio transcription before processing (WPP voice notes). */
  audio_transcription: 2,

  /** Project brief generation from recent notes context. */
  project_brief: 6,

  /** AI review of a single note. */
  note_review: 2,
};

//Plan credit limits (max AI credits per month)
export const PLAN_AI_CREDIT_LIMITS = {
  FREE: 100,
  PRO: 2_000,
  ENTERPRISE: 20_000,
} as const;
