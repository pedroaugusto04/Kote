import crypto from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { CanonicalType, KnowledgeStatus } from '../../../contracts/enums.js';
import { withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { buildNotePaths, renderEventNote, renderReminderNote } from '../../../domain/notes.js';
import type { Project } from '../../../domain/projects.js';
import { slugify, trimText } from '../../../domain/strings.js';
import { ContentRepository } from '../../ports/content.repository.js';

@Injectable()
export class IngestEntryUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(input: IngestPayload, userId: string, workspaceSlug = '') {
    return saveIngestedNote(this.contentRepository, userId, input, workspaceSlug);
  }
}

function projectFromPayload(payload: IngestPayload, workspaceSlug: string): Project {
  const projectSlug = slugify(payload.event.projectSlug) || 'inbox';
  return {
    projectSlug,
    displayName: payload.event.projectSlug || 'Inbox',
    repositories: [{
      id: '',
      workspaceSlug,
      externalId: '0',
      fullName: String(payload.metadata.repoFullName || ''),
      htmlUrl: null,
      description: null,
      defaultBranch: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }],
    workspaceSlug,
    aliases: [],
    defaultTags: [],
    enabled: true,
  };
}

async function saveIngestedNote(contentRepository: ContentRepository, userId: string, input: IngestPayload, workspaceSlugOverride = '') {
  const parsed = withDerivedReminderAt(input);
  const workspaceSlug = slugify(workspaceSlugOverride || String(parsed.metadata.workspaceSlug || 'default')) || 'default';
  const workspace = (await contentRepository.listWorkspaces(userId)).find((item) => item.workspaceSlug === workspaceSlug);
  if (!workspace) throw new NotFoundException('workspace_not_found');
  const existingProject = (await contentRepository.listProjects(userId)).find(
    (item) => item.enabled && item.workspaceSlug === workspaceSlug && item.projectSlug === parsed.event.projectSlug,
  );
  const project = existingProject || projectFromPayload(parsed, workspaceSlug);
  const payload = {
    ...parsed,
    event: {
      ...parsed.event,
      projectSlug: project.projectSlug,
    },
    classification: {
      ...parsed.classification,
      status: parsed.classification.status || KnowledgeStatus.Active,
      tags: Array.from(new Set([project.projectSlug, ...project.defaultTags, ...parsed.classification.tags].map((tag) => slugify(tag)).filter(Boolean))),
    },
  };
  const paths = buildNotePaths(project, payload);
  const markdown = renderEventNote(project, payload, paths);
  const title = trimText(payload.content.title, payload.content.rawText);
  if (!existingProject) {
    if (project.repositories.length > 0) {
      const repo = project.repositories[0];
      const savedRepo = await contentRepository.upsertRepository({
        workspaceSlug: repo.workspaceSlug,
        externalId: repo.externalId,
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        description: repo.description,
        defaultBranch: repo.defaultBranch,
      });
      project.repositories[0] = savedRepo;
    }
    await contentRepository.upsertProject(userId, project);
  }
  const note = await contentRepository.upsertNote(userId, {
    path: paths.eventRelativePath.replace(/\\/g, '/'),
    type: CanonicalType.Event,
    title,
    projectSlug: project.projectSlug,
    workspaceSlug,
    status: payload.classification.status || KnowledgeStatus.Active,
    tags: payload.classification.tags,
    occurredAt: payload.event.occurredAt,
    sourceChannel: payload.source.channel,
    summary: payload.content.sections.summary || payload.content.rawText,
    markdown,
    frontmatter: {
      id: payload.source.correlationId,
      type: CanonicalType.Event,
      workspace: workspaceSlug,
      source_channel: payload.source.channel,
      event_type: payload.event.type,
      project: project.projectSlug,
      status: payload.classification.status,
      tags: payload.classification.tags,
      occurred_at: payload.event.occurredAt,
    },
    metadata: {
      ...payload.metadata,
      eventType: payload.event.type,
      impact: payload.content.sections.impact,
      reviewFindings: payload.content.sections.reviewFindings,
      reminderDate: payload.actions.reminderDate,
      reminderTime: payload.actions.reminderTime,
      reminderAt: payload.actions.reminderAt,
    },
    origin: 'postgres',
    source: payload.source.system,
    links: [paths.canonicalRelativePath, paths.followupRelativePath, paths.reminderRelativePath].filter(Boolean),
  });
  const attachments = await Promise.all(
    payload.content.attachments.map((attachment) =>
      contentRepository.saveAttachment(userId, {
        noteId: note.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        dataBase64: attachment.dataBase64,
        checksumSha256: crypto.createHash('sha256').update(attachment.dataBase64 || '', 'base64').digest('hex'),
        metadata: { sourceCorrelationId: payload.source.correlationId },
      }),
    ),
  );
  let reminderNoteId = '';
  if (payload.actions.reminderDate) {
    const reminderMarkdown = renderReminderNote(project, payload, note.path, payload.actions.reminderAt);
    const reminder = await contentRepository.upsertNote(userId, {
      path: paths.reminderRelativePath.replace(/\\/g, '/'),
      type: CanonicalType.Reminder,
      title: `Reminder ${title}`,
      projectSlug: project.projectSlug,
      workspaceSlug,
      status: KnowledgeStatus.Open,
      tags: payload.classification.tags,
      occurredAt: payload.actions.reminderAt || payload.actions.reminderDate,
      sourceChannel: payload.source.channel,
      summary: title,
      markdown: reminderMarkdown,
      frontmatter: {
        id: payload.source.correlationId,
        type: CanonicalType.Reminder,
        workspace: workspaceSlug,
        project: project.projectSlug,
        status: KnowledgeStatus.Open,
        reminder_date: payload.actions.reminderDate,
        reminder_time: payload.actions.reminderTime,
        reminder_at: payload.actions.reminderAt,
      },
      metadata: {
        sourceNotePath: note.path,
        reminderDate: payload.actions.reminderDate,
        reminderTime: payload.actions.reminderTime,
        reminderAt: payload.actions.reminderAt,
      },
      origin: 'postgres',
      source: payload.source.system,
      links: [note.path],
    });
    reminderNoteId = reminder.id;
  }
  return {
    ok: true,
    project: project.projectSlug,
    noteId: note.id,
    reminderNoteId,
    eventPath: note.path,
    canonicalPath: paths.canonicalRelativePath.replace(/\\/g, '/'),
    followupPath: paths.followupRelativePath.replace(/\\/g, '/'),
    reminderPath: paths.reminderRelativePath.replace(/\\/g, '/'),
    dailyPath: paths.dailyRelativePath.replace(/\\/g, '/'),
    attachmentIds: attachments.map((attachment) => attachment.id),
    assetPaths: [],
    gitStatus: 'not_used_postgres',
  };
}
