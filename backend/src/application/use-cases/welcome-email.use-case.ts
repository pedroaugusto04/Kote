import { Injectable } from '@nestjs/common';

import { EmailService } from '../services/email.service.js';
import { AppLogger } from '../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';

type UserMinimal = { id: string; email: string; displayName: string };

@Injectable()
export class WelcomeEmailService {
  constructor(
    private readonly emailService: EmailService,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  async sendWelcomeEmail(user: UserMinimal): Promise<void> {
    if (!user?.email) return;

    const env = this.environmentProvider.read();
    const rawFrom = String(env.emailFrom || '');
    const displayFromMatch = rawFrom.match(/^\s*([^<]+)\s*</);
    const appName = displayFromMatch && displayFromMatch[1] ? displayFromMatch[1].trim() : 'Kote';
    const subject = `Welcome to ${appName}!`;

    const text = `Hello ${user.displayName || 'user'},\n\n` +
      `Thank you for creating your account on ${appName}! We're happy to have you with us!\n\n` +
      `Kote centralizes your team's operational knowledge, preventing context loss and accelerating the integration of new team members.\n\n` +
      `KEY FEATURES:\n` +
      `• GitHub Push Integration: Automatically capture commits with AI analysis\n` +
      `• WhatsApp & Telegram: Send audio/text to generate structured notes\n` +
      `• AI-Powered Conversations: Integrated chat to ask questions about your Kote\n` +
      `• CLI Tool & VS Code: Sync files and AI sessions directly from your editor\n\n` +
      `GETTING STARTED:\n` +
      `1. Access your account and explore the Dashboard\n` +
      `2. Configure your Integrations (WhatsApp, Telegram, GitHub)\n` +
      `3. Create your first Project and add notes\n` +
      `4. Try the AI Chat to search for knowledge\n` +
      `5. Install the CLI or VS Code Extension for quick capture\n\n` +
      `Access your account at: ${env.publicBaseUrl || 'http://localhost:5173'}\n\n` +
      `Thank you for being part of our team!`;

    try {
      await this.emailService.sendEmail({
        to: user.email,
        subject,
        text,
        templateName: 'welcome',
        templateData: { name: user.displayName, appName },
      });
      this.logger.info('welcome_email.sent', { to: user.email });
    } catch (error) {
      this.logger.warn('welcome_email.failed', { to: user.email, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
