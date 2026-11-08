import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isPathInWorkspaceFolders, isSessionInWorkspaceFolders } from '../out/utils/workspace-filter.js';

test('isPathInWorkspaceFolders returns true when no workspace folders are configured', () => {
  assert.equal(isPathInWorkspaceFolders('/home/user/project', []), true);
  assert.equal(isPathInWorkspaceFolders('/home/user/project', undefined), true);
});

test('isPathInWorkspaceFolders returns false for empty or null candidate', () => {
  assert.equal(isPathInWorkspaceFolders('', ['/home/user/project']), false);
  assert.equal(isPathInWorkspaceFolders(null, ['/home/user/project']), false);
  assert.equal(isPathInWorkspaceFolders(undefined, ['/home/user/project']), false);
});

test('isPathInWorkspaceFolders matches exact directory', () => {
  const root = path.resolve('/home/user/project-a');
  assert.equal(isPathInWorkspaceFolders(root, [root]), true);
});

test('isPathInWorkspaceFolders matches subdirectories inside workspace', () => {
  const root = path.resolve('/home/user/project-a');
  const sub = path.join(root, 'packages', 'client');
  assert.equal(isPathInWorkspaceFolders(sub, [root]), true);
});

test('isPathInWorkspaceFolders matches parent directory when workspace is a subfolder', () => {
  const root = path.resolve('/home/user/project-a');
  const sub = path.join(root, 'packages', 'client');
  assert.equal(isPathInWorkspaceFolders(root, [sub]), true);
});

test('isPathInWorkspaceFolders rejects completely different directories', () => {
  const rootA = path.resolve('/home/user/project-a');
  const rootB = path.resolve('/home/user/project-b');
  assert.equal(isPathInWorkspaceFolders(rootB, [rootA]), false);
  assert.equal(isPathInWorkspaceFolders('/tmp/unrelated', [rootA, rootB]), false);
});

test('isSessionInWorkspaceFolders filters sessions by workspaceDir boundary', () => {
  const rootA = path.resolve('/home/user/project-a');
  const rootB = path.resolve('/home/user/project-b');

  const sessionA = {
    providerId: 'antigravity',
    sessionId: 'sess-1',
    title: 'Session 1',
    turns: [],
    timestamp: Date.now(),
    timestampIsInternal: true,
    workspaceDir: rootA,
    projectSlug: 'project-a',
  };

  const sessionB = {
    providerId: 'antigravity',
    sessionId: 'sess-2',
    title: 'Session 2',
    turns: [],
    timestamp: Date.now(),
    timestampIsInternal: true,
    workspaceDir: rootB,
    projectSlug: 'project-b',
  };

  // Window A (open on rootA)
  assert.equal(isSessionInWorkspaceFolders(sessionA, [rootA], 'project-a'), true);
  assert.equal(isSessionInWorkspaceFolders(sessionB, [rootA], 'project-a'), false);

  // Window B (open on rootB)
  assert.equal(isSessionInWorkspaceFolders(sessionA, [rootB], 'project-b'), false);
  assert.equal(isSessionInWorkspaceFolders(sessionB, [rootB], 'project-b'), true);
});

test('isSessionInWorkspaceFolders falls back to gitActivity.cwd if workspaceDir is absent', () => {
  const rootA = path.resolve('/home/user/project-a');
  const rootB = path.resolve('/home/user/project-b');

  const session = {
    providerId: 'codex-cli',
    sessionId: 'sess-git',
    title: 'Session Git',
    turns: [],
    timestamp: Date.now(),
    timestampIsInternal: true,
    gitActivity: { cwd: rootA },
  };

  assert.equal(isSessionInWorkspaceFolders(session, [rootA]), true);
  assert.equal(isSessionInWorkspaceFolders(session, [rootB]), false);
});

test('isSessionInWorkspaceFolders falls back to projectSlug comparison if no dirs available', () => {
  const rootA = path.resolve('/home/user/project-a');

  const sessionMatching = {
    providerId: 'open-code',
    sessionId: 'sess-slug',
    title: 'Session Slug',
    turns: [],
    timestamp: Date.now(),
    timestampIsInternal: true,
    projectSlug: 'project-a',
  };

  const sessionDifferent = {
    providerId: 'open-code',
    sessionId: 'sess-other',
    title: 'Session Other',
    turns: [],
    timestamp: Date.now(),
    timestampIsInternal: true,
    projectSlug: 'project-b',
  };

  assert.equal(isSessionInWorkspaceFolders(sessionMatching, [rootA], 'project-a'), true);
  assert.equal(isSessionInWorkspaceFolders(sessionDifferent, [rootA], 'project-a'), false);
});
