import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import type { Request } from 'express';

import { LogApplicationAccessUseCase } from '../../../../application/use-cases/observability/log-application-access.use-case.js';
import { TrustedOriginGuard } from '../../guards/auth.guards.js';
import { applicationAccessBodySchema, type ApplicationAccessBody } from '../../dto/application-access.dto.js';
import { requestIp } from '../../request-ip.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@ApiTags('Application Access')
@Controller('api/application')
export class ApplicationAccessController {
  constructor(private readonly logApplicationAccess: LogApplicationAccessUseCase) {}

  @Post('access')
  @UseGuards(TrustedOriginGuard)
  @ApiOperation({ summary: 'Log application access' })
  @ApiResponse({ status: 200, description: 'Access logged successfully' })
  async logAccess(
    @Body(new ZodValidationPipe(applicationAccessBodySchema, 'invalid_application_access_payload')) body: ApplicationAccessBody,
    @Req() request: Request,
  ) {
    await this.logApplicationAccess.execute({
      page: body.page,
      ip: requestIp(request),
      userAgent: String(request.headers['user-agent'] || ''),
      referrer: String(request.headers.referer || ''),
    });
    return { ok: true };
  }
}
