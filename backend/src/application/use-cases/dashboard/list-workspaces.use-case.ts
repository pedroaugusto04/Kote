import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/content.repository.js';

@Injectable()
export class ListWorkspacesUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string) {
    return this.contentRepository.listWorkspaces(userId);
  }
}
