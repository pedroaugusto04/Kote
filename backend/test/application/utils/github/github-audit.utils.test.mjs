import test from 'node:test';
import assert from 'node:assert/strict';

import {
  githubAuditPayload,
  githubPrAuditPayload,
} from '../../../../dist/application/utils/github/github-audit.utils.js';

test('githubAuditPayload normalizes push webhook properties cleanly', () => {
  const payload = {
    ref: 'refs/heads/main',
    before: 'sha1',
    after: 'sha2',
    installation: { id: 12345 },
    repository: { id: 9876, full_name: 'org/repo', private: true },
    pusher: { name: 'octocat' },
  };

  const audit = githubAuditPayload(payload);
  assert.equal(audit.ref, 'refs/heads/main');
  assert.equal(audit.installationId, '12345');
  assert.equal(audit.repositoryId, '9876');
  assert.equal(audit.repositoryFullName, 'org/repo');
  assert.equal(audit.repositoryPrivate, true);
  assert.equal(audit.pusherName, 'octocat');
});

test('githubPrAuditPayload normalizes PR webhook properties cleanly', () => {
  const payload = {
    action: 'opened',
    pull_request: {
      number: 42,
      base: { sha: 'base123' },
      head: { sha: 'head456' },
    },
    repository: { id: 777, full_name: 'org/repo', private: false },
    sender: { login: 'octouser' },
  };

  const audit = githubPrAuditPayload(payload);
  assert.equal(audit.action, 'opened');
  assert.equal(audit.prNumber, 42);
  assert.equal(audit.baseSha, 'base123');
  assert.equal(audit.headSha, 'head456');
  assert.equal(audit.repositoryId, '777');
  assert.equal(audit.repositoryFullName, 'org/repo');
  assert.equal(audit.senderLogin, 'octouser');
});
