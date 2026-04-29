import { Controller, Body, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { IntegrationCredentialService } from '../../../application/credentials.js';
import { InternalServiceTokenGuard } from '../auth.guards.js';
import {
  providerParamSchema,
  resolveIntegrationCredentialBodySchema,
  type ProviderParam,
  type ResolveIntegrationCredentialBody,
} from '../dto/integration-credentials.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/internal/integrations')
@UseGuards(InternalServiceTokenGuard)
export class InternalIntegrationsController {
  constructor(private readonly credentials: IntegrationCredentialService) {}

  @Post(':provider/resolve')
  resolve(
    @Param(new ZodValidationPipe(providerParamSchema, 'provider_not_supported')) params: ProviderParam,
    @Body(new ZodValidationPipe(resolveIntegrationCredentialBodySchema, 'invalid_integration_resolution_payload')) body: ResolveIntegrationCredentialBody,
    @Req() request: Request,
  ) {
    return this.credentials.resolve({
      provider: params.provider,
      workspaceSlug: body.workspaceSlug,
      userId: body.userId,
      externalIdentity: body.externalIdentity,
      authorization: request.headers.authorization,
    });
  }
}
