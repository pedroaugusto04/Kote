import { BadRequestException, Injectable } from '@nestjs/common';

import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { QuotaExceededException } from '../../../interfaces/http/quota-exceeded.exception.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { QuotaService } from '../quota/quota.service.js';

type ManagedAiProvider =
  | IntegrationProvider.AiReview
  | IntegrationProvider.AiConversation
  | IntegrationProvider.ProjectBriefAi
  | IntegrationProvider.PrContextAi
  | IntegrationProvider.FileNotesSummaryAi;

type AiEntitlementInput = {
  userId: string;
  workspaceSlug: string;
  provider: ManagedAiProvider;
  operation: AiOperationType;
  metadata?: Record<string, unknown>;
};

export type AiEntitlementResult =
  | { enabled: false }
  | { enabled: true; quota: { allowed: boolean; limit: number; current: number } };

const DISABLED_ERROR_CODES: Record<ManagedAiProvider, string> = {
  [IntegrationProvider.AiReview]: 'review_ai_not_connected',
  [IntegrationProvider.AiConversation]: 'ai_conversation_not_enabled',
  [IntegrationProvider.ProjectBriefAi]: 'project_brief_ai_not_connected',
  [IntegrationProvider.PrContextAi]: 'pr_context_ai_not_connected',
  [IntegrationProvider.FileNotesSummaryAi]: 'file_notes_summary_ai_not_connected',
};

@Injectable()
export class AiEntitlementService {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly quotaService: QuotaService,
  ) {}

  async checkAndConsume(input: AiEntitlementInput): Promise<AiEntitlementResult> {
    if (!await this.isEnabled(input.userId, input.workspaceSlug, input.provider)) return { enabled: false };

    return {
      enabled: true,
      quota: await this.quotaService.checkAndIncrementAiUsage(
        input.userId,
        input.operation,
        input.metadata,
      ),
    };
  }

  async requireEnabled(userId: string, workspaceSlug: string, provider: ManagedAiProvider): Promise<void> {
    if (!await this.isEnabled(userId, workspaceSlug, provider)) {
      throw new BadRequestException(DISABLED_ERROR_CODES[provider]);
    }
  }

  async isEnabled(userId: string, workspaceSlug: string, provider: ManagedAiProvider): Promise<boolean> {
    const credential = await this.credentials.findCredential(userId, workspaceSlug, provider);
    return Boolean(
      credential
      && credential.status === CredentialRecordStatus.Connected
      && !credential.revokedAt,
    );
  }

  async requireAndConsume(input: AiEntitlementInput) {
    const result = await this.checkAndConsume(input);
    if (!result.enabled) {
      throw new BadRequestException(DISABLED_ERROR_CODES[input.provider]);
    }
    if (!result.quota.allowed) {
      throw new QuotaExceededException('ai_credits', result.quota.limit, result.quota.current);
    }
    return result.quota;
  }
}
