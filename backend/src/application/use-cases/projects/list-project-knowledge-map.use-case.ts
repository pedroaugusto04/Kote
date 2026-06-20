import { Injectable, NotFoundException } from '@nestjs/common';

import { slugify } from '../../../domain/strings.js';
import type {
  KnowledgeMapLink,
  KnowledgeMapLinkType,
  KnowledgeMapNode,
  ListProjectKnowledgeMapInput,
  ProjectKnowledgeMapResponse,
  ProjectKnowledgeMapNoteCategory,
} from '../../models/project-knowledge-map.models.js';
import type { NoteRecord, ProjectFolderRecord, SaveProjectInput } from '../../models/repository-records.models.js';
import { collectFolderDescendantIds } from '../../utils/project-folder.utils.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class ListProjectKnowledgeMapUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, input: ListProjectKnowledgeMapInput): Promise<ProjectKnowledgeMapResponse> {
    const project = input.projectId
      ? await this.contentRepository.getProjectById(userId, input.projectId)
      : await this.contentRepository.getProjectBySlug(userId, input.projectSlug || '');
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const folders = await this.contentRepository.listProjectFolders(userId, project.id);
    const normalizedFolderId = input.folderId?.trim() || '';
    const queryInput = {
      ...input,
      projectId: project.id,
      folderId: undefined as string | undefined,
      folderIds: undefined as string[] | undefined,
    };
    if (normalizedFolderId) {
      const selectedFolder = folders.find((folder) => folder.id === normalizedFolderId);
      if (!selectedFolder) throw new NotFoundException('folder_not_found');
      queryInput.folderIds = collectFolderDescendantIds(folders, normalizedFolderId);
    }

    const notes = await this.contentRepository.listProjectKnowledgeMapItems(userId, queryInput);
    return buildProjectKnowledgeMap(project, folders, notes);
  }
}

export function buildProjectKnowledgeMap(
  project: SaveProjectInput,
  folders: ProjectFolderRecord[],
  notes: NoteRecord[],
): ProjectKnowledgeMapResponse {
  const nodes = new Map<string, KnowledgeMapNode>();
  const links = new Map<string, KnowledgeMapLink>();
  const projectNodeId = projectNode(project.projectSlug);
  const repositoryNodeIdsByFullName = new Map<string, string>();

  addNode(nodes, {
    id: projectNodeId,
    type: 'project',
    label: project.displayName,
    subtitle: project.projectSlug,
    projectSlug: project.projectSlug,
    size: 28,
  });

  for (const repository of project.repositories) {
    const nodeId = repositoryNode(repository.id || repository.fullName);
    repositoryNodeIdsByFullName.set(repository.fullName.trim().toLowerCase(), nodeId);
    addNode(nodes, {
      id: nodeId,
      type: 'repository',
      label: repository.fullName,
      subtitle: repository.defaultBranch || project.workspaceSlug || '',
      projectSlug: project.projectSlug,
      size: 18,
    });
    addLink(links, projectNodeId, nodeId, 'contains', 0.45);
  }

  const folderIdsWithNotes = new Set(notes.map((note) => note.folderId).filter(Boolean) as string[]);
  const folderIdsToRender = collectAncestorFolderIds(folders, folderIdsWithNotes);
  for (const folder of folders.filter((item) => folderIdsToRender.has(item.id))) {
    const nodeId = folderNode(folder.id);
    addNode(nodes, {
      id: nodeId,
      type: 'folder',
      label: folder.displayName,
      subtitle: folder.fullSlugPath,
      projectSlug: project.projectSlug,
      size: 15,
    });
    const parentNodeId = folder.parentFolderId && folderIdsToRender.has(folder.parentFolderId)
      ? folderNode(folder.parentFolderId)
      : projectNodeId;
    addLink(links, parentNodeId, nodeId, 'contains', 0.55);
  }

  for (const note of notes) {
    const noteNodeId = noteNode(note.id);
    const category = projectKnowledgeMapCategory(note);
    addNode(nodes, {
      id: noteNodeId,
      type: 'note',
      label: note.title || note.path || note.id,
      subtitle: note.summary || note.path,
      noteId: note.id,
      projectSlug: project.projectSlug,
      category,
      status: note.status,
      date: note.occurredAt,
      size: Math.min(18, 10 + (note.attachmentCount || 0)),
      isReview: isReviewNote(note),
    });
    addLink(links, projectNodeId, noteNodeId, 'contains', 0.16);

    if (note.folderId && folderIdsToRender.has(note.folderId)) {
      addLink(links, folderNode(note.folderId), noteNodeId, 'filed-in', 0.55);
    }

    const categoryNodeId = categoryNode(category);
    addNode(nodes, {
      id: categoryNodeId,
      type: 'category',
      label: categoryLabel(category),
      category,
      size: 13,
    });
    addLink(links, noteNodeId, categoryNodeId, 'classified-as', 0.35);

    for (const rawTag of note.tags) {
      const tag = slugify(rawTag);
      if (!tag) continue;
      const tagNodeId = tagNode(tag);
      addNode(nodes, {
        id: tagNodeId,
        type: 'tag',
        label: tag,
        projectSlug: project.projectSlug,
        size: 12,
      });
      addLink(links, noteNodeId, tagNodeId, 'tagged-with', 0.35);
    }

    const repositoryNodeId = repositoryNodeIdsByFullName.get(noteRepositoryFullName(note));
    if (category === 'github-push' && repositoryNodeId) {
      addLink(links, noteNodeId, repositoryNodeId, 'from-repository', 0.7);
    }
  }

  return {
    ok: true,
    projectSlug: project.projectSlug,
    nodes: [...nodes.values()],
    links: [...links.values()],
    stats: {
      noteCount: notes.length,
      tagCount: [...nodes.values()].filter((node) => node.type === 'tag').length,
      folderCount: [...nodes.values()].filter((node) => node.type === 'folder').length,
      repositoryCount: project.repositories.length,
    },
  };
}

export function projectKnowledgeMapCategory(record: Pick<NoteRecord, 'metadata' | 'source' | 'sourceChannel' | 'reminderDate' | 'reminderAt'>): ProjectKnowledgeMapNoteCategory {
  if (hasReminder(record)) return 'reminder';
  if (record.sourceChannel === 'github-push') return 'github-push';
  if (record.sourceChannel === 'whatsapp') return 'whatsapp';
  if (record.sourceChannel === 'ai-chat') return 'ai-chat';
  return 'manual';
}

function collectAncestorFolderIds(folders: ProjectFolderRecord[], selectedIds: Set<string>) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result = new Set<string>();
  for (const selectedId of selectedIds) {
    let current = byId.get(selectedId);
    while (current) {
      result.add(current.id);
      current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
    }
  }
  return result;
}

function hasReminder(record: Pick<NoteRecord, 'reminderDate' | 'reminderAt'>) {
  return Boolean(record.reminderDate.trim() || record.reminderAt.trim());
}

function isReviewNote(record: Pick<NoteRecord, 'metadata' | 'sourceChannel'>) {
  return record.metadata.eventType === 'code_review' || record.sourceChannel === 'github-push';
}

function noteRepositoryFullName(note: NoteRecord) {
  return String(note.metadata.repoFullName || '').trim().toLowerCase();
}

function addNode(nodes: Map<string, KnowledgeMapNode>, node: KnowledgeMapNode) {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function addLink(links: Map<string, KnowledgeMapLink>, source: string, target: string, type: KnowledgeMapLinkType, strength: number) {
  const id = `${type}:${source}->${target}`;
  if (!links.has(id)) links.set(id, { id, source, target, type, strength });
}

function projectNode(projectSlug: string) {
  return `project:${projectSlug}`;
}

function repositoryNode(repositoryId: string) {
  return `repository:${repositoryId}`;
}

function folderNode(folderId: string) {
  return `folder:${folderId}`;
}

function noteNode(noteId: string) {
  return `note:${noteId}`;
}

function tagNode(tag: string) {
  return `tag:${tag}`;
}

function categoryNode(category: ProjectKnowledgeMapNoteCategory) {
  return `category:${category}`;
}

function categoryLabel(category: ProjectKnowledgeMapNoteCategory) {
  const labels: Record<ProjectKnowledgeMapNoteCategory, string> = {
    whatsapp: 'WhatsApp',
    'github-push': 'GitHub push',
    manual: 'Manual',
    reminder: 'Reminder',
    'ai-chat': 'AI Chat',
  };
  return labels[category];
}
