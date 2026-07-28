import { Injectable } from '@nestjs/common';

import { generateDependencyAlert } from '../../adapters/ai.js';
import { DependencyAlertGateway, type DependencyAlertConfig, type DependencyAlertPayload, type DependencyAlertResult } from '../../application/ports/dependency-watcher/dependency-alert.port.js';

@Injectable()
export class DefaultDependencyAlertGateway extends DependencyAlertGateway {
  async analyze(config: DependencyAlertConfig, payload: DependencyAlertPayload): Promise<DependencyAlertResult> {
    const chatConfig = {
      provider: config.provider,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      model: config.model,
      apiKey: config.apiKey,
    };
    return generateDependencyAlert(chatConfig, payload);
  }
}
