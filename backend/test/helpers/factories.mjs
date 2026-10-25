import crypto from 'node:crypto';
import { SubscriptionService } from '../../dist/application/services/billing/SubscriptionService.js';
import { FindRelatedNotesByFileUseCase } from '../../dist/application/use-cases/notes/find-related-notes-by-file.use-case.js';

export function createTestUser(overrides = {}) {
  const id = overrides.id || crypto.randomUUID();
  return {
    id,
    email: `user-${id.slice(0, 8)}@example.com`,
    passwordHash: 'hashed-password-123',
    role: 'member',
    avatarUrl: null,
    avatarStorageKey: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestWorkspace(overrides = {}) {
  const id = overrides.id || crypto.randomUUID();
  const slug = overrides.workspaceSlug || `workspace-${id.slice(0, 8)}`;
  return {
    id,
    workspaceSlug: slug,
    displayName: overrides.displayName || `Workspace ${slug}`,
    userId: overrides.userId || crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestProject(overrides = {}) {
  const id = overrides.id || crypto.randomUUID();
  const slug = overrides.projectSlug || `project-${id.slice(0, 8)}`;
  return {
    id,
    projectSlug: slug,
    displayName: overrides.displayName || `Project ${slug}`,
    workspaceSlug: overrides.workspaceSlug || 'default',
    repositories: [],
    defaultTags: [],
    enabled: true,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestNote(overrides = {}) {
  const id = overrides.id || crypto.randomUUID();
  return {
    id,
    title: 'Test Note',
    path: `20 Inbox/test-project/note-${id.slice(0, 8)}.md`,
    project: 'test-project',
    workspace: 'default',
    folderId: null,
    categories: ['task'],
    tags: ['test'],
    date: new Date().toISOString().slice(0, 10),
    status: 'active',
    summary: 'A test note summary',
    source: 'manual',
    sourceChannel: 'manual',
    markdown: '# Test Note\n\nBody content.',
    attachmentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestReminder(overrides = {}) {
  const id = overrides.id || crypto.randomUUID();
  return {
    id,
    userId: overrides.userId || crypto.randomUUID(),
    workspaceId: overrides.workspaceId || crypto.randomUUID(),
    workspaceSlug: overrides.workspaceSlug || 'default',
    projectSlug: overrides.projectSlug || 'test-project',
    title: 'Test Reminder',
    remindAt: new Date().toISOString(),
    status: 'pending',
    channel: 'whatsapp',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestSubscriptionService(deps = {}) {
  const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };
  const mockGatewayFactory = deps.paymentGatewayFactory ?? {
    getGateway: () => deps.asaasPaymentGateway ?? deps.stripePaymentGateway ?? deps.gateway ?? null,
    getStatusMapper: () => deps.asaasGatewayStatusMapper ?? deps.stripeGatewayStatusMapper ?? deps.statusMapper ?? { normalizePaymentStatus: () => 'pending', normalizeSubscriptionStatus: () => 'active' },
  };
  return new SubscriptionService(
    deps.logger ?? noopLogger,
    deps.billingIntentService ?? null,
    deps.subscriptionUpgradeService ?? null,
    deps.subscriptionChangeService ?? null,
    mockGatewayFactory,
    deps.billingPaymentRepository ?? null,
    deps.updateSubscriptionStrategyFactory ?? null,
    deps.subscriptionRepository ?? null,
    deps.billingCustomerRepository ?? null,
    deps.userRepository ?? null,
  );
}

export function createTestFindRelatedNotesByFileUseCase(deps = {}) {
  const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };
  return new FindRelatedNotesByFileUseCase(
    deps.contentRepository ?? null,
    deps.contentQueryRepository ?? null,
    deps.noteEmbeddingRepository ?? null,
    deps.runtimeEnv ?? { read: () => ({}) },
    deps.logger ?? noopLogger,
    deps.embeddingQueue ?? null,
  );
}
