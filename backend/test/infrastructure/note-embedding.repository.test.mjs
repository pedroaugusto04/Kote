import test from 'node:test';
import assert from 'node:assert/strict';

import { PostgresNoteEmbeddingRepository } from '../../dist/infrastructure/repositories/note-embedding.repository.js';

test('findSimilar filters note embeddings by workspace and project ids', async () => {
  const queries = [];
  const database = {
    getPool() {
      return {
        async query(sql, params) {
          queries.push({ sql, params });
          return { rows: [] };
        },
      };
    },
  };

  const repository = new PostgresNoteEmbeddingRepository(database);
  const result = await repository.findSimilar('user-1', [0.1, 0.2], {
    limit: 8,
    minSimilarity: 0.65,
    workspaceId: 'workspace-id',
    projectId: 'project-id',
  });

  assert.deepEqual(result, []);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /n\.workspace_id = \$5/);
  assert.match(queries[0].sql, /n\.project_id = \$6/);
  assert.deepEqual(queries[0].params, ['user-1', '[0.1,0.2]', 0.65, 8, 'workspace-id', 'project-id']);
});

test('findSimilar resolves workspace and project slugs before applying uuid filters', async () => {
  const queries = [];
  let selectCalls = 0;
  const database = {
    getDb() {
      return {
        select() {
          selectCalls += 1;
          return {
            from() {
              return {
                where() {
                  return {
                    async limit() {
                      return [{ id: selectCalls === 1 ? 'resolved-workspace-id' : 'resolved-project-id' }];
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    getPool() {
      return {
        async query(sql, params) {
          queries.push({ sql, params });
          return { rows: [] };
        },
      };
    },
  };

  const repository = new PostgresNoteEmbeddingRepository(database);
  const result = await repository.findSimilar('user-1', [0.1, 0.2], {
    limit: 8,
    minSimilarity: 0.65,
    workspaceSlug: 'workspace1',
    projectSlug: 'project1',
  });

  assert.deepEqual(result, []);
  assert.equal(selectCalls, 2);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /n\.workspace_id = \$5/);
  assert.match(queries[0].sql, /n\.project_id = \$6/);
  assert.deepEqual(queries[0].params, ['user-1', '[0.1,0.2]', 0.65, 8, 'resolved-workspace-id', 'resolved-project-id']);
});
