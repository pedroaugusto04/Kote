import test from 'node:test';
import assert from 'node:assert/strict';
import { GithubBackfillUseCase } from '../../../dist/application/use-cases/integrations/github-backfill.use-case.js';
import { GithubBackfillRunnerService } from '../../../dist/application/services/github-backfill-runner.service.js';
import { encryptConfig } from '../../../dist/application/credentials.js';

test('GithubBackfillUseCase - start and cancel', async () => {
  const jobs = new Map();
  const mockJobRepo = {
    async create(input) {
      const job = {
        ...input,
        status: 'queued',
        processed: 0,
        imported: 0,
        skipped: 0,
        error: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      };
      jobs.set(job.id, job);
      return job;
    },
    async findById(jobId) {
      return jobs.get(jobId) || null;
    },
    async findCompletedByWorkspace() {
      return null;
    },
    async update(jobId, patch) {
      const existing = jobs.get(jobId);
      if (existing) {
        Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
      }
    }
  };

  const mockEnvProvider = {
    read: () => ({
      githubBackfillLimit: 5,
      credentialsEncryptionKey: Buffer.alloc(32).toString('base64'),
    })
  };

  const encryptedConfig = encryptConfig({ installationId: '42' }, mockEnvProvider);

  const mockCredRepo = {
    async findCredential() {
      return { status: 'connected', revokedAt: null, encryptedConfig };
    }
  };

  const mockPushService = {
    async findProjectSlugForRepo() {
      return 'platform';
    }
  };

  const mockQueuePublisher = {
    published: [],
    async publish(msg) {
      this.published.push(msg);
    }
  };

  const useCase = new GithubBackfillUseCase(
    mockPushService,
    mockCredRepo,
    mockEnvProvider,
    mockJobRepo,
    mockQueuePublisher
  );

  const startRes = await useCase.start({
    userId: 'user-123',
    workspaceSlug: 'workspace-1',
    repositories: ['repo-1', 'repo-2'],
  });

  assert.equal(startRes.ok, true);
  assert.ok(startRes.jobId);
  assert.equal(startRes.limit, 5);

  const createdJob = jobs.get(startRes.jobId);
  assert.ok(createdJob);
  assert.equal(createdJob.total, 5); // Global limit is 5, not repositories.length * 5 = 10

  // Test cancellation
  const cancelRes = await useCase.cancel(startRes.jobId, 'user-123');
  assert.equal(cancelRes, true);
  assert.equal(createdJob.status, 'cancelled');
  assert.ok(createdJob.completedAt);
});

test('GithubBackfillRunnerService - global limits and cancellation', async () => {
  const jobs = new Map();
  const initialJob = {
    id: 'job-1',
    userId: 'user-123',
    workspaceSlug: 'workspace-1',
    repositories: ['repo-1', 'repo-2'],
    status: 'queued',
    processed: 0,
    imported: 0,
    skipped: 0,
    total: 5,
    limit: 5,
    error: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
  jobs.set(initialJob.id, initialJob);

  const mockJobRepo = {
    async findById(jobId) {
      return jobs.get(jobId) || null;
    },
    async update(jobId, patch) {
      const existing = jobs.get(jobId);
      if (existing) {
        Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
      }
    }
  };

  const mockPushService = {
    executed: [],
    async findProjectSlugForRepo() {
      return 'platform';
    },
    async noteExistsForPush() {
      return false;
    },
    async execute(payload) {
      this.executed.push(payload);
      return { ok: true };
    }
  };

  const mockRepoResolution = {
    async listAccessibleRepositories() {
      return [
        { id: 1, fullName: 'repo-1', defaultBranch: 'main', private: false },
        { id: 2, fullName: 'repo-2', defaultBranch: 'main', private: false },
      ];
    }
  };

  const mockIntegrationGateway = {
    async fetchInstallationToken() {
      return 'token';
    },
    async fetchRecentCommits({ repoFullName }) {
      if (repoFullName === 'repo-1') {
        return [
          { sha: 'sha-1-new', parentSha: 'p1', message: 'r1 new', timestamp: '2026-07-04T12:00:00Z', url: 'u1' },
          { sha: 'sha-1-old', parentSha: 'p2', message: 'r1 old', timestamp: '2026-07-04T10:00:00Z', url: 'u2' },
        ];
      } else {
        return [
          { sha: 'sha-2-newest', parentSha: 'p3', message: 'r2 newest', timestamp: '2026-07-04T13:00:00Z', url: 'u3' },
          { sha: 'sha-2-mid', parentSha: 'p4', message: 'r2 mid', timestamp: '2026-07-04T11:00:00Z', url: 'u4' },
          { sha: 'sha-2-oldest', parentSha: 'p5', message: 'r2 oldest', timestamp: '2026-07-04T09:00:00Z', url: 'u5' },
        ];
      }
    },
    async fetchCommitDiff() {
      return { files: [] };
    }
  };

  const mockEnvProvider = {
    read: () => ({
      githubBackfillLimit: 5,
      credentialsEncryptionKey: Buffer.alloc(32).toString('base64'),
      githubAppId: '123',
      githubAppPrivateKey: 'key',
    })
  };

  const encryptedConfig = encryptConfig({ installationId: '42' }, mockEnvProvider);

  const mockCredRepo = {
    async findCredential() {
      return { status: 'connected', revokedAt: null, encryptedConfig };
    }
  };

  const runner = new GithubBackfillRunnerService(
    mockPushService,
    mockRepoResolution,
    mockIntegrationGateway,
    mockCredRepo,
    mockEnvProvider,
    mockJobRepo
  );

  await runner.run('job-1', 'user-123');

  const updatedJob = jobs.get('job-1');
  assert.equal(updatedJob.status, 'completed');
  assert.equal(updatedJob.total, 5); // We only imported 5 commits total
  // Verify chronological order: newest overall are (2-newest, 1-new, 2-mid, 1-old, 2-oldest)
  // Reversal processes oldest first: 2-oldest, 1-old, 2-mid, 1-new, 2-newest.
  assert.equal(mockPushService.executed.length, 5);
  assert.equal(mockPushService.executed[0].body.commits[0].id, 'sha-2-oldest');
  assert.equal(mockPushService.executed[1].body.commits[0].id, 'sha-1-old');
  assert.equal(mockPushService.executed[2].body.commits[0].id, 'sha-2-mid');
  assert.equal(mockPushService.executed[3].body.commits[0].id, 'sha-1-new');
  assert.equal(mockPushService.executed[4].body.commits[0].id, 'sha-2-newest');

  // Test early exit when cancelled
  const cancelledJob = {
    id: 'job-2',
    userId: 'user-123',
    workspaceSlug: 'workspace-1',
    repositories: ['repo-1', 'repo-2'],
    status: 'cancelled', // Pretend it was cancelled
    processed: 0,
    imported: 0,
    skipped: 0,
    total: 5,
    limit: 5,
    error: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
  jobs.set(cancelledJob.id, cancelledJob);

  const mockPushServiceCancel = {
    executed: [],
    async findProjectSlugForRepo() { return 'platform'; },
    async noteExistsForPush() { return false; },
    async execute() { return { ok: true }; }
  };

  const runnerCancel = new GithubBackfillRunnerService(
    mockPushServiceCancel,
    mockRepoResolution,
    mockIntegrationGateway,
    mockCredRepo,
    mockEnvProvider,
    mockJobRepo
  );

  await runnerCancel.run('job-2', 'user-123');
  // Since it was cancelled, it should exit early and not run execute
  assert.equal(mockPushServiceCancel.executed.length, 0);
});
