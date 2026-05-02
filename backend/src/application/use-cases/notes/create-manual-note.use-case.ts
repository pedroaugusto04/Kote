import crypto from 'node:crypto';

import { NotFoundException, Injectable } from '@nestjs/common';

import { CanonicalType, EventType, Importance, KnowledgeKind, KnowledgeStatus, SourceChannel } from '../../../contracts/enums.js';
import { withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import type { CreateManualNoteInput } from '../../models/note-input.models.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';

@Injectable()
export class CreateManualNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
  ) {}

  async execute(input: CreateManualNoteInput, userId: string) {
    const workspaces = await this.contentRepository.listWorkspaces(userId);
    const workspace = workspaces[0];
    if (!workspace) throw new NotFoundException('workspace_not_found');

    const projects = await this.contentRepository.listProjects(userId);
    const project = projects.find((item) => item.enabled && item.workspaceSlug === workspace.workspaceSlug && item.projectSlug === input.projectSlug);
    if (!project) throw new NotFoundException('project_not_found');

    const occurredAt = new Date().toISOString();
    const payload: IngestPayload = {
      source: {
        channel: SourceChannel.External,
        system: 'manual-api',
        actor: '',
        conversationId: workspace.workspaceSlug,
        correlationId: `manual:${crypto.randomUUID()}`,
      },
      event: {
        type: EventType.ManualNote,
        occurredAt,
        projectSlug: project.projectSlug,
      },
      content: {
        rawText: input.rawText,
        title: input.title,
        attachments: [],
        sections: {
          summary: input.rawText,
          impact: '',
          risks: [],
          nextSteps: [],
          reviewFindings: [],
        },
      },
      classification: {
        kind: KnowledgeKind.Note,
        canonicalType: CanonicalType.Event,
        importance: Importance.Low,
        status: KnowledgeStatus.Active,
        tags: input.tags,
        decisionFlag: false,
      },
      actions: {
        reminderDate: input.reminderDate,
        reminderTime: input.reminderTime,
        reminderAt: input.reminderAt || '',
        followUpBy: '',
      },
      metadata: {
        workspaceSlug: workspace.workspaceSlug,
        manual: true,
        rawText: input.rawText,
      },
    };

    return this.ingestEntryUseCase.execute(withDerivedReminderAt(payload), userId, workspace.workspaceSlug);
  }
}
