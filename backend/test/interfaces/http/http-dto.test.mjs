import test from 'node:test';
import assert from 'node:assert/strict';

import { conversationBodySchema } from '../../../dist/interfaces/http/dto/operations.dto.js';
import { connectIntegrationBodySchema, githubAppCallbackQuerySchema, githubRepositoriesBodySchema, guidedIntegrationProviderSchema, integrationProviderSchema, resolveIntegrationCredentialBodySchema, sessionParamSchema } from '../../../dist/interfaces/http/dto/integration-credentials.dto.js';
import { internalN8nIngestBodySchema } from '../../../dist/interfaces/http/dto/internal-n8n.dto.js';
import { markRemindersBodySchema, queryRequestSchema } from '../../../dist/interfaces/http/dto/query.dto.js';
import { createNoteBodySchema } from '../../../dist/interfaces/http/dto/note.dto.js';
import { createProjectBodySchema } from '../../../dist/interfaces/http/dto/project.dto.js';
import { createWorkspaceBodySchema } from '../../../dist/interfaces/http/dto/workspace.dto.js';

test('query dto normalizes limit and slugs', () => {
  const parsed = queryRequestSchema.parse({
    query: 'deploy',
    limit: '7',
    mode: 'answer',
    workspaceSlug: 'My Workspace',
    projectSlug: 'N8N Automations',
  });

  assert.deepEqual(parsed, {
    query: 'deploy',
    limit: 7,
    mode: 'answer',
    workspaceSlug: 'my-workspace',
    projectSlug: 'n8n-automations',
  });
});

test('mark-sent dto requires ids array', () => {
  assert.throws(() => markRemindersBodySchema.parse({ ids: 'one' }));
  assert.deepEqual(markRemindersBodySchema.parse({ ids: ['one', ' two '] }), { ids: ['one', 'two'] });
});

test('create workspace dto normalizes slug from display name', () => {
  const parsed = createWorkspaceBodySchema.parse({
    displayName: 'Acme Team',
  });

  assert.equal(parsed.workspaceSlug, 'acme-team');
  assert.equal(parsed.displayName, 'Acme Team');
});

test('create project dto normalizes slug, aliases and default tags', () => {
  const parsed = createProjectBodySchema.parse({
    displayName: 'Acme API',
    repoFullName: 'acme/api',
    aliases: [' api ', 'api'],
    defaultTags: [' Backend ', 'backend'],
  });

  assert.deepEqual(parsed, {
    displayName: 'Acme API',
    projectSlug: 'acme-api',
    repoFullName: 'acme/api',
    aliases: ['api'],
    defaultTags: ['backend'],
  });
});

test('create note dto normalizes project, tags and reminder fields', () => {
  const parsed = createNoteBodySchema.parse({
    projectSlug: 'Acme API',
    title: 'Deploy',
    rawText: 'revisar deploy',
    tags: [' Deploy ', 'deploy'],
    reminderDate: '29/04/2026',
    reminderTime: '9:30',
  });

  assert.equal(parsed.projectSlug, 'acme-api');
  assert.deepEqual(parsed.tags, ['deploy']);
  assert.equal(parsed.reminderDate, '2026-04-29');
  assert.equal(parsed.reminderTime, '09:30');
  assert.throws(() => createNoteBodySchema.parse({ projectSlug: 'acme', rawText: 'texto', reminderTime: '09:00' }));
});

test('conversation dto accepts valid payloads', () => {
  const parsed = conversationBodySchema.parse({
    senderId: 'sender-1',
    groupId: 'group-1',
    messageText: 'deploy pronto',
  });

  assert.equal(parsed.senderId, 'sender-1');
  assert.equal(parsed.messageText, 'deploy pronto');
});

test('internal n8n ingest dto accepts direct and wrapped payloads', () => {
  const payload = {
    schemaVersion: 1,
    source: { channel: 'external', system: 'test', actor: '', conversationId: '', correlationId: 'corr-1' },
    event: { type: 'manual_note', occurredAt: '2026-04-27T10:00:00.000Z', projectSlug: 'N8N Automations' },
    content: { rawText: 'texto', title: '', attachments: [], sections: {} },
    classification: { kind: 'note', canonicalType: 'event', importance: 'low', tags: [], decisionFlag: false },
    actions: {},
    metadata: {},
  };

  assert.equal(internalN8nIngestBodySchema.parse(payload).payload.event.projectSlug, 'n8n-automations');
  assert.equal(internalN8nIngestBodySchema.parse({ payload, externalId: '123' }).payload.event.projectSlug, 'n8n-automations');
});

test('integration dto rejects invalid provider and invalid resolve payload', () => {
  assert.throws(() => integrationProviderSchema.parse('invalid'));
  assert.throws(() => integrationProviderSchema.parse('github'));
  assert.throws(() => integrationProviderSchema.parse('evolution'));
  assert.throws(() => resolveIntegrationCredentialBodySchema.parse({ workspaceSlug: 'default' }));
});

test('integration dto accepts guided connection payloads', () => {
  assert.throws(() => connectIntegrationBodySchema.parse({}));
  assert.deepEqual(connectIntegrationBodySchema.parse({ workspaceSlug: 'team_1', returnToPath: '/setup' }), { workspaceSlug: 'team_1', returnToPath: '/setup' });
  assert.throws(() => connectIntegrationBodySchema.parse({ workspaceSlug: 'team_1', returnToPath: 'https://evil.example.com' }));
  assert.equal(guidedIntegrationProviderSchema.parse('telegram'), 'telegram');
  assert.equal(guidedIntegrationProviderSchema.parse('ai-review'), 'ai-review');
  assert.equal(githubAppCallbackQuerySchema.parse({ state: 'state', code: 'code', installation_id: 123 }).installation_id, '123');
  assert.equal(sessionParamSchema.parse({ provider: 'whatsapp', sessionId: '00000000-0000-4000-8000-000000000000' }).provider, 'whatsapp');
  assert.deepEqual(githubRepositoriesBodySchema.parse({ workspaceSlug: 'team_1', repositories: ['acme/api', 'acme/api'] }), { workspaceSlug: 'team_1', repositories: ['acme/api'] });
});
