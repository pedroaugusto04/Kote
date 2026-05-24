import { Injectable } from '@nestjs/common';

import { AskHistoryRepository } from '../../ports/query/ask-history.repository.js';
import { AskKnowledgeUseCase } from './ask-knowledge.use-case.js';

@Injectable()
export class RunAskAiUseCase {
  constructor(
    private readonly askKnowledge: AskKnowledgeUseCase,
    private readonly askHistoryRepository: AskHistoryRepository,
  ) {}

  async execute(question: string, userId: string, options: { projectSlug?: string } = {}) {
    const result = await this.askKnowledge.execute(question, userId, { projectSlug: options.projectSlug });
    if (result.ok) {
      await this.askHistoryRepository.save({
        userId,
        projectSlug: options.projectSlug || '',
        question,
        answer: result.answer,
        confidence: result.confidence,
        sources: result.sources,
        relatedNotes: result.relatedNotes,
      });
    }
    return result;
  }
}
