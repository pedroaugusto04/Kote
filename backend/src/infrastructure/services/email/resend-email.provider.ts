import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Resend } from 'resend';
import { Injectable } from '@nestjs/common';

import type { EmailSendPayload } from '../../../application/models/email.models.js';
import { EmailProvider } from '../../../application/ports/email/email-provider.js';
import { RuntimeEnvironmentProvider } from '../../../application/ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../../observability/logger.js';
import { resolveEmailAppName, resolveEmailFrontUrl, resolveEmailLogoUrl } from '../../email/emailBranding.js';

@Injectable()
export class ResendEmailProvider extends EmailProvider {
  private client: Resend | null = null;

  constructor(
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  private getClient(): Resend {
    if (this.client) return this.client;

    const env = this.environmentProvider.read();
    const apiKey = env.emailResendApiKey;
    if (!apiKey) {
      this.logger.error('email_provider.resend_missing_api_key');
      throw new Error('KB_EMAIL_RESEND_API_KEY is not configured');
    }

    this.client = new Resend(apiKey);
    return this.client;
  }

  async sendEmail(payload: EmailSendPayload): Promise<void> {
    const env = this.environmentProvider.read();
    const from = env.emailFrom;

    if (!payload.text && !payload.html) {
      this.logger.warn('email_provider.resend_missing_body', {
        to: payload.to,
        subject: payload.subject,
      });
    }

    const frontUrl = resolveEmailFrontUrl();
    let bodyHtml = payload.html ?? '';

    if (payload.templateName) {
      const templatePath = path.join(__dirname, '../../email/templates', `${payload.templateName}.hbs`);
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = Handlebars.compile(templateSource);

      bodyHtml = template({
        ...payload.templateData,
        frontUrl,
      });
    }

    // template base
    const baseTemplatePath = path.join(__dirname, '../../email/templates', 'base.hbs');
    const baseSource = fs.readFileSync(baseTemplatePath, 'utf8');
    const baseTemplate = Handlebars.compile(baseSource);

    const html = baseTemplate({
      body: bodyHtml,
      subject: payload.subject,
      year: new Date().getFullYear(),
      appName: resolveEmailAppName(),
      appLogoUrl: resolveEmailLogoUrl(frontUrl),
    });

    await this.getClient().emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      html,
      text: payload.text ?? undefined,
      headers: {
        'X-KB-Service': 'Knowledge Base',
      },
    } as any);

    this.logger.info('email_provider.resend_sent', { to: payload.to, subject: payload.subject });
  }
}
