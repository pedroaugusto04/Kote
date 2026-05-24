import { Injectable } from '@nestjs/common';

import type { QueryInput } from '../../../contracts/query.js';
import { buildPaginationMeta, DEFAULT_PAGE_SIZE } from '../../../contracts/pagination.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { rankKnowledgeMatches } from '../../utils/query.utils.js';

@Injectable()
export class QueryKnowledgeUseCase {
  constructor(private readonly contentQueryRepository: ContentQueryRepository) {}

  async execute(input: QueryInput, userId: string) {
    const notes = await this.contentQueryRepository.list(userId);
    const matches = rankKnowledgeMatches(notes, input);
    const pagination = buildPaginationMeta({ page: input.page || 1, pageSize: input.pageSize || DEFAULT_PAGE_SIZE }, matches.length);
    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      ok: true,
      query: input.query,
      matches: matches.slice(start, start + pagination.pageSize),
      pagination,
      answer: matches.length
        ? {
            answer: `I found ${matches.length} relevant note(s) for "${input.query}".`,
            bullets: matches.map((match) => `${match.title}: ${match.snippet}`),
          }
        : { answer: `I did not find relevant notes for: ${input.query}`, bullets: [] },
    };
  }
}
