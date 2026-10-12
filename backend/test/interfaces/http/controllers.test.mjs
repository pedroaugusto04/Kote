import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGithubAppCallbackPath } from '../../../dist/adapters/environment.js';
import { ApplicationAccessController, DashboardController, GithubAppCallbackController, HealthController, NotesController, OperationsController, ProjectsController, WorkspacesController, RemindersController, ReviewsController, AskAiController, QueryKnowledgeController } from '../../../dist/interfaces/http/controllers/index.js';

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
    { execute: async (userId) => ({ activities: [] }) },
    { execute: async () => ({}) },
  );

  assert.deepEqual(await controller.projects(user, {}), { ok: true, projects: dashboard.projects, pagination: {} });
  assert.deepEqual(await controller.workspaces(user), { ok: true, workspaces: dashboard.workspaces });
  assert.deepEqual(await controller.getProductivityInsights(user), { activities: [] });
});

test('query knowledge controller delegates GET and POST queries to use case', async () => {
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  let captured = null;
  const controller = new QueryKnowledgeController({
    execute: async (input, userId) => {
      captured = { input, userId };
      return { ok: true, hits: [] };
    },
  });

  const getResult = await controller.query({ query: 'search text', page: 1, pageSize: 10 }, user, { projectId: 'proj-1', workspaceId: 'ws-1' });
  assert.deepEqual(getResult, { ok: true, hits: [] });
  assert.deepEqual(captured, {
    input: {
      query: 'search text',
      status: 'open',
      limit: 5,
      page: 1,
      pageSize: 10,
      projectId: 'proj-1',
      workspaceId: 'ws-1',
    },
    userId: 'user-1',
  });

  const postResult = await controller.queryPost({ query: 'post query' }, user, {});
  assert.deepEqual(postResult, { ok: true, hits: [] });
  assert.equal(captured.input.query, 'post query');
});

test('ask ai controller delegates ask, conversations and history to use cases', async () => {
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const controller = new AskAiController(
    { execute: async (question, userId, options, convId, history) => ({ ok: true, answer: '42' }) },
    { execute: async (userId, query) => ({ items: [{ id: 'conv-1' }], pagination: {} }) },
    { execute: async (id) => [{ turnId: '1', role: 'user' }] },
    { execute: async (userId, query) => ({ items: [{ id: 'hist-1' }], pagination: {} }) },
  );

  const askResult = await controller.ask({ question: 'hello' }, user, { projectId: 'p1' });
  assert.deepEqual(askResult, { ok: true, answer: '42' });

  const convsResult = await controller.askConversations({}, user, { projectId: 'p1' });
  assert.deepEqual(convsResult, { ok: true, conversations: [{ id: 'conv-1' }], pagination: {} });

  const turnsResult = await controller.askConversationTurns({ id: '123e4567-e89b-12d3-a456-426614174000' }, user);
  assert.deepEqual(turnsResult, { ok: true, turns: [{ turnId: '1', role: 'user' }] });

  const histResult = await controller.askHistory({}, user, { projectId: 'p1' });
  assert.deepEqual(histResult, { ok: true, history: [{ id: 'hist-1' }], pagination: {} });
});

test('reviews controller delegates review queries and detail to use cases', async () => {
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const mockReviews = [{ id: 'rev-1', title: 'Review 1' }];
  const controller = new ReviewsController(
    { execute: async () => ({ items: mockReviews, pagination: {} }) },
    { execute: async (_userId, id) => ({ id, title: 'Review 1 detail' }) },
  );

  assert.deepEqual(await controller.reviews(user, {}), { ok: true, reviews: mockReviews, pagination: {} });
  assert.deepEqual(await controller.review({ id: 'rev-1' }, user), { ok: true, review: { id: 'rev-1', title: 'Review 1 detail' } });
});

test('reminders controller delegates reminder queries and mutations to use cases', async () => {
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const mockReminders = [{ id: 'rem-1', title: 'Reminder 1' }];
  const controller = new RemindersController(
    { execute: async () => ({ items: mockReminders, pagination: {} }) },
    { execute: async (_userId, query) => ({ columns: { overdue: { items: [query], total: 1 } } }) },
    { execute: async (_userId, input) => ({ ok: true, ...input }) },
    { execute: async (_userId, ids, status) => ({ ok: true, ids, status }) },
  );

  assert.deepEqual(await controller.reminders(user, {}), { ok: true, reminders: mockReminders, pagination: {} });
  assert.deepEqual(await controller.reminderBoard(user, {}), { ok: true, columns: { overdue: { items: [{}], total: 1 } } });
  assert.deepEqual(await controller.updateReminderStatus({ id: 'rem-1' }, { status: 'resolved' }, user), { ok: true, id: 'rem-1', status: 'resolved' });
  assert.deepEqual(await controller.bulkUpdateReminderStatus({ ids: ['rem-1'], status: 'resolved' }, user), { ok: true, ids: ['rem-1'], status: 'resolved' });
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

test('operations controller sends the global export with download headers', async () => {
  const response = {
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    send(body) {
      this.body = body;
      return body;
    },
  };
  const controller = new OperationsController(
    {},
    {},
    {},
    {},
    {},
    { execute: async () => ({ filename: 'kote-export-2026-09-28.zip', buffer: Buffer.from('zip') }) },
  );

  await controller.exportGlobalData({ id: 'user-1' }, response);

  assert.equal(response.headers['Content-Type'], 'application/zip');
  assert.equal(response.headers['Content-Disposition'], 'attachment; filename="kote-export-2026-09-28.zip"');
  assert.equal(response.headers['Content-Length'], '3');
  assert.deepEqual(response.body, Buffer.from('zip'));
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
    execute: async (userId, projectSlug, workspaceId) => ({ ok: true, fallback: false, brief: { projectSlug, userId, ...(workspaceId !== undefined ? { workspaceId } : {}) } }),
  }, {
    execute: async (userId, projectSlug, workspaceId) => ({ ok: true, source: 'history', brief: { projectSlug, userId, saved: true, ...(workspaceId !== undefined ? { workspaceId } : {}) } }),
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
  const projectScope = {
    projectId: 'acme-api',
    projectSlug: 'acme-api',
    workspaceId: 'ws-1',
    workspaceSlug: 'ws-1',
    userId: 'user-1',
  };
  assert.deepEqual(
    await projects.update(projectScope, { displayName: 'Acme API', repositoryIds: [], defaultTags: [] }, user),
    { ok: true, project: { projectId: 'acme-api', displayName: 'Acme API', repositoryIds: [], defaultTags: [] }, userId: 'user-1' },
  );
  assert.deepEqual(await projects.remove(projectScope, user), { ok: true, projectSlug: 'acme-api', userId: 'user-1' });
  assert.deepEqual(await projects.generateBrief(projectScope, user), { ok: true, fallback: false, brief: { projectSlug: 'acme-api', userId: 'user-1', workspaceId: 'ws-1' } });
  assert.deepEqual(await projects.getBrief(projectScope, user), { ok: true, source: 'history', brief: { projectSlug: 'acme-api', userId: 'user-1', saved: true, workspaceId: 'ws-1' } });
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


test('notes controller forces ZIP attachment downloads', async () => {
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const notes = new NotesController({ execute: async () => null }, { execute: async () => null }, { execute: async () => null }, {
    execute: async () => ({ fileName: 'archive.zip', mimeType: 'application/zip', sizeBytes: 22, body: Buffer.alloc(22) }),
  });
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, send(body) { this.sent = body; return this; } };

  await notes.attachmentContent({ noteId: 'note-1', attachmentId: 'att-1' }, user, response);
  assert.match(response.headers['Content-Disposition'], /^attachment; filename="archive\.zip"/);
});

test('projects controller routes that support the "all" project slug allow all-projects scope', async () => {
  const { Reflector } = await import('@nestjs/core');
  const { SCOPED_METADATA_KEY } = await import('../../../dist/interfaces/http/scope.decorators.js');
  const reflector = new Reflector();

  for (const handler of ['listDecisions', 'exportAdrsZip', 'generateBrief', 'getBrief', 'getBriefHistory']) {
    const options = reflector.get(SCOPED_METADATA_KEY, ProjectsController.prototype[handler]);
    assert.equal(options?.allowAllProjects, true, `${handler} must allow the "all" project slug`);
  }
});

test('dependency watcher controller delegates enable, disable and toggle to service', async () => {
  const { DependencyWatcherController } = await import('../../../dist/interfaces/http/controllers/integrations/dependency-watcher.controller.js');
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const scope = { userId: 'user-1', workspaceId: 'ws-1', workspaceSlug: 'ws-slug', projectId: null, projectSlug: null };
  const calls = [];
  const mockService = {
    async setWorkspaceWatcherStatus(userId, workspaceId, workspaceSlug, enabled) {
      calls.push({ action: 'setStatus', userId, workspaceId, workspaceSlug, enabled });
      return enabled;
    },
    async toggleDependency(userId, workspaceId, dependencyId, enabled) {
      calls.push({ action: 'toggle', userId, workspaceId, dependencyId, enabled });
      return enabled;
    },
  };

  const controller = new DependencyWatcherController(
    { execute: async () => null },
    { execute: async () => null },
    { execute: async () => null },
    { execute: async () => null },
    { execute: async () => null },
    mockService,
  );

  const enableRes = await controller.enable(user, scope);
  assert.deepEqual(enableRes, { ok: true, data: { enabled: true } });

  const disableRes = await controller.disable(user, scope);
  assert.deepEqual(disableRes, { ok: true, data: { enabled: false } });

  const toggleRes = await controller.toggleDependency(user, scope, 'dep-1', { enabled: true });
  assert.deepEqual(toggleRes, { ok: true, data: { enabled: true } });

  assert.deepEqual(calls, [
    { action: 'setStatus', userId: 'user-1', workspaceId: 'ws-1', workspaceSlug: 'ws-slug', enabled: true },
    { action: 'setStatus', userId: 'user-1', workspaceId: 'ws-1', workspaceSlug: 'ws-slug', enabled: false },
    { action: 'toggle', userId: 'user-1', workspaceId: 'ws-1', dependencyId: 'dep-1', enabled: true },
  ]);
});
