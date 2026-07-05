import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGithubAppCallbackPath } from '../../../dist/adapters/environment.js';
import { ApplicationAccessController, DashboardController, GithubAppCallbackController, HealthController, NotesController, OperationsController, ProjectsController, WorkspacesController } from '../../../dist/interfaces/http/controllers/index.js';

test('health controller exposes service status', () => {
  const controller = new HealthController();

  assert.deepEqual(controller.health(), { ok: true, service: 'kote' });
});

test('application access controller logs landing page visits through the use case', async () => {
  const calls = [];
  const controller = new ApplicationAccessController({
    execute: async (input) => {
      calls.push(input);
    },
  });

  const result = await controller.logAccess(
    { page: 'landing' },
    {
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'user-agent': 'Vitest',
        referer: 'https://kb.example.com/',
      },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.2' },
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{
    page: 'landing',
    ip: '203.0.113.10',
    userAgent: 'Vitest',
    referrer: 'https://kb.example.com/',
  }]);
});

test('github callback path normalization supports explicit URLs and relative paths', () => {
  assert.equal(normalizeGithubAppCallbackPath(''), '/api/integrations/github-app/callback');
  assert.equal(normalizeGithubAppCallbackPath('api/github/callback'), '/api/github/callback');
  assert.equal(normalizeGithubAppCallbackPath('https://kb.example.com/api/github/callback'), '/api/github/callback');
});

test('github app callback controller delegates completion and redirects the browser', async () => {
  const calls = [];
  const controller = new GithubAppCallbackController({
    completeGithubForBrowser: async (input) => {
      calls.push(input);
      return { redirectUrl: '/automations/integrations?integration=github-app&status=connected' };
    },
  });
  const response = {
    redirectCalls: [],
    redirect(status, url) {
      this.redirectCalls.push([status, url]);
      return url;
    },
  };

  const result = await controller.githubAppCallback(
    { state: 'state-1', installation_id: '42', setup_action: 'install' },
    { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' },
    response,
  );

  assert.deepEqual(calls, [{ userId: 'user-1', state: 'state-1', installationId: '42' }]);
  assert.deepEqual(response.redirectCalls, [[302, '/automations/integrations?integration=github-app&status=connected']]);
  assert.equal(result, '/automations/integrations?integration=github-app&status=connected');
});

test('dashboard controller delegates project, workspace and note reads to use cases', async () => {
  const dashboard = {
    workspaces: [{ workspaceSlug: 'default' }],
    projects: [{ projectSlug: 'n8n-automations' }],
    notes: [{ id: 'note-1' }],
    reminders: [],
  };
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const controller = new DashboardController(
    { execute: async () => dashboard },
    { execute: async () => ({ items: dashboard.projects, pagination: {} }) },
    { execute: async () => dashboard.workspaces },
    { execute: async () => ({ items: [], pagination: {} }) },
    { execute: async () => ({ items: [], pagination: {} }) },
    { execute: async () => ({ items: [], pagination: {} }) },
    { execute: async (_userId, query) => ({ columns: { overdue: { items: [query], total: 1 }, upcoming: { items: [], total: 0 }, resolved: { items: [], total: 0 }, archived: { items: [], total: 0 } } }) },
    { execute: async (_userId, input) => ({ ok: true, ...input }) },
    { execute: async (_userId, id) => ({ id, title: 'Review detail' }) },
    { execute: async (query, userId) => ({ ok: true, query, userId }) },
    { execute: async (question, userId, options) => ({ ok: true, question, userId, options }) },
    { execute: async (userId, query) => ({ items: [{ id: 'ask-1', userId, ...query }], pagination: { page: query.page } }) },
    { execute: async (conversationId) => ({ turns: [] }) },
    { execute: async (userId, ids, status) => ({ ok: true }) },
    { execute: async (userId) => ({ activities: [] }) },
  );

  assert.deepEqual(await controller.projects(user, {}), { ok: true, projects: dashboard.projects, pagination: {} });
  assert.deepEqual(await controller.workspaces(user), { ok: true, workspaces: dashboard.workspaces });
  assert.deepEqual(await controller.getProductivityInsights(user), { activities: [] });
});

test('operations controller normalizes reminder dispatch and mark-sent inputs', async () => {
  const calls = [];
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const controller = new OperationsController(
    { execute: async (body, userId) => ({ op: 'ingest', body, userId }) },
    { execute: async (body, userId) => ({ op: 'agent-conversation', body, userId }) },
    { execute: async (mode, userId, workspaceSlug) => { calls.push(['dispatch', mode, userId, workspaceSlug]); return { mode }; } },
    { execute: async (ids, userId, workspaceSlug) => { calls.push(['mark', ids, userId, workspaceSlug]); return { ids }; } },
  );

  assert.deepEqual(await controller.ingest({ source: { correlationId: 'corr-1' } }, user), { op: 'ingest', body: { source: { correlationId: 'corr-1' } }, userId: 'user-1' });
  assert.deepEqual(
    await controller.processAgentConversation({ senderId: 'sender-1', chatId: 'group-1', messageText: 'deploy' }, user, { workspaceSlug: 'default' }),
    { op: 'agent-conversation', body: { senderId: 'sender-1', chatId: 'group-1', messageText: 'deploy' }, userId: 'user-1' },
  );
  assert.deepEqual(await controller.remindersDispatch(user, { workspaceSlug: 'default', mode: 'exact' }), { mode: 'exact' });
  assert.deepEqual(await controller.remindersDispatch(user, { workspaceSlug: 'default', mode: 'daily' }), { mode: 'daily' });
  assert.deepEqual(await controller.remindersMarkSent({ ids: ['one'] }, user, { workspaceSlug: 'default' }), { ids: ['one'] });
  assert.deepEqual(calls, [
    ['dispatch', 'exact', 'user-1', 'default'],
    ['dispatch', 'daily', 'user-1', 'default'],
    ['mark', ['one'], 'user-1', 'default'],
  ]);
});

test('workspaces controller delegates workspace creation to the use case', async () => {
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const controller = new WorkspacesController({
    execute: async (body, userId) => ({ ok: true, workspace: body, userId }),
  });

  assert.deepEqual(
    await controller.create({ displayName: 'Acme Team', workspaceSlug: 'acme-team' }, user),
    { ok: true, workspace: { displayName: 'Acme Team', workspaceSlug: 'acme-team' }, userId: 'user-1' },
  );
});

test('projects and notes controllers delegate create requests to use cases', async () => {
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const projects = new ProjectsController({
    execute: async (body, userId) => ({ ok: true, project: body, userId }),
  }, {
    execute: async (body, userId) => ({ ok: true, project: body, userId }),
  }, {
    execute: async (projectSlug, userId) => ({ ok: true, projectSlug, userId }),
  }, {
    execute: async (userId, projectSlug, favorite) => ({ ok: true, projectSlug, favorite }),
  }, {
    execute: async (userId, projectSlug) => ({ ok: true, fallback: false, brief: { projectSlug, userId } }),
  }, {
    execute: async (userId, projectSlug) => ({ ok: true, source: 'history', brief: { projectSlug, userId, saved: true } }),
  }, {
    execute: async () => ({ items: [], pagination: {} }),
  }, {
    execute: async () => ({ ok: true, folders: [] }),
  }, {
    execute: async () => ({ ok: true, folder: {} }),
  }, {
    execute: async () => ({ ok: true, folder: {} }),
  }, {
    execute: async () => ({ ok: true }),
  });
  const notes = new NotesController({
    execute: async (body, userId) => ({ ok: true, noteId: 'note-1', body, userId }),
  }, {
    execute: async (body, userId) => ({ ok: true, noteId: body.id, body, userId }),
  }, {
    execute: async (id, userId) => ({ ok: true, noteId: id, userId }),
  }, {
    execute: async () => null,
  });

  assert.deepEqual(
    await projects.create({ displayName: 'Acme API', projectSlug: 'acme-api', repositoryIds: ['101'], defaultTags: [] }, user),
    { ok: true, project: { displayName: 'Acme API', projectSlug: 'acme-api', repositoryIds: ['101'], defaultTags: [] }, userId: 'user-1' },
  );
  assert.deepEqual(
    await notes.create({ projectSlug: 'acme-api', title: 'Deploy', rawText: 'texto', tags: [], reminderDate: '', reminderTime: '' }, user),
    { ok: true, noteId: 'note-1', body: { projectId: undefined, folderId: undefined, title: 'Deploy', rawText: 'texto', tags: [], status: undefined, categoryIds: [], reminderAt: '', sourceChannel: undefined, source: undefined, sessionId: '', occurredAt: undefined, path: undefined, metadata: {}, attachments: [] }, userId: 'user-1' },
  );
  assert.deepEqual(
    await projects.update('acme-api', { displayName: 'Acme API', repositoryIds: [], defaultTags: [] }, user),
    { ok: true, project: { projectId: 'acme-api', displayName: 'Acme API', repositoryIds: [], defaultTags: [] }, userId: 'user-1' },
  );
  assert.deepEqual(await projects.remove('acme-api', user), { ok: true, projectSlug: 'acme-api', userId: 'user-1' });
  assert.deepEqual(await projects.generateBrief('acme-api', user), { ok: true, fallback: false, brief: { projectSlug: 'acme-api', userId: 'user-1' } });
  assert.deepEqual(await projects.getBrief('acme-api', user), { ok: true, source: 'history', brief: { projectSlug: 'acme-api', userId: 'user-1', saved: true } });
  assert.deepEqual( 
    await notes.update({ id: 'note-1' }, { title: 'Deploy', rawText: 'texto', tags: [], reminderAt: ''}, user, undefined),
    { ok: true, noteId: 'note-1', body: { id: 'note-1', folderId: undefined, status: undefined, categoryIds: undefined, title: 'Deploy', rawText: 'texto', tags: [], reminderAt: '', projectId: undefined, attachments: undefined }, userId: 'user-1' },
  );
  assert.deepEqual(await notes.remove({ id: 'note-1' }, user), { ok: true, noteId: 'note-1', userId: 'user-1' });
});

test('notes controller serves attachment content with inline headers', async () => {
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const notes = new NotesController({
    execute: async () => null,
  }, {
    execute: async () => null,
  }, {
    execute: async () => null,
  }, {
    execute: async (userId, noteId, attachmentId) => ({
      fileName: `${userId}-${noteId}-${attachmentId}.txt`,
      mimeType: 'text/plain',
      sizeBytes: 5,
      body: Buffer.from('hello'),
    }),
  });
  const response = {
    headers: {},
    sent: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    send(body) {
      this.sent = body;
      return this;
    },
  };

  const result = await notes.attachmentContent({ noteId: 'note-1', attachmentId: 'att-1' }, user, response);

  assert.equal(result, response);
  assert.equal(response.headers['Content-Type'], 'text/plain');
  assert.equal(response.headers['Content-Length'], '5');
  assert.match(response.headers['Content-Disposition'], /^inline; filename="user-1-note-1-att-1\.txt"/);
  assert.equal(response.sent.toString('utf8'), 'hello');
});
