import test from 'node:test';
import assert from 'node:assert/strict';

import { agentConversationBodySchema } from '../../../dist/interfaces/http/dto/operations.dto.js';
import { connectIntegrationBodySchema, githubAppCallbackQuerySchema, githubRepositoriesBodySchema, guidedIntegrationProviderSchema, integrationProviderSchema, resolveIntegrationCredentialBodySchema, sessionParamSchema } from '../../../dist/interfaces/http/dto/integration-credentials.dto.js';
import { reminderBoardQuerySchema, updateReminderStatusBodySchema } from '../../../dist/interfaces/http/dto/dashboard.dto.js';
import { markRemindersBodySchema, queryRequestSchema } from '../../../dist/interfaces/http/dto/query.dto.js';
import { createNoteBodySchema, noteIdParamSchema, updateNoteBodySchema } from '../../../dist/interfaces/http/dto/note.dto.js';
import { createProjectBodySchema, projectKnowledgeMapQuerySchema, projectSlugParamSchema, projectTimelineQuerySchema, updateProjectBodySchema } from '../../../dist/interfaces/http/dto/project.dto.js';
import { whatsappWebhookBodySchema } from '../../../dist/interfaces/http/dto/webhook.dto.js';
import { createWorkspaceBodySchema } from '../../../dist/interfaces/http/dto/workspace.dto.js';
import { askHistoryQuerySchema } from '../../../dist/interfaces/http/dto/ask.dto.js';

test('query dto normalizes limit', () => {
  const parsed = queryRequestSchema.parse({
    query: 'deploy',
    limit: '7',
  });

  assert.deepEqual(parsed, {
    query: 'deploy',
    limit: 7,
    status: 'open',
    page: 1,
    pageSize: 10,
  });
});

test('ask history dto accepts pagination', () => {
  assert.deepEqual(askHistoryQuerySchema.parse({ page: '2', pageSize: '10' }), {
    page: 2,
    pageSize: 10,
  });
  assert.deepEqual(askHistoryQuerySchema.parse({}), {
    page: 1,
    pageSize: 10,
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
    columnPage: { overdue: 1, upcoming: 1, resolved: 1, archived: 1 },
  });
  assert.deepEqual(reminderBoardQuerySchema.parse({
    workspaceSlug: 'Default Workspace',
    projectSlug: 'N8N Automations',
    limitPerColumn: '25',
    overduePage: '2',
    upcomingPage: '1',
    resolvedPage: '3',
    archivedPage: '1',
  }), {
    workspaceSlug: 'default-workspace',
    projectSlug: 'n8n-automations',
    limitPerColumn: 25,
    columnPage: { overdue: 2, upcoming: 1, resolved: 3, archived: 1 },
  });
  assert.deepEqual(updateReminderStatusBodySchema.parse({ status: 'overdue' }), { status: 'overdue' });
  assert.deepEqual(updateReminderStatusBodySchema.parse({ status: 'resolved' }), { status: 'resolved' });
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

test('create note dto normalizes project, tags and keeps reminderAt as transport input', () => {
  const parsed = createNoteBodySchema.parse({
    projectSlug: 'Acme API',
    title: 'Deploy',
    rawText: 'revisar deploy',
    tags: [' Deploy ', 'deploy'],
    reminderAt: '2026-04-29T09:30:00Z',
  });

  assert.equal(parsed.projectSlug, 'acme-api');
  assert.deepEqual(parsed.tags, ['deploy']);
  assert.equal(parsed.reminderAt, '2026-04-29T09:30:00Z');
  assert.equal(noteIdParamSchema.parse({ id: 'note-1' }).id, 'note-1');
  assert.deepEqual(updateNoteBodySchema.parse({ title: 'Deploy', rawText: 'texto', tags: [' Deploy '], reminderAt: '2026-04-29T09:30:00Z' }), {
    title: 'Deploy',
    rawText: 'texto',
    tags: ['deploy'],
    reminderAt: '2026-04-29T09:30:00Z',
    status: undefined,
    categoryIds: undefined,
    folderId: undefined,
    attachments: undefined,
  });
  assert.deepEqual(updateNoteBodySchema.parse({ title: 'Deploy', rawText: 'texto', status: 'active' }), {
    title: 'Deploy',
    rawText: 'texto',
    tags: [],
    reminderAt: '',
    status: 'active',
    categoryIds: undefined,
    folderId: undefined,
    attachments: undefined,
  });
  assert.deepEqual(createNoteBodySchema.parse({ projectSlug: 'acme', rawText: 'texto' }).categoryIds, []);
});

test('project timeline dto accepts known categories and optional folder filters only', () => {
  assert.deepEqual(projectTimelineQuerySchema.parse({ page: '2', pageSize: '10', category: 'manual', folderId: ' folder-1 ' }), {
    page: 2,
    pageSize: 10,
    category: 'manual',
    folderId: 'folder-1',
    status: 'open',
    orderByPin: true,
  });
  assert.deepEqual(projectTimelineQuerySchema.parse({}), {
    page: 1,
    pageSize: 10,
    category: 'all',
    status: 'open',
    orderByPin: true,
  });
  assert.deepEqual(projectTimelineQuerySchema.parse({ orderByPin: 'false' }), {
    page: 1,
    pageSize: 10,
    category: 'all',
    status: 'open',
    orderByPin: false,
  });
  assert.throws(() => projectTimelineQuerySchema.parse({ category: 'webhook' }));
});

test('project knowledge map dto accepts bounded limit and project filters', () => {
  assert.deepEqual(projectKnowledgeMapQuerySchema.parse({ limit: '120', category: 'github', folderId: ' folder-1 ' }), {
    limit: 120,
    category: 'github',
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
