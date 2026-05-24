import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../../observability/logger.js';

export type LogApplicationAccessInput = {
  page: string;
  ip: string;
  userAgent: string;
  referrer: string;
};

@Injectable()
export class LogApplicationAccessUseCase {
  constructor(private readonly logger: AppLogger) {}

  async execute(input: LogApplicationAccessInput) {
    this.logger.info('application.access', {
      page: input.page,
      ip: input.ip,
      userAgent: input.userAgent,
      referrer: input.referrer,
    });
  }
}
