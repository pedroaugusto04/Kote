import { Injectable } from '@nestjs/common';

import { generateWeeklySummary, type WeeklySummaryAnalysis } from '../../adapters/ai.js';
import { WeeklySummaryGateway, type WeeklySummaryConfig } from '../../application/ports/weekly-summary/weekly-summary.port.js';

@Injectable()
export class DefaultWeeklySummaryGateway extends WeeklySummaryGateway {
  generate(config: WeeklySummaryConfig, promptPayload: unknown): Promise<WeeklySummaryAnalysis> {
    return generateWeeklySummary(config, promptPayload);
  }
}
