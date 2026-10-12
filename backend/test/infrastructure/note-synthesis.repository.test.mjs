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

test('getByNoteIds queries using s.note_id::text to prevent uuid = text operator mismatch', async () => {
  const queries = [];
  const database = {
    getPool() {
      return {
        async query(query, params) {
          queries.push({ query, params });
          return {
            rows: [
              {
                id: 'synth-1',
                user_id: 'user-1',
                note_id: 'note-1',
                status: 'completed',
                mode: 'ai',
                overview: 'Overview 1',
                memory: [],
                source_hash: 'hash-1',
                provider: 'test',
                model: 'model-1',
                generated_at: '2026-10-13T12:00:00.000Z',
                created_at: '2026-10-13T12:00:00.000Z',
                updated_at: '2026-10-13T12:00:00.000Z',
              },
            ],
          };
        },
      };
    },
  };

  const repository = new PostgresNoteSynthesisRepository(database);
  const result = await repository.getByNoteIds('user-1', ['note-1']);

  assert.match(queries[0].query, /s\.note_id::text\s*=\s*ANY\(\$2::text\[\]\)/i);
  assert.deepEqual(queries[0].params, ['user-1', ['note-1']]);
  assert.equal(result.size, 1);
  assert.equal(result.get('note-1')?.overview, 'Overview 1');
});

test('PostgresNoteSynthesisRepository.getByNoteIds executes successfully against real Postgres without uuid = text error', async (t) => {
  const { createPostgresTestRepositories } = await import('../helpers/postgres-test-repositories.mjs');
  const crypto = await import('node:crypto');
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const noteId = crypto.randomUUID();

  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
    id: crypto.randomUUID(),
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '120363@g.us',
    telegramChatId: 'telegram-chat-1',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
  });
  const project = await repositories.contentRepository.upsertProject(user.id, {
    id: crypto.randomUUID(),
    projectSlug: 'acme',
    displayName: 'Acme',
    workspaceId: workspace.id,
    workspaceSlug: 'default',
    repositories: [],
    defaultTags: [],
    enabled: true,
    favorite: false,
  });
  const note = await repositories.contentRepository.upsertNote(user.id, {
    id: noteId,
    projectId: project.id,
    workspaceId: workspace.id,
    path: '20 Inbox/acme/2026/04/item.md',
    type: 'event',
    title: 'Test Note',
    projectSlug: 'acme',
    workspaceSlug: 'default',
    status: 'pending',
    tags: ['test'],
    occurredAt: '2026-04-28',
    sourceChannel: 'ai_chat',
    summary: 'Test summary',
    markdown: '# Content',
    frontmatter: {},
  });

  const synthesisRepo = new PostgresNoteSynthesisRepository(repositories.database);
  await synthesisRepo.upsertPending({
    userId: user.id,
    noteId: note.id,
    sourceHash: 'hash-abc',
    mode: 'ai',
  });

  const result = await synthesisRepo.getByNoteIds(user.id, [note.id]);
  assert.equal(result.size, 1);
  assert.ok(result.has(note.id));
});


