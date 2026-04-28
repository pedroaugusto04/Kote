import { Injectable } from '@nestjs/common';

import type { QueryInput } from '../../../contracts/query.js';
import { ContentQueryRepository } from '../../ports/repositories.js';
import { rankKnowledgeMatches } from '../../utils/query.utils.js';

@Injectable()
export class QueryKnowledgeUseCase {
  constructor(private readonly contentQueryRepository: ContentQueryRepository) {}

  async execute(input: QueryInput, userId: string) {
    const notes = await this.contentQueryRepository.list(userId);
    const matches = rankKnowledgeMatches(notes, input);
    return {
      ok: true,
      mode: input.mode,
      query: input.query,
      matches,
      answer: matches.length
        ? {
            answer: `Encontrei ${matches.length} nota(s) relevante(s) para "${input.query}".`,
            bullets: matches.map((match) => `${match.title}: ${match.snippet}`),
            citedPaths: matches.map((match) => match.path),
          }
        : { answer: `Nao encontrei notas relevantes para: ${input.query}`, bullets: [], citedPaths: [] },
    };
  }
}
