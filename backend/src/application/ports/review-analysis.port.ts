import type { AiProvider, ReviewFindingSeverity } from '../../contracts/enums.js';

export type ReviewAnalysis = {
  summary: string;
  impact: string;
  risks: string[];
  nextSteps: string[];
  reviewFindings: Array<{
    severity: ReviewFindingSeverity;
    file: string;
    summary: string;
    recommendation: string;
  }>;
};

export type ReviewAnalysisConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export abstract class ReviewAnalysisGateway {
  abstract generate(config: ReviewAnalysisConfig, promptPayload: unknown): Promise<ReviewAnalysis>;
}
