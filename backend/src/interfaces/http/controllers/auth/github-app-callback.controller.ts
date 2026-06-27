import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';

import { readEnvironment } from '../../../../adapters/environment.js';
import type { AuthenticatedUser } from '../../../../application/auth.js';
import { IntegrationConnectionService } from '../../../../application/integration-connections.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard } from '../../auth.guards.js';
import { githubAppCallbackQuerySchema, type GithubAppCallbackQuery } from '../../dto/integration-credentials.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

const githubAppCallbackRoute = readEnvironment().githubAppCallbackPath.replace(/^\/+/, '');

@ApiTags('GitHub App Callback')
@Controller()
export class GithubAppCallbackController {
  constructor(private readonly connections: IntegrationConnectionService) {}

  @Get(githubAppCallbackRoute)
  @UseGuards(AccessTokenAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Handle GitHub App callback' })
  @ApiQuery({ name: 'code', required: true, description: 'OAuth authorization code' })
  @ApiQuery({ name: 'state', required: true, description: 'OAuth state parameter' })
  @ApiQuery({ name: 'installation_id', required: true, description: 'GitHub App installation ID' })
  @ApiResponse({ status: 302, description: 'Redirect to application' })
  async githubAppCallback(
    @Query(new ZodValidationPipe(githubAppCallbackQuerySchema, 'invalid_github_app_callback')) query: GithubAppCallbackQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Res() response: Response,
  ) {
    // Handle installation update (setup_action=update) without state
    if (query.setup_action === 'update' && !query.state) {
      try {
        await this.connections.updateGithubInstallation({
          userId: currentUser.id,
          installationId: query.installation_id,
        });
        const environment = readEnvironment();
        const redirectUrl = `${environment.publicBaseUrl || ''}/settings/integrations?integration=GithubApp&status=updated`;
        return response.redirect(302, redirectUrl);
      } catch (error) {
        const environment = readEnvironment();
        const redirectUrl = `${environment.publicBaseUrl || ''}/settings/integrations?integration=GithubApp&status=error`;
        return response.redirect(302, redirectUrl);
      }
    }

    const result = await this.connections.completeGithubForBrowser({
      userId: currentUser.id,
      state: query.state,
      installationId: query.installation_id,
    });
    return response.redirect(302, result.redirectUrl);
  }
}
