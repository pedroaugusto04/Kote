import test from 'node:test';
import assert from 'node:assert/strict';

import { IngestEntryUseCase } from '../../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

function payload() {
  return {
    source: {
      channel: 'n8n-workflow',
      system: 'test-suite',
      conversationId: 'conv',
      correlationId: 'corr-ingest',
    },
    event: {
      type: 'manual_note',
      occurredAt: '2026-04-27T10:00:00.000Z',
      projectSlug: 'n8n-automations',
    },
    content: {
      rawText: 'revisar rollout do deploy',
      title: 'Deploy rollout',
      attachments: [
        {
          fileName: 'sample.txt',
          mimeType: 'text/plain',
          sizeBytes: 11,
          dataBase64: Buffer.from('hello world').toString('base64'),
        },
      ],
      sections: {
        summary: 'Deploy needs coordinated rollout.',
        impact: 'Can affect webhook availability.',
        risks: ['Downtime'],
        nextSteps: ['Check production logs'],
        reviewFindings: [],
      },
    },
    classification: {
      kind: 'summary',
      canonicalType: 'knowledge',
      importance: 'medium',
      status: 'active',
      tags: ['deploy'],
    },
    actions: {
      reminderAt: '2026-04-28T09:30:00.000Z',
    },
    metadata: {},
  };
}

test('ingest fails when the target workspace does not exist', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();

  await assert.rejects(
    () => new IngestEntryUseCase(
      repositories.contentRepository,
      repositories.runtimeEnvironmentProvider,
      repositories.noteLifecycleService,
      repositories.transactionManager,
      repositories.scopeResolver,
    ).execute(payload(), user.id, 'default'),
    /workspace_not_found/,
  );
});