import { Controller, Body, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiSecurity } from '@nestjs/swagger';

import { IntegrationCredentialService } from '../../../../application/credentials.js';
import { InternalServiceTokenGuard } from '../../guards/auth.guards.js';
import {
  providerParamSchema,
  resolveIntegrationCredentialBodySchema,
  type ProviderParam,
  type ResolveIntegrationCredentialBody,
} from '../../dto/integration-credentials.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@ApiTags('Internal Integrations')
@ApiSecurity('service-token')
@Controller('api/internal/integrations')
@UseGuards(InternalServiceTokenGuard)
export class InternalIntegrationsController {
  constructor(private readonly credentials: IntegrationCredentialService) {}

  @Post(':provider/resolve')
  @ApiOperation({ summary: 'Resolve integration credential (internal)' })
  @ApiParam({ name: 'provider', description: 'Integration provider' })
  @ApiResponse({ status: 200, description: 'Credential resolved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  resolve(
    @Param(new ZodValidationPipe(providerParamSchema, 'provider_not_supported')) params: ProviderParam,
    @Body(new ZodValidationPipe(resolveIntegrationCredentialBodySchema, 'invalid_integration_resolution_payload')) body: ResolveIntegrationCredentialBody,
  ) {
    return this.credentials.resolve({
      provider: params.provider,
      workspaceSlug: body.workspaceSlug,
      userId: body.userId,
      externalIdentity: body.externalIdentity,
    });
  }
}
