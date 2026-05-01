import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { readEnvironment } from '../../../adapters/environment.js';
import type { AuthenticatedUser } from '../../../application/auth.js';
import { IntegrationConnectionService } from '../../../application/integration-connections.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard } from '../auth.guards.js';
import { githubAppCallbackQuerySchema, type GithubAppCallbackQuery } from '../dto/integration-credentials.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

const githubAppCallbackRoute = readEnvironment().githubAppCallbackPath.replace(/^\/+/, '');

@Controller()
export class GithubAppCallbackController {
  constructor(private readonly connections: IntegrationConnectionService) {}

  @Get(githubAppCallbackRoute)
  @UseGuards(AccessTokenAuthGuard)
  async githubAppCallback(
    @Query(new ZodValidationPipe(githubAppCallbackQuerySchema, 'invalid_github_app_callback')) query: GithubAppCallbackQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const result = await this.connections.completeGithubForBrowser({
      userId: currentUser.id,
      state: query.state,
      code: query.code,
      installationId: query.installation_id,
    });
    return response.redirect(302, result.redirectUrl);
  }
}
