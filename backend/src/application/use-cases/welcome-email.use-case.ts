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
      `Obrigado por criar sua conta no ${appName}! Estamos felizes em tê-lo com a gente!\n\n` +
      `O Knowledge Vault centraliza o conhecimento operacional da sua equipe, evitando perda de contexto e acelerando a integração de novos membros.\n\n` +
      `RECURSOS PRINCIPAIS:\n` +
      `• GitHub Push Integration: Capture commits automaticamente com análise de IA\n` +
      `• WhatsApp & Telegram: Envie áudio/texto para gerar notas estruturadas\n` +
      `• AI-Powered Conversations: Chat integrado para perguntar sobre sua base de conhecimento\n` +
      `• CLI Tool & VS Code: Sync arquivos e sessões de IA direto do seu editor\n\n` +
      `COMO COMEÇAR:\n` +
      `1. Acesse sua conta e explore o Dashboard\n` +
      `2. Configure suas Integrações (WhatsApp, Telegram, GitHub)\n` +
      `3. Crie seu primeiro Projeto e adicione notas\n` +
      `4. Experimente o Chat AI para buscar conhecimento\n` +
      `5. Instale o CLI ou VS Code Extension para captura rápida\n\n` +
      `Acesse sua conta em: ${env.publicBaseUrl || 'http://localhost:5173'}\n\n` +
      `Obrigado por fazer parte da nossa equipe!`;

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
