import test from 'node:test';
import assert from 'node:assert/strict';

import { DashboardController, HealthController, OperationsController } from '../dist/interfaces/http/controllers/index.js';

test('health controller exposes service status', () => {
  const controller = new HealthController();

  assert.deepEqual(controller.health(), { ok: true, service: 'knowledge-base' });
});

test('dashboard controller delegates project, workspace and note reads to use cases', async () => {
  const dashboard = {
    workspaces: [{ workspaceSlug: 'default' }],
    projects: [{ projectSlug: 'n8n-automations' }],
    notes: [{ id: 'note-1' }],
    reviews: [],
    reminders: [],
  };
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };
  const controller = new DashboardController(
    { execute: async () => dashboard },
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
    { execute: async (body, userId) => ({ op: 'onboarding', body, userId }) },
    { execute: async (body, userId) => ({ op: 'conversation', body, userId }) },
    { execute: async (mode, userId, workspaceSlug) => { calls.push(['dispatch', mode, userId, workspaceSlug]); return { mode }; } },
    { execute: async (ids, userId, workspaceSlug) => { calls.push(['mark', ids, userId, workspaceSlug]); return { ids }; } },
  );

  assert.deepEqual(await controller.ingest({ schemaVersion: 1 }, user), { op: 'ingest', body: { schemaVersion: 1 }, userId: 'user-1' });
  assert.deepEqual(await controller.remindersDispatch(user, { workspaceSlug: 'default', mode: 'exact' }), { mode: 'exact' });
  assert.deepEqual(await controller.remindersDispatch(user, { workspaceSlug: 'default', mode: 'daily' }), { mode: 'daily' });
  assert.deepEqual(await controller.remindersMarkSent({ ids: ['one'] }, user, { workspaceSlug: 'default' }), { ids: ['one'] });
  assert.deepEqual(calls, [
    ['dispatch', 'exact', 'user-1', 'default'],
    ['dispatch', 'daily', 'user-1', 'default'],
    ['mark', ['one'], 'user-1', 'default'],
  ]);
});
