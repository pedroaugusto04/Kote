export enum SubscriptionPlan {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export const FREE_PLAN_ID = '00000000-0000-0000-0000-000000000001';


export enum QuotaResourceType {
  STORAGE = 'storage',
  AI_REQUEST = 'ai_request',
  WORKSPACE = 'workspace',
  PROJECT = 'project',
}

export interface PlanLimits {
  maxStorageBytes: number;
  maxAiRequestsPerMonth: number;
  maxWorkspaces: number;
  maxProjectsPerWorkspace: number;
}
