import { Injectable } from '@nestjs/common';
import { QuotaRepository } from '../ports/quota/quota.repository.js';
import { QuotaResourceType } from '../../domain/enums/plans.enums.js';
import type { PlanRecord } from '../models/repository-records.models.js';

export interface QuotaStatus {
  plan: string;
  status: string;
  currentPeriodEnd: string;
  limits: {
    storage: number;
    aiRequests: number;
    workspaces: number;
    projects: number;
  };
  usage: {
    storage: number;
    aiRequests: number;
    workspaces: number;
    projects: number;
  };
}

@Injectable()
export class QuotaService {
  constructor(private readonly quotaRepository: QuotaRepository) {}

  async checkQuota(
    userId: string,
    resourceType: QuotaResourceType,
    requestedAmount = 1,
    context?: { workspaceId?: string },
  ): Promise<{ allowed: boolean; limit: number; current: number }> {
    // 1. Get active user subscription or default to free plan
    const activeSub = await this.quotaRepository.getSubscription(userId);
    let plan: PlanRecord;
    let periodStart = new Date(0);
    let periodEnd = new Date(32503680000000); // Year 3000

    if (activeSub) {
      plan = activeSub.plan;
      periodStart = new Date(activeSub.currentPeriodStart);
      periodEnd = new Date(activeSub.currentPeriodEnd);
    } else {
      const freePlan = await this.quotaRepository.getPlanBySlug('free');
      if (!freePlan) {
        throw new Error('Default "free" plan not found in database. Seed must be run.');
      }
      plan = freePlan;
      // For free tier users, quota usage (like AI requests) resets monthly based on the calendar month
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    // 2. Fetch base plan limit
    const baseLimit = Number(this.getBaseLimit(plan, resourceType));

    // 3. Fetch active adjustments for this resource type
    const adjustments = await this.quotaRepository.getActiveAdjustments(userId, resourceType);
    const extraLimit = adjustments.reduce((acc, adj) => acc + adj.amount, 0);

    const totalLimit = baseLimit === -1 ? -1 : baseLimit + extraLimit;

    // 4. Fetch current usage
    const currentUsage = await this.getCurrentUsage(userId, resourceType, periodStart, periodEnd, context);

    return {
      allowed: totalLimit === -1 ? true : (currentUsage + requestedAmount) <= totalLimit,
      limit: totalLimit,
      current: currentUsage,
    };
  }

  async incrementUsage(
    userId: string,
    resourceType: QuotaResourceType,
    amount = 1,
    description?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.quotaRepository.saveUsageEvent({
      userId,
      type: resourceType,
      amount,
      description: description || null,
      metadata,
    });
  }

  async getQuotaStatus(userId: string): Promise<QuotaStatus> {
    const activeSub = await this.quotaRepository.getSubscription(userId);
    let plan: PlanRecord;
    let status = 'active';
    let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days fallback
    let periodStart = new Date(0);
    let periodEnd = new Date(32503680000000);

    if (activeSub) {
      plan = activeSub.plan;
      status = activeSub.status;
      currentPeriodEnd = activeSub.currentPeriodEnd;
      periodStart = new Date(activeSub.currentPeriodStart);
      periodEnd = new Date(activeSub.currentPeriodEnd);
    } else {
      const freePlan = await this.quotaRepository.getPlanBySlug('free');
      if (!freePlan) {
        throw new Error('Default "free" plan not found in database. Seed must be run.');
      }
      plan = freePlan;
      // For free tier users, quota usage resets monthly based on the calendar month
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      currentPeriodEnd = periodEnd.toISOString();
    }

    // Storage
    const storageLimitBase = Number(plan.maxStorageBytes);
    const storageAdjustments = await this.quotaRepository.getActiveAdjustments(userId, QuotaResourceType.STORAGE);
    const storageLimitTotal = storageLimitBase === -1 ? -1 : storageLimitBase + storageAdjustments.reduce((acc, a) => acc + a.amount, 0);
    const storageUsage = await this.quotaRepository.getAttachmentStorageUsage(userId);

    // AI Requests
    const aiLimitBase = Number(plan.maxAiRequestsPerMonth);
    const aiAdjustments = await this.quotaRepository.getActiveAdjustments(userId, QuotaResourceType.AI_REQUEST);
    const aiLimitTotal = aiLimitBase === -1 ? -1 : aiLimitBase + aiAdjustments.reduce((acc, a) => acc + a.amount, 0);
    const aiUsage = await this.quotaRepository.getCurrentUsage(userId, QuotaResourceType.AI_REQUEST, periodStart, periodEnd);

    // Workspaces
    const workspacesLimitBase = Number(plan.maxWorkspaces);
    const workspacesAdjustments = await this.quotaRepository.getActiveAdjustments(userId, QuotaResourceType.WORKSPACE);
    const workspacesLimitTotal = workspacesLimitBase === -1 ? -1 : workspacesLimitBase + workspacesAdjustments.reduce((acc, a) => acc + a.amount, 0);
    const workspacesUsage = await this.quotaRepository.getWorkspaceCount(userId);

    // Projects (we return limits representing the project count per workspace, so we don't count across any specific workspace here)
    const projectsLimitBase = Number(plan.maxProjectsPerWorkspace);
    const projectsAdjustments = await this.quotaRepository.getActiveAdjustments(userId, QuotaResourceType.PROJECT);
    const projectsLimitTotal = projectsLimitBase === -1 ? -1 : projectsLimitBase + projectsAdjustments.reduce((acc, a) => acc + a.amount, 0);

    return {
      plan: plan.slug,
      status,
      currentPeriodEnd,
      limits: {
        storage: storageLimitTotal,
        aiRequests: aiLimitTotal,
        workspaces: workspacesLimitTotal,
        projects: projectsLimitTotal,
      },
      usage: {
        storage: storageUsage,
        aiRequests: aiUsage,
        workspaces: workspacesUsage,
        projects: 0, // dynamic in workspace context
      },
    };
  }

  private getBaseLimit(plan: PlanRecord, resourceType: QuotaResourceType): number {
    switch (resourceType) {
      case QuotaResourceType.STORAGE:
        return plan.maxStorageBytes;
      case QuotaResourceType.AI_REQUEST:
        return plan.maxAiRequestsPerMonth;
      case QuotaResourceType.WORKSPACE:
        return plan.maxWorkspaces;
      case QuotaResourceType.PROJECT:
        return plan.maxProjectsPerWorkspace;
      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }
  }

  private async getCurrentUsage(
    userId: string,
    resourceType: QuotaResourceType,
    periodStart: Date,
    periodEnd: Date,
    context?: { workspaceId?: string },
  ): Promise<number> {
    switch (resourceType) {
      case QuotaResourceType.STORAGE:
        return this.quotaRepository.getAttachmentStorageUsage(userId);
      case QuotaResourceType.AI_REQUEST:
        return this.quotaRepository.getCurrentUsage(userId, QuotaResourceType.AI_REQUEST, periodStart, periodEnd);
      case QuotaResourceType.WORKSPACE:
        return this.quotaRepository.getWorkspaceCount(userId);
      case QuotaResourceType.PROJECT:
        if (!context?.workspaceId) {
          throw new Error('WorkspaceId context is required to check project count quota.');
        }
        return this.quotaRepository.getProjectCountInWorkspace(userId, context.workspaceId);
      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }
  }
}
