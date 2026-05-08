import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGithubAppCallbackPath } from '../../../dist/adapters/environment.js';
import { DashboardController, GithubAppCallbackController, HealthController, NotesController, OperationsController, ProjectsController, WorkspacesController } from '../../../dist/interfaces/http/controllers/index.js';

test('health controller exposes service status', () => {
  const controller = new HealthController();

  assert.deepEqual(controller.health(), { ok: true, service: 'knowledge-base' });
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
      return { redirectUrl: '/settings/integrations?integration=github-app&status=connected' };
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
  assert.deepEqual(response.redirectCalls, [[302, '/settings/integrations?integration=github-app&status=connected']]);
  assert.equal(result, '/settings/integrations?integration=github-app&status=connected');
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
    { execute: async () => dashboard.projects },
    { execute: async () => dashboard.workspaces },
    { execute: async () => dashboard.notes },
    { execute: async (_userId, id) => ({ id, title: 'Note detail' }) },
    { execute: async (query) => ({ ok: true, query }) },
  );

  assert.deepEqual(await controller.projects(user), { ok: true, projects: dashboard.projects });
  assert.deepEqual(await controller.workspaces(user), { ok: true, workspaces: dashboard.workspaces });
  assert.deepEqual(await controller.notes(user), { ok: true, notes: dashboard.notes });
  assert.deepEqual(await controller.note({ id: 'note-1' }, user), { ok: true, note: { id: 'note-1', title: 'Note detail' } });
  assert.deepEqual(await controller.query({ query: 'deploy', limit: 7, mode: 'answer', workspaceSlug: '', projectSlug: '' }, user), { ok: true, query: { query: 'deploy', limit: 7, mode: 'answer', workspaceSlug: '', projectSlug: '' } });
});

test('operations controller normalizes reminder dispatch and mark-sent inputs', async () => {
  const calls = [];
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const controller = new OperationsController(
    { execute: async (body, userId) => ({ op: 'ingest', body, userId }) },
    { execute: async (body, userId) => ({ op: 'conversation', body, userId }) },
    { execute: async (mode, userId, workspaceSlug) => { calls.push(['dispatch', mode, userId, workspaceSlug]); return { mode }; } },
    { execute: async (ids, userId, workspaceSlug) => { calls.push(['mark', ids, userId, workspaceSlug]); return { ids }; } },
  );

  assert.deepEqual(await controller.ingest({ source: { correlationId: 'corr-1' } }, user), { op: 'ingest', body: { source: { correlationId: 'corr-1' } }, userId: 'user-1' });
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
  });
  const notes = new NotesController({
    execute: async (body, userId) => ({ ok: true, noteId: 'note-1', body, userId }),
  }, {
    execute: async (body, userId) => ({ ok: true, noteId: body.id, body, userId }),
  }, {
    execute: async (id, userId) => ({ ok: true, noteId: id, userId }),
  });

  assert.deepEqual(
    await projects.create({ displayName: 'Acme API', projectSlug: 'acme-api', repositoryIds: ['101'], aliases: [], defaultTags: [] }, user),
    { ok: true, project: { displayName: 'Acme API', projectSlug: 'acme-api', repositoryIds: ['101'], aliases: [], defaultTags: [] }, userId: 'user-1' },
  );
  assert.deepEqual(
    await notes.create({ projectSlug: 'acme-api', title: 'Deploy', rawText: 'texto', tags: [], reminderDate: '', reminderTime: '' }, user),
    { ok: true, noteId: 'note-1', body: { projectSlug: 'acme-api', title: 'Deploy', rawText: 'texto', tags: [], reminderDate: '', reminderTime: '' }, userId: 'user-1' },
  );
  assert.deepEqual(
    await projects.update({ projectSlug: 'acme-api' }, { displayName: 'Acme API', repositoryIds: [], aliases: [], defaultTags: [] }, user),
    { ok: true, project: { projectSlug: 'acme-api', displayName: 'Acme API', repositoryIds: [], aliases: [], defaultTags: [] }, userId: 'user-1' },
  );
  assert.deepEqual(await projects.remove({ projectSlug: 'acme-api' }, user), { ok: true, projectSlug: 'acme-api', userId: 'user-1' });
  assert.deepEqual(
    await notes.update({ id: 'note-1' }, { title: 'Deploy', rawText: 'texto', tags: [], reminderDate: '', reminderTime: '' }, user),
    { ok: true, noteId: 'note-1', body: { id: 'note-1', title: 'Deploy', rawText: 'texto', tags: [], reminderDate: '', reminderTime: '' }, userId: 'user-1' },
  );
  assert.deepEqual(await notes.remove({ id: 'note-1' }, user), { ok: true, noteId: 'note-1', userId: 'user-1' });
});
