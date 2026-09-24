import test from 'node:test';
import assert from 'node:assert/strict';

import { PostgresNoteSynthesisRepository } from '../../dist/infrastructure/repositories/note-synthesis.repository.js';

test('listProjectDecisions uses the normalized timestamp occurred_at column', async () => {
  const queries = [];
  const database = {
    getPool() {
      return {
        async query(query, params) {
          queries.push({ query, params });
          if (queries.length === 1) {
            return {
              rows: [{
                note_id: 'note-1',
                generated_at: '2026-09-24T12:00:00.000Z',
                provider: 'test',
                model: 'test-model',
                note_title: 'Decision',
                note_path: 'notes/decision.md',
                source_channel: 'test',
                source: 'test',
                occurred_at: '2026-09-24T12:00:00.000Z',
                project_slug: 'kote',
                item_index: '1',
                kind: 'decision',
                text: 'Use the normalized date expression.',
                status: 'current',
                turn_refs: [],
                files: [],
                entities: [],
                total_count: '1',
              }],
            };
          }
          return { rows: [] };
        },
      };
    },
  };

  const result = await new PostgresNoteSynthesisRepository(database).listProjectDecisions('user-1', {
    projectSlug: 'kote',
    page: 1,
    pageSize: 15,
  });

  assert.match(queries[0].query, /COALESCE\(n\.occurred_at, n\.created_at\)/i);
  assert.equal(result.items[0].occurredAt, '2026-09-24T12:00:00.000Z');
});
