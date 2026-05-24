import { Injectable } from '@nestjs/common';

import { generateReviewAnalysis } from '../../adapters/ai.js';
import { ReviewAnalysisGateway, type ReviewAnalysis, type ReviewAnalysisConfig } from '../../application/ports/projects/review-analysis.port.js';

@Injectable()
export class DefaultReviewAnalysisGateway extends ReviewAnalysisGateway {
  generate(config: ReviewAnalysisConfig, promptPayload: unknown): Promise<ReviewAnalysis> {
    return generateReviewAnalysis(config, promptPayload);
  }
}
