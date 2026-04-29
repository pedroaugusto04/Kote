import crypto from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { CanonicalType, EventType, Importance, KnowledgeKind, KnowledgeStatus, SourceChannel } from '../../../contracts/enums.js';
import type { IngestPayload } from '../../../contracts/ingest.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';

export type CreateManualNoteInput = {
  projectSlug: string;
  title: string;
  rawText: string;
  tags: string[];
  reminderDate: string;
  reminderTime: string;
};

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
      schemaVersion: 1,
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
        followUpBy: '',
      },
      metadata: {
        workspaceSlug: workspace.workspaceSlug,
        manual: true,
      },
    };

    return this.ingestEntryUseCase.execute(payload, userId, workspace.workspaceSlug);
  }
}
