import test from 'node:test';
import assert from 'node:assert/strict';

import { agentConversationBodySchema } from '../../../dist/interfaces/http/dto/operations.dto.js';
import { connectIntegrationBodySchema, githubAppCallbackQuerySchema, githubRepositoriesBodySchema, guidedIntegrationProviderSchema, integrationProviderSchema, resolveIntegrationCredentialBodySchema, sessionParamSchema } from '../../../dist/interfaces/http/dto/integration-credentials.dto.js';
import { internalN8nIngestBodySchema } from '../../../dist/interfaces/http/dto/internal-n8n.dto.js';
import { reminderBoardQuerySchema, updateReminderStatusBodySchema } from '../../../dist/interfaces/http/dto/dashboard.dto.js';
import { markRemindersBodySchema, queryRequestSchema } from '../../../dist/interfaces/http/dto/query.dto.js';
import { createNoteBodySchema, noteIdParamSchema, updateNoteBodySchema } from '../../../dist/interfaces/http/dto/note.dto.js';
import { createProjectBodySchema, projectKnowledgeMapQuerySchema, projectSlugParamSchema, projectTimelineQuerySchema, updateProjectBodySchema } from '../../../dist/interfaces/http/dto/project.dto.js';
import { whatsappWebhookBodySchema } from '../../../dist/interfaces/http/dto/webhook.dto.js';
import { createWorkspaceBodySchema } from '../../../dist/interfaces/http/dto/workspace.dto.js';
import { askHistoryQuerySchema } from '../../../dist/interfaces/http/dto/ask.dto.js';

test('query dto normalizes limit and slugs', () => {
  const parsed = queryRequestSchema.parse({
    query: 'deploy',
    limit: '7',
    workspaceSlug: 'My Workspace',
    projectSlug: 'N8N Automations',
  });

  assert.deepEqual(parsed, {
    query: 'deploy',
    limit: 7,
    workspaceSlug: 'my-workspace',
    projectSlug: 'n8n-automations',
    status: '',
    page: 1,
    pageSize: 10,
  });
});

test('ask history dto accepts pagination and optional project filter', () => {
  assert.deepEqual(askHistoryQuerySchema.parse({ page: '2', pageSize: '10', projectSlug: ' platform ' }), {
    page: 2,
    pageSize: 10,
    projectSlug: 'platform',
  });
  assert.deepEqual(askHistoryQuerySchema.parse({}), {
    page: 1,
    pageSize: 10,
    projectSlug: '',
  });
  assert.throws(() => askHistoryQuerySchema.parse({ page: '0' }));
});

test('mark-sent dto requires ids array', () => {
  assert.throws(() => markRemindersBodySchema.parse({ ids: 'one' }));
  assert.deepEqual(markRemindersBodySchema.parse({ ids: ['one', ' two '], mode: 'exact', dispatchKey: '2026-05-08T11:00' }), {
    ids: ['one', 'two'],
    mode: 'exact',
    dispatchKey: '2026-05-08T11:00',
  });
});

test('reminder board dto normalizes filters and status updates', () => {
  assert.deepEqual(reminderBoardQuerySchema.parse({
    workspaceSlug: 'Default Workspace',
    projectSlug: 'N8N Automations',
    limitPerColumn: '25',
  }), {
    workspaceSlug: 'default-workspace',
    projectSlug: 'n8n-automations',
    limitPerColumn: 25,
  });
  assert.throws(() => reminderBoardQuerySchema.parse({ limitPerColumn: '100' }));
  assert.deepEqual(updateReminderStatusBodySchema.parse({ status: 'overdue' }), { status: 'overdue' });
  assert.deepEqual(updateReminderStatusBodySchema.parse({ status: 'resolved' }), { status: 'resolved' });
  assert.throws(() => updateReminderStatusBodySchema.parse({ status: 'sent' }));
  assert.throws(() => updateReminderStatusBodySchema.parse({ status: 'active' }));
});

test('create workspace dto normalizes slug from display name', () => {
  const parsed = createWorkspaceBodySchema.parse({
    displayName: 'Acme Team',
  });

  assert.equal(parsed.workspaceSlug, 'acme-team');
  assert.equal(parsed.displayName, 'Acme Team');
});

test('create project dto normalizes slug and default tags', () => {
  const parsed = createProjectBodySchema.parse({
    displayName: 'Acme API',
    repositoryIds: ['00000000-0000-0000-0000-000000000000'],
    defaultTags: [' Backend ', 'backend'],
  });

  assert.deepEqual(parsed, {
    displayName: 'Acme API',
    projectSlug: 'acme-api',
    repositoryIds: ['00000000-0000-0000-0000-000000000000'],
    defaultTags: ['backend'],
  });
  assert.equal(projectSlugParamSchema.parse({ projectSlug: 'Acme API' }).projectSlug, 'acme-api');
  assert.deepEqual(updateProjectBodySchema.parse({ displayName: 'Acme API', defaultTags: [' Backend '] }), {
    displayName: 'Acme API',
    repositoryIds: [],
    defaultTags: ['backend'],
  });
});

test('create note dto normalizes project, tags and keeps reminder date as transport input', () => {
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
  assert.equal(parsed.reminderDate, '29/04/2026');
  assert.equal(parsed.reminderTime, '09:30');
  assert.throws(() => createNoteBodySchema.parse({ projectSlug: 'acme', rawText: 'texto', reminderTime: '09:00' }));
  assert.equal(noteIdParamSchema.parse({ id: 'note-1' }).id, 'note-1');
  assert.deepEqual(updateNoteBodySchema.parse({ title: 'Deploy', rawText: 'texto', tags: [' Deploy '], reminderDate: '29/04/2026', reminderTime: '9:30' }), {
    title: 'Deploy',
    rawText: 'texto',
    tags: ['deploy'],
    reminderDate: '29/04/2026',
    reminderTime: '09:30',
    reminderAt: '',
    status: undefined,
    canonicalType: 'event',
    folderId: undefined,
  });
  assert.deepEqual(updateNoteBodySchema.parse({ title: 'Deploy', rawText: 'texto', status: 'active' }), {
    title: 'Deploy',
    rawText: 'texto',
    tags: [],
    reminderDate: '',
    reminderTime: '',
    reminderAt: '',
    status: 'active',
    canonicalType: 'event',
    folderId: undefined,
  });
  assert.equal(createNoteBodySchema.parse({ projectSlug: 'acme', rawText: 'decidido', canonicalType: 'decision' }).canonicalType, 'decision');
  assert.throws(() => createNoteBodySchema.parse({ projectSlug: 'acme', rawText: 'texto', canonicalType: 'unsupported' }));
});

test('project timeline dto accepts known categories and optional folder filters only', () => {
  assert.deepEqual(projectTimelineQuerySchema.parse({ page: '2', pageSize: '10', category: 'decision', folderId: ' folder-1 ' }), {
    page: 2,
    pageSize: 10,
    category: 'decision',
    folderId: 'folder-1',
    status: 'open',
  });
  assert.deepEqual(projectTimelineQuerySchema.parse({}), {
    page: 1,
    pageSize: 10,
    category: 'all',
    status: 'open',
  });
  assert.throws(() => projectTimelineQuerySchema.parse({ category: 'webhook' }));
});

test('project knowledge map dto accepts bounded limit and project filters', () => {
  assert.deepEqual(projectKnowledgeMapQuerySchema.parse({ limit: '120', category: 'github-push', folderId: ' folder-1 ' }), {
    limit: 120,
    category: 'github-push',
    folderId: 'folder-1',
  });
  assert.deepEqual(projectKnowledgeMapQuerySchema.parse({}), {
    limit: 80,
    category: 'all',
  });
  assert.throws(() => projectKnowledgeMapQuerySchema.parse({ limit: '0' }));
  assert.throws(() => projectKnowledgeMapQuerySchema.parse({ limit: '151' }));
  assert.throws(() => projectKnowledgeMapQuerySchema.parse({ category: 'webhook' }));
});

test('agent conversation dto accepts valid payloads', () => {
  const parsed = agentConversationBodySchema.parse({
    senderId: 'sender-1',
    chatId: 'group-1',
    messageText: 'deploy pronto',
  });

  assert.equal(parsed.senderId, 'sender-1');
  assert.equal(parsed.messageText, 'deploy pronto');
});

test('internal n8n ingest dto accepts direct and wrapped payloads', () => {
  const payload = {
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

test('whatsapp webhook dto rejects canonical ingest payloads', () => {
  assert.throws(() => whatsappWebhookBodySchema.parse({
    source: { channel: 'whatsapp', system: 'test', actor: '', conversationId: '120363@g.us', correlationId: 'corr-1' },
    event: { type: 'manual_note', occurredAt: '2026-04-27T10:00:00.000Z', projectSlug: 'n8n' },
    content: { rawText: 'texto', title: '', attachments: [], sections: {} },
    classification: { kind: 'note', canonicalType: 'event', importance: 'low', tags: [], decisionFlag: false },
    actions: {},
    metadata: {},
  }));
  assert.equal(whatsappWebhookBodySchema.parse({ event: 'MESSAGES_UPSERT', data: { key: { remoteJid: '120363@g.us' }, message: { conversation: 'oi' } } }).event, 'MESSAGES_UPSERT');
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
  assert.equal(guidedIntegrationProviderSchema.parse('project-brief-ai'), 'project-brief-ai');
  assert.equal(githubAppCallbackQuerySchema.parse({ state: 'state', installation_id: 123, setup_action: 'install' }).installation_id, '123');
  assert.equal(sessionParamSchema.parse({ provider: 'whatsapp', sessionId: '00000000-0000-4000-8000-000000000000' }).provider, 'whatsapp');
  assert.deepEqual(githubRepositoriesBodySchema.parse({ workspaceSlug: 'team_1', repositories: [{ id: '1', fullName: 'acme/api' }] }), { workspaceSlug: 'team_1', repositories: [{ id: '1', fullName: 'acme/api' }] });
});
