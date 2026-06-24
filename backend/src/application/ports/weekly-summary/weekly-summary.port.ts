import type { AiProvider } from '../../../contracts/enums.js';
import type { WeeklySummaryAnalysis } from '../../../infrastructure/ai/prompts/weekly-summary.prompt.js';

export type WeeklySummaryConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export abstract class WeeklySummaryGateway {
  abstract generate(config: WeeklySummaryConfig, promptPayload: unknown): Promise<WeeklySummaryAnalysis>;
}
