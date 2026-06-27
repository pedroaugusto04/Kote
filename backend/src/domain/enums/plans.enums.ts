export enum SubscriptionPlan {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export const FREE_PLAN_ID = '00000000-0000-0000-0000-000000000001';


export enum QuotaResourceType {
  STORAGE = 'storage',
  /** AI credits — amount varies per operation (see ai-credits.constants.ts) */
  AI_REQUEST = 'ai_request',
  WORKSPACE = 'workspace',
  PROJECT = 'project',
}

/**
 * AI operation types used as the `description` tag on quota usage events.
 * Values mirror the keys of AI_CREDIT_COSTS in domain/constants/ai-credits.constants.ts.
 */
export enum AiOperationType {
  ASK_KNOWLEDGE = 'ask_knowledge',
  AGENT_CONVERSATION_TURN = 'agent_conversation_turn',
  GITHUB_CODE_REVIEW = 'github_code_review',
  AUDIO_TRANSCRIPTION = 'audio_transcription',
  PROJECT_BRIEF = 'project_brief',
  NOTE_REVIEW = 'note_review',
  GITHUB_PR_CONTEXT = 'github_pr_context',
}

export interface PlanLimits {
  maxStorageBytes: number;
  maxAiCreditsPerMonth: number;
  maxWorkspaces: number;
  maxProjectsPerWorkspace: number;
}

