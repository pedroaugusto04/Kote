import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';

import { ConversationAgentGateway } from '../../application/ports/conversation/conversation-agent.gateway.js';
import { ProjectBriefAiGateway } from '../../application/ports/projects/project-brief-ai.gateway.js';
import { EmbeddingGateway } from '../../application/ports/notes/embedding.gateway.js';
import { AnswerGenerationGateway } from '../../application/ports/query/answer-generation.gateway.js';
import { AudioTranscriptionGateway } from '../../application/ports/audio/audio-transcription.gateway.js';
import { ReviewAnalysisGateway } from '../../application/ports/projects/review-analysis.port.js';
import { GithubIntegrationGateway } from '../../application/ports/integrations/github-integration.port.js';
import { WeeklySummaryGateway } from '../../application/ports/weekly-summary/weekly-summary.port.js';

import { DefaultConversationAgentGateway } from '../ai/conversation-agent.gateway.js';
import { DefaultProjectBriefAiGateway } from '../ai/project-brief.gateway.js';
import { DefaultReviewAnalysisGateway } from '../ai/review-analysis.gateway.js';
import { DefaultEmbeddingGateway } from '../ai/embedding.gateway.js';
import { DefaultAnswerGenerationGateway } from '../ai/answer-generation.gateway.js';
import { DefaultAudioTranscriptionGateway } from '../ai/audio-transcription.gateway.js';
import { DefaultGithubIntegrationGateway } from '../integrations/github-integration.gateway.js';
import { DefaultWeeklySummaryGateway } from '../ai/weekly-summary.gateway.js';

const gateways = [
  DefaultConversationAgentGateway,
  DefaultProjectBriefAiGateway,
  DefaultReviewAnalysisGateway,
  DefaultEmbeddingGateway,
  DefaultAnswerGenerationGateway,
  DefaultAudioTranscriptionGateway,
  DefaultGithubIntegrationGateway,
  DefaultWeeklySummaryGateway,
  { provide: ConversationAgentGateway, useExisting: DefaultConversationAgentGateway },
  { provide: ProjectBriefAiGateway, useExisting: DefaultProjectBriefAiGateway },
  { provide: ReviewAnalysisGateway, useExisting: DefaultReviewAnalysisGateway },
  { provide: EmbeddingGateway, useExisting: DefaultEmbeddingGateway },
  { provide: AnswerGenerationGateway, useExisting: DefaultAnswerGenerationGateway },
  { provide: AudioTranscriptionGateway, useExisting: DefaultAudioTranscriptionGateway },
  { provide: GithubIntegrationGateway, useExisting: DefaultGithubIntegrationGateway },
  { provide: WeeklySummaryGateway, useExisting: DefaultWeeklySummaryGateway },
];

@Module({
  imports: [
    LoggerModule,
    EnvModule,
  ],
  providers: gateways,
  exports: gateways,
})
export class AiModule {}
