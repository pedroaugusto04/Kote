import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { SyncProjectFilesService } from '../../../dist/application/services/projects/sync-project-files.service.js';
import { PostgresProjectRepository } from '../../../dist/infrastructure/repositories/project.repository.js';
import { PostgresProjectCoverageRepository } from '../../../dist/infrastructure/repositories/project-coverage.repository.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

test('PostgresProjectRepository.getById returns null for non-uuid slug without 22P02 string_to_uuid error', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const projectRepo = new PostgresProjectRepository(repositories.database);

  // Searching by slug 'kote' via getById should not crash PostgreSQL with 22P02
  const result = await projectRepo.getById(user.id, 'kote');
  assert.equal(result, null);
});

test('SyncProjectFilesService supports explicit syncProjectBySlug and syncProjectById', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();

  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
    id: crypto.randomUUID(),
    workspaceSlug: 'default',
    displayName: 'Default',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
  });

  const project = await repositories.contentRepository.upsertProject(user.id, {
    id: crypto.randomUUID(),
    projectSlug: 'kote',
    displayName: 'Kote',
    workspaceId: workspace.id,
    workspaceSlug: 'default',
    repositories: [],
    defaultTags: [],
    enabled: true,
    favorite: false,
  });

  const service = new SyncProjectFilesService(
    new PostgresProjectCoverageRepository(repositories.database),
    { fetchInstallationToken: async () => 'token', listRepositoryTree: async () => [] },
    { read: () => ({}) },
    repositories.contentRepository,
    repositories.credentialRepository,
    { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
  );

  // Explicit sync by slug (used by GitHub webhook)
  const countBySlug = await service.syncProjectBySlug(user.id, 'kote');
  assert.equal(countBySlug, 0);

  // Explicit sync by ID (used by coverage API endpoint)
  const countById = await service.syncProjectById(user.id, project.id);
  assert.equal(countById, 0);

  // Polymorphic sync method for backward compatibility
  const countPolymorphicSlug = await service.syncProject(user.id, 'kote');
  assert.equal(countPolymorphicSlug, 0);
  const countPolymorphicId = await service.syncProject(user.id, project.id);
  assert.equal(countPolymorphicId, 0);
});

test('PostgresProjectCoverageRepository.getProjectCoverage queries by UUID and throws project_not_found for invalid UUID', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();

  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
    id: crypto.randomUUID(),
    workspaceSlug: 'default',
    displayName: 'Default',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
  });

  const project = await repositories.contentRepository.upsertProject(user.id, {
    id: crypto.randomUUID(),
    projectSlug: 'kote',
    displayName: 'Kote',
    workspaceId: workspace.id,
    workspaceSlug: 'default',
    repositories: [],
    defaultTags: [],
    enabled: true,
    favorite: false,
  });

  const coverageRepo = new PostgresProjectCoverageRepository(repositories.database);

  // Querying with project.id (valid UUID)
  const coverage = await coverageRepo.getProjectCoverage(user.id, project.id);
  assert.equal(coverage.projectSlug, 'kote');
  assert.equal(coverage.totalFiles, 0);

  // Querying with invalid UUID slug throws project_not_found without 22P02 database error
  await assert.rejects(
    async () => coverageRepo.getProjectCoverage(user.id, 'kote'),
    { message: 'project_not_found' }
  );
});
