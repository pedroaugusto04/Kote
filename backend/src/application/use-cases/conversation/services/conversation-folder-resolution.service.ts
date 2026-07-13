import { Injectable } from '@nestjs/common';

import { trimText } from '../../../../domain/strings.js';
import type { AgentConversationState } from '../../../../contracts/agent-conversation.js';
import { ContentRepository } from '../../../ports/notes/content.repository.js';
import { resolveContentScopeFromSlugs } from '../../../utils/content/content-scope.utils.js';
import { folderSlugFromDisplayName } from '../../../utils/content/project-folder.utils.js';
import { CreateProjectFolderUseCase } from '../../projects/create-project-folder.use-case.js';

@Injectable()
export class ConversationFolderResolutionService {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly createProjectFolderUseCase: CreateProjectFolderUseCase,
  ) {}

  async resolveFolderIdForSubmission(userId: string, state: AgentConversationState) {
    if (!state.project.selectedProjectSlug || state.project.selectedProjectSlug === 'inbox') return '';
    if (state.folder.placeInRoot || state.folder.suggestedFolderPath.length === 0) return state.folder.selectedFolderId;
    if (state.folder.selectedFolderId) return state.folder.selectedFolderId;

    const scope = await resolveContentScopeFromSlugs(this.contentRepository, userId, {
      projectSlug: state.project.selectedProjectSlug,
    });
    const project = scope.project;
    if (!project) return '';

    let parentFolderId = '';
    let lastFolderId = '';
    for (const segment of state.folder.suggestedFolderPath) {
      const displayName = trimText(segment);
      if (!displayName) continue;
      const folders = await this.contentRepository.listProjectFolders(userId, project.id);
      const folderSlug = folderSlugFromDisplayName(displayName);
      const existing = folders.find((folder) => folder.parentFolderId === (parentFolderId || null) && folder.folderSlug === folderSlug);
      if (existing) {
        parentFolderId = existing.id;
        lastFolderId = existing.id;
        continue;
      }
      const created = await this.createProjectFolderUseCase.execute({
        projectId: project.id,
        displayName,
        parentFolderId: parentFolderId || undefined,
      }, userId);
      parentFolderId = created.folder.id;
      lastFolderId = created.folder.id;
    }
    return lastFolderId;
  }
}
