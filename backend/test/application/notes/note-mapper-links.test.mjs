import test from 'node:test';
import assert from 'node:assert/strict';

import { toIngestPayload } from '../../../dist/application/mappers/note.mapper.js';

test('manual note ingestion turns IDE paths and changedFiles into normalized links', () => {
  const payload = toIngestPayload(
    {
      projectId: 'project-1',
      title: 'Selected retry handler',
      rawText: 'Why this retry handler exists',
      tags: [],
      categoryIds: [],
      reminderAt: '',
      sourceChannel: 'ide',
      source: 'ide',
      sessionId: '',
      path: './src\\billing\\retry.ts',
      metadata: {
        changedFiles: [
          'src/billing/retry.ts',
          './src/billing/gateway.ts',
          'src/billing/gateway.ts',
        ],
      },
      attachments: [],
    },
    {
      categories: [],
      projectSlug: 'kote',
      workspaceSlug: 'default',
      reminderTimeZone: 'UTC',
    },
  );

  assert.deepEqual(payload.links, [
    'src/billing/retry.ts',
    'src/billing/gateway.ts',
  ]);
});
