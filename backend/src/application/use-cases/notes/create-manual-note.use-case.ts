import crypto from 'node:crypto';

import { NotFoundException, Injectable } from '@nestjs/common';

import { CanonicalType, EventType, Importance, KnowledgeKind, KnowledgeStatus, SourceChannel } from '../../../contracts/enums.js';
import { withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { hasReminder, normalizeManualNoteStatus } from '../../../domain/note-status.js';
import { normalizeDate, normalizeTime } from '../../../domain/time.js';
import type { CreateManualNoteInput } from '../../models/note-input.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';

@Injectable()
export class CreateManualNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(input: CreateManualNoteInput, userId: string) {
    const workspaces = await this.contentRepository.listWorkspaces(userId);
    const workspace = workspaces[0];
    if (!workspace) throw new NotFoundException('workspace_not_found');

    const projects = await this.contentRepository.listProjects(userId);
    const project = projects.find((item) => item.enabled && item.workspaceSlug === workspace.workspaceSlug && item.projectSlug === input.projectSlug);
    if (!project) throw new NotFoundException('project_not_found');

    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
    const reminderDate = normalizeDate(input.reminderDate, reminderTimeZone);
    const reminderTime = normalizeTime(input.reminderTime);
    const reminderAt = input.reminderAt || '';
    const status = normalizeManualNoteStatus({
      requestedStatus: input.status,
      currentStatus: KnowledgeStatus.Active,
      hadReminder: false,
      hasReminder: hasReminder({ reminderDate, reminderAt }),
    });
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
        canonicalType: normalizeManualCanonicalType(input.canonicalType),
        importance: Importance.Low,
        status,
        tags: input.tags,
        decisionFlag: false,
      },
      actions: {
        reminderDate,
        reminderTime,
        reminderAt,
        followUpBy: '',
      },
      metadata: {
        workspaceSlug: workspace.workspaceSlug,
        manual: true,
        rawText: input.rawText,
      },
    };

    return this.ingestEntryUseCase.execute(withDerivedReminderAt(payload, reminderTimeZone), userId, workspace.workspaceSlug, {
      folderId: input.folderId,
    });
  }
}

function normalizeManualCanonicalType(value: string | undefined) {
  if (value && Object.values(CanonicalType).includes(value as CanonicalType)) return value as CanonicalType;
  return CanonicalType.Event;
}
