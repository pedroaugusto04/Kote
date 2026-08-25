import crypto from 'node:crypto';
import { NotFoundException } from '@nestjs/common';

import type { NoteRecord } from '../models/repository-records.models.js';
import {
  ProjectBriefFallbackReason,
  type ProjectBrief,
  type ProjectBriefContextItem,
  type ResolvedProjectBriefScope,
} from '../models/project-brief.models.js';
import type { ContentRepository } from '../ports/notes/content.repository.js';
import { resolveCanonicalTypeFromCategories } from '../../domain/note-classification.js';

const RAW_TEXT_LIMIT = 6_000;

export async function resolveProjectBriefScope(
  contentRepository: ContentRepository,
  userId: string,
  projectId: string,
  workspaceIdInput?: string,
): Promise<ResolvedProjectBriefScope> {
  if (projectId === 'all') {
    const workspace = await resolveTargetWorkspace(contentRepository, userId, workspaceIdInput);
    return {
      isAll: true,
      projectSlug: 'all',
      workspaceId: workspace.id,
      workspaceSlug: workspace.workspaceSlug,
    };
  }

  const project = await contentRepository.getProjectById(userId, projectId);
  if (!project || !project.enabled) {
    throw new NotFoundException('project_not_found');
  }

  return {
    isAll: false,
    projectSlug: project.projectSlug,
    workspaceId: project.workspaceId || '',
    workspaceSlug: project.workspaceSlug || '',
  };
}

async function resolveTargetWorkspace(
  contentRepository: ContentRepository,
  userId: string,
  workspaceIdInput?: string,
) {
  const workspaces = await contentRepository.listWorkspaces(userId);
  if (workspaceIdInput) {
    const found = workspaces.find((w) => w.id === workspaceIdInput);
    if (!found) {
      throw new NotFoundException('workspace_not_found');
    }
    return found;
  }

  if (workspaces.length === 0) {
    throw new NotFoundException('workspace_not_found');
  }

  return workspaces[0];
}

export function toProjectBriefContextItem(note: NoteRecord): ProjectBriefContextItem {
  return {
    noteId: note.id,
    title: note.title,
    summary: note.summary,
    type: resolveCanonicalTypeFromCategories(note.categories || [], (note.categories || []).map((c) => c.id)),
    status: note.status,
    sourceChannel: note.sourceChannel,
    tags: note.tags,
    date: note.occurredAt,
    path: note.path,
    rawText: truncate(String(note.metadata.rawText || ''), RAW_TEXT_LIMIT),
  };
}

export function toEmptyProjectBrief(projectSlug: string, generatedAt: string): ProjectBrief {
  return {
    projectSlug,
    generatedAt,
    summary: 'No recent project items were found in the current context window.',
    status: 'No recent activity available.',
    recentChanges: [],
    decisions: [],
    openItems: [],
    risks: [],
    nextSteps: ['Capture project notes, decisions, or operational events before generating the next brief.'],
    sources: [],
  };
}

export function toNormalizedBrief(brief: ProjectBrief, projectSlug: string, generatedAt: string, items: ProjectBriefContextItem[]): ProjectBrief {
  const allowedSources = new Map(items.map((item) => [item.noteId, item]));
  return {
    projectSlug,
    generatedAt,
    summary: String(brief.summary || '').trim(),
    status: String(brief.status || '').trim(),
    recentChanges: stringList(brief.recentChanges),
    decisions: stringList(brief.decisions),
    openItems: stringList(brief.openItems),
    risks: stringList(brief.risks),
    nextSteps: stringList(brief.nextSteps),
    sources: (brief.sources || [])
      .filter((source) => allowedSources.has(source.noteId))
      .map((source) => {
        const original = allowedSources.get(source.noteId);
        return {
          noteId: source.noteId,
          title: source.title || original?.title || '',
          path: source.path || original?.path || '',
          date: source.date || original?.date || '',
        };
      }),
  };
}

export function toSha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
