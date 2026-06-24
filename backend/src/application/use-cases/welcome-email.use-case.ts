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
    const appName = displayFromMatch && displayFromMatch[1] ? displayFromMatch[1].trim() : 'Knowledge Base';
    const subject = `Bem-vindo ao ${appName}!`;

    const text = `Olá ${user.displayName || 'usuário'},\n\n` +
      `Obrigado por criar sua conta em ${appName}. Estamos felizes em tê-lo com a gente.\n\n` +
      `Acesse sua conta e comece a usar o serviço.`;

    const html = `<p>Olá ${user.displayName || 'usuário'},</p>` +
      `<p>Obrigado por criar sua conta em <strong>${appName}</strong>. Estamos felizes em tê-lo com a gente.</p>` +
      `<p>Comece acessando sua conta e explorando o produto.</p>`;

    try {
      await this.emailService.sendEmail({
        to: user.email,
        subject,
        text,
        html,
        templateName: 'welcome',
        templateData: { name: user.displayName, appName },
      });
      this.logger.info('welcome_email.sent', { to: user.email });
    } catch (error) {
      this.logger.warn('welcome_email.failed', { to: user.email, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
