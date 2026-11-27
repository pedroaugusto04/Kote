import { Injectable } from '@nestjs/common';

import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { type AiOperationType } from '../../../domain/enums/plans.enums.js';
import {
  AiNotConnectedException,
  AppErrorCode,
  QuotaExceededException,
  type AiNotConnectedCode,
} from '../../../domain/exceptions/index.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { QuotaService } from '../quota/quota.service.js';

type ManagedAiProvider =
  | IntegrationProvider.AiReview
  | IntegrationProvider.AiConversation
  | IntegrationProvider.ProjectBriefAi
  | IntegrationProvider.PrContextAi
  | IntegrationProvider.FileNotesSummaryAi
  | IntegrationProvider.AiSessionSynthesis;

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

const DISABLED_ERROR_CODES: Record<ManagedAiProvider, AiNotConnectedCode> = {
  [IntegrationProvider.AiReview]: AppErrorCode.ReviewAiNotConnected,
  [IntegrationProvider.AiConversation]: AppErrorCode.AiConversationNotEnabled,
  [IntegrationProvider.ProjectBriefAi]: AppErrorCode.ProjectBriefAiNotConnected,
  [IntegrationProvider.PrContextAi]: AppErrorCode.PrContextAiNotConnected,
  [IntegrationProvider.FileNotesSummaryAi]: AppErrorCode.FileNotesSummaryAiNotConnected,
  [IntegrationProvider.AiSessionSynthesis]: AppErrorCode.AiSessionSynthesisNotConnected,
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
      throw new AiNotConnectedException(DISABLED_ERROR_CODES[provider]);
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
      throw new AiNotConnectedException(DISABLED_ERROR_CODES[input.provider]);
    }
    if (!result.quota.allowed) {
      throw new QuotaExceededException('ai_credits', result.quota.limit, result.quota.current);
    }
    return result.quota;
  }
}
