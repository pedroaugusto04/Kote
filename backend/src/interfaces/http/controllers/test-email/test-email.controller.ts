import { Body, Controller, Post, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

import { WelcomeEmailService } from '../../../../application/use-cases/welcome-email.use-case.js';
import { WeeklySummaryService } from '../../../../application/services/weekly-summary.service.js';
import { NotifyHighSeverityFindingsService } from '../../../../application/use-cases/notifications/notify-high-severity-findings.use-case.js';
import { UserService } from '../../../../application/services/user.service.js';
import { RuntimeEnvironmentProvider } from '../../../../application/ports/observability/runtime-environment.port.js';

const testEmailBodySchema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
  },
  required: ['email'],
} as const;

type TestEmailBody = { email: string };

@ApiTags('Test Email')
@Controller('api/test-email')
export class TestEmailController {
  private readonly authSecret: string;

  constructor(
    private readonly welcomeEmailService: WelcomeEmailService,
    private readonly weeklySummaryService: WeeklySummaryService,
    private readonly notifyHighSeverityFindingsService: NotifyHighSeverityFindingsService,
    private readonly userService: UserService,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {
    const env = this.environmentProvider.read();
    this.authSecret = env.testEmailAuthSecret || '';
  }

  private validateAuth(authHeader: string | undefined): void {
    if (!this.authSecret) {
      throw new BadRequestException('TEST_EMAIL_AUTH_SECRET not configured');
    }
    if (!authHeader || authHeader !== `Bearer ${this.authSecret}`) {
      throw new BadRequestException('Invalid or missing authentication token');
    }
  }

  @Post('welcome')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send welcome email to a user' })
  @ApiResponse({ status: 200, description: 'Welcome email sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or user not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async sendWelcomeEmail(
    @Body() body: TestEmailBody,
    @Body('auth') authHeader?: string,
  ) {
    this.validateAuth(authHeader);
    const user = await this.userService.getUserByEmail(body.email);
    await this.welcomeEmailService.sendWelcomeEmail(user);
    return { message: 'Welcome email sent successfully', email: user.email };
  }

  @Post('weekly-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send weekly summary email to a user' })
  @ApiResponse({ status: 200, description: 'Weekly summary email sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or user not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async sendWeeklySummaryEmail(
    @Body() body: TestEmailBody,
    @Body('auth') authHeader?: string,
  ) {
    this.validateAuth(authHeader);
    const user = await this.userService.getUserByEmail(body.email);

    // Calculate last 7 days range
    const end = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0));
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Use the shared method from WeeklySummaryService
    const result = await this.weeklySummaryService.sendWeeklySummaryToUserForRange(
      user.id,
      start.toISOString(),
      end.toISOString(),
    );

    if (!result.sent) {
      if (result.reason === 'no_notes') {
        return { message: 'No notes found in the last 7 days for this user', email: user.email };
      }
      if (result.reason === 'review_ai_inactive') {
        return { message: 'Review AI integration is not active globally. Weekly summary requires review AI to be configured.', email: user.email };
      }
      if (result.reason === 'user_review_ai_inactive') {
        return { message: 'Review AI is not enabled for this user\'s workspace. Weekly summary requires review AI to be activated in the workspace settings.', email: user.email };
      }
      return { message: 'Weekly summary email was not sent', email: user.email, reason: result.reason };
    }

    return { message: 'Weekly summary email sent successfully', email: user.email, totalNotes: result.totalNotes };
  }

  @Post('code-review-alert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send code review alert email to a user' })
  @ApiResponse({ status: 200, description: 'Code review alert email sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or user not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async sendCodeReviewAlertEmail(
    @Body() body: TestEmailBody & { noteId?: string; noteLink?: string },
    @Body('auth') authHeader?: string,
  ) {
    this.validateAuth(authHeader);
    const user = await this.userService.getUserByEmail(body.email);

    // Use the shared method from NotifyHighSeverityFindingsService
    const result = await this.notifyHighSeverityFindingsService.sendEmailForMostRecentNoteWithHighFindings(
      user.id,
      body.noteLink,
      body.noteId,
    );

    if (!result.sent) {
      return { 
        message: result.message || 'Failed to send code review alert email', 
        email: user.email,
        noteId: result.noteId,
      };
    }

    return { 
      message: 'Code review alert email sent successfully', 
      email: user.email, 
      noteId: result.noteId,
      totalFindings: result.totalFindings,
      highSeverityFindings: result.highSeverityFindings 
    };
  }
}
