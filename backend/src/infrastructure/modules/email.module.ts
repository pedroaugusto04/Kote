import { Module } from '@nestjs/common';

import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { EmailService } from '../../application/services/email.service.js';
import { EmailProvider } from '../../application/ports/email/email-provider.js';
import { EmailQueuePublisher } from '../../application/ports/email/email-queue.publisher.js';
import { RabbitMqEmailQueuePublisher } from '../queue/rabbitmq-email-queue.publisher.js';
import { EmailQueueConsumer } from '../email/consumers/email-queue.consumer.js';
import { ResendEmailProvider } from '../services/email/resend-email.provider.js';
import { SmtpEmailProvider } from '../services/email/smtp-email.provider.js';
import { FakeEmailProvider } from '../services/email/fake-email.provider.js';
import { AppLogger } from '../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../../application/ports/observability/runtime-environment.port.js';

@Module({
  imports: [LoggerModule, EnvModule],
  providers: [
    AppLogger,
    RabbitMqEmailQueuePublisher,
    EmailQueueConsumer,
    EmailService,
    ResendEmailProvider,
    SmtpEmailProvider,
    FakeEmailProvider,
    {
      provide: EmailQueuePublisher,
      useExisting: RabbitMqEmailQueuePublisher,
    },
    {
      provide: EmailProvider,
      useFactory: (environmentProvider: RuntimeEnvironmentProvider, logger: AppLogger) => {
        const environment = environmentProvider.read();
        const provider = String(environment.emailProvider || 'resend').trim().toLowerCase();

        if (provider === 'smtp') {
          return new SmtpEmailProvider(environmentProvider, logger);
        }

        if (provider === 'fake') {
          return new FakeEmailProvider(logger);
        }

        return new ResendEmailProvider(environmentProvider, logger);
      },
      inject: [RuntimeEnvironmentProvider, AppLogger],
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
