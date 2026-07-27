import { Injectable } from '@nestjs/common';
import { QuotaRepository } from '../../ports/quota/quota.repository.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { QuotaResourceType, AiOperationType, SubscriptionPlan } from '../../../domain/enums/plans.enums.js';
import { AI_CREDIT_COSTS } from '../../../domain/constants/ai-credits.constants.js';
import type { PlanRecord, UserSubscriptionWithPlan } from '../../models/repository-records.models.js';
import { getQuotaPeriod } from '../../../domain/utils/subscription.utils.js';

export interface QuotaStatus {
  plan: string;
  status: string;
  currentPeriodEnd: string;
  cpfCnpj?: string;
  limits: {
    storage: number;
    aiCredits: number;
    workspaces: number;
    projects: number;
  };
  usage: {
    storage: number;
    aiCredits: number;
    workspaces: number;
    projects: number;
  };
}

@Injectable()
export class QuotaService {
  constructor(
    private readonly quotaRepository: QuotaRepository,
    private readonly userRepository: UserRepository,
    private readonly contentRepository?: ContentRepository
  ) {}

  async checkQuota(
    userId: string,
    resourceType: QuotaResourceType,
    requestedAmount = 1,
    context?: { workspaceId?: string },
  ): Promise<{ allowed: boolean; limit: number; current: number }> {
    const activeSub = await this.quotaRepository.getSubscription(userId);
    let plan: PlanRecord;
    let periodStart = new Date(0);
    let periodEnd = new Date(32503680000000); // Year 3000

    if (activeSub) {
      plan = activeSub.plan;
      const period = getQuotaPeriod(activeSub);
      periodStart = period.start;
      periodEnd = period.end;
    } else {
      const freePlan = await this.quotaRepository.getPlanBySlug(SubscriptionPlan.FREE);
      if (!freePlan) {
        throw new Error('Default "free" plan not found in database. Seed must be run.');
      }
      plan = freePlan;
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    const baseLimit = Number(this.getBaseLimit(plan, resourceType));
    const adjustments = await this.quotaRepository.getActiveAdjustments(userId, resourceType);
    const extraLimit = adjustments.reduce((acc, adj) => acc + adj.amount, 0);
    const totalLimit = baseLimit === -1 ? -1 : baseLimit + extraLimit;
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

  /**
   * Convenience method for AI operations: checks the AI credit quota and, if
   * allowed, immediately records the usage event in a single call.
   *
   * Credit cost is resolved from AI_CREDIT_COSTS (domain/constants/ai-credits.constants.ts).
   *
   * @returns `{ allowed: false }` when quota is exceeded — callers must handle
   *          this gracefully (e.g. friendly WPP message) instead of throwing.
   */
  async checkAndIncrementAiUsage(
    userId: string,
    operation: AiOperationType,
    metadata?: Record<string, unknown>,
  ): Promise<{ allowed: boolean; limit: number; current: number }> {
    const credits = AI_CREDIT_COSTS[operation] ?? 1;
    const result = await this.checkQuota(userId, QuotaResourceType.AI_REQUEST, credits);
    if (!result.allowed) {
      return result;
    }
    await this.incrementUsage(
      userId,
      QuotaResourceType.AI_REQUEST,
      credits,
      operation,
      metadata,
    );
    return result;
  }

  async getQuotaStatus(userId: string): Promise<QuotaStatus> {
    const activeSub = await this.quotaRepository.getSubscription(userId);
    let plan: PlanRecord;
    let status = 'active';
    let currentPeriodEnd: string;
    let periodStart = new Date(0);
    let periodEnd = new Date(32503680000000);

    if (activeSub) {
      plan = activeSub.plan;
      status = activeSub.status;
      const period = getQuotaPeriod(activeSub);
      periodStart = period.start;
      periodEnd = period.end;
      currentPeriodEnd = periodEnd.toISOString();
    } else {
      const freePlan = await this.quotaRepository.getPlanBySlug(SubscriptionPlan.FREE);
      if (!freePlan) {
        throw new Error('Default "free" plan not found in database. Seed must be run.');
      }
      plan = freePlan;
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      currentPeriodEnd = periodEnd.toISOString();
    }

    const user = await this.userRepository.findUserById(userId);
    const cpfCnpj = user?.cpfCnpj || '';

    // Storage
    const storageLimitBase = Number(plan.maxStorageBytes);
    const storageAdjustments = await this.quotaRepository.getActiveAdjustments(userId, QuotaResourceType.STORAGE);
    const storageLimitTotal = storageLimitBase === -1 ? -1 : storageLimitBase + storageAdjustments.reduce((acc, a) => acc + a.amount, 0);
    const storageUsage = await this.quotaRepository.getAttachmentStorageUsage(userId);

    // AI Credits
    const aiLimitBase = Number(plan.maxAiCreditsPerMonth);
    const aiAdjustments = await this.quotaRepository.getActiveAdjustments(userId, QuotaResourceType.AI_REQUEST);
    const aiLimitTotal = aiLimitBase === -1 ? -1 : aiLimitBase + aiAdjustments.reduce((acc, a) => acc + a.amount, 0);
    const aiUsage = await this.quotaRepository.getCurrentUsage(userId, QuotaResourceType.AI_REQUEST, periodStart, periodEnd);

    // Workspaces
    const workspacesLimitBase = Number(plan.maxWorkspaces);
    const workspacesAdjustments = await this.quotaRepository.getActiveAdjustments(userId, QuotaResourceType.WORKSPACE);
    const workspacesLimitTotal = workspacesLimitBase === -1 ? -1 : workspacesLimitBase + workspacesAdjustments.reduce((acc, a) => acc + a.amount, 0);
    const workspacesUsage = await this.quotaRepository.getWorkspaceCount(userId);

    // Projects (per-workspace cap - show max projects in any workspace)
    const projectsLimitBase = Number(plan.maxProjectsPerWorkspace);
    const projectsAdjustments = await this.quotaRepository.getActiveAdjustments(userId, QuotaResourceType.PROJECT);
    const projectsLimitTotal = projectsLimitBase === -1 ? -1 : projectsLimitBase + projectsAdjustments.reduce((acc, a) => acc + a.amount, 0);
    
    // Get all projects to count max per workspace
    let maxProjectsInAnyWorkspace = 0;
    if (this.contentRepository) {
      const allProjects = await this.contentRepository.listProjects(userId);
      const projectsByWorkspace = new Map<string, number>();
      allProjects.forEach((project: { workspaceSlug?: string }) => {
        const ws = project.workspaceSlug || 'default';
        projectsByWorkspace.set(ws, (projectsByWorkspace.get(ws) || 0) + 1);
      });
      maxProjectsInAnyWorkspace = Math.max(0, ...projectsByWorkspace.values());
    }

    return {
      plan: plan.slug,
      status,
      currentPeriodEnd,
      cpfCnpj,
      limits: {
        storage: storageLimitTotal,
        aiCredits: aiLimitTotal,
        workspaces: workspacesLimitTotal,
        projects: projectsLimitTotal,
      },
      usage: {
        storage: storageUsage,
        aiCredits: aiUsage,
        workspaces: workspacesUsage,
        projects: maxProjectsInAnyWorkspace,
      },
    };
  }

  private getBaseLimit(plan: PlanRecord, resourceType: QuotaResourceType): number {
    switch (resourceType) {
      case QuotaResourceType.STORAGE:
        return plan.maxStorageBytes;
      case QuotaResourceType.AI_REQUEST:
        return plan.maxAiCreditsPerMonth;
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
