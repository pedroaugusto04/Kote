import test from 'node:test';
import assert from 'node:assert/strict';

import { conversationBodySchema } from '../dist/interfaces/http/dto/operations.dto.js';
import { integrationProviderSchema, parseSaveIntegrationCredentialBody, resolveIntegrationCredentialBodySchema, saveIntegrationCredentialBodySchema } from '../dist/interfaces/http/dto/integration-credentials.dto.js';
import { internalN8nIngestBodySchema } from '../dist/interfaces/http/dto/internal-n8n.dto.js';
import { onboardingBodySchema } from '../dist/interfaces/http/dto/operations.dto.js';
import { markRemindersBodySchema, queryRequestSchema } from '../dist/interfaces/http/dto/query.dto.js';

test('query dto normalizes limit and slugs', () => {
  const parsed = queryRequestSchema.parse({
    query: 'deploy',
    limit: '7',
    mode: 'answer',
    workspaceSlug: 'My Workspace',
    projectSlug: 'N8N Automations',
  });

  assert.deepEqual(parsed, {
    query: 'deploy',
    limit: 7,
    mode: 'answer',
    workspaceSlug: 'my-workspace',
    projectSlug: 'n8n-automations',
  });
});

test('mark-sent dto requires ids array', () => {
  assert.throws(() => markRemindersBodySchema.parse({ ids: 'one' }));
  assert.deepEqual(markRemindersBodySchema.parse({ ids: ['one', ' two '] }), { ids: ['one', 'two'] });
});

test('onboarding dto accepts valid payloads', () => {
  const parsed = onboardingBodySchema.parse({
    workspaceSlug: 'Acme Team',
    displayName: 'Acme Team',
    projects: [{ projectSlug: 'N8N Automations', displayName: 'N8N Automations' }],
  });

  assert.equal(parsed.workspaceSlug, 'acme-team');
  assert.equal(parsed.projects[0].projectSlug, 'n8n-automations');
});

test('conversation dto accepts valid payloads', () => {
  const parsed = conversationBodySchema.parse({
    senderId: 'sender-1',
    groupId: 'group-1',
    messageText: 'deploy pronto',
  });

  assert.equal(parsed.senderId, 'sender-1');
  assert.equal(parsed.messageText, 'deploy pronto');
});

test('internal n8n ingest dto accepts direct and wrapped payloads', () => {
  const payload = {
    schemaVersion: 1,
    source: { channel: 'external', system: 'test', actor: '', conversationId: '', correlationId: 'corr-1' },
    event: { type: 'manual_note', occurredAt: '2026-04-27T10:00:00.000Z', projectSlug: 'N8N Automations' },
    content: { rawText: 'texto', title: '', attachments: [], sections: {} },
    classification: { kind: 'note', canonicalType: 'event', importance: 'low', tags: [], decisionFlag: false },
    actions: {},
    metadata: {},
  };

  assert.equal(internalN8nIngestBodySchema.parse(payload).payload.event.projectSlug, 'n8n-automations');
  assert.equal(internalN8nIngestBodySchema.parse({ payload, externalId: '123' }).payload.event.projectSlug, 'n8n-automations');
});

test('integration dto rejects invalid provider and invalid resolve payload', () => {
  assert.throws(() => integrationProviderSchema.parse('invalid'));
  assert.throws(() => resolveIntegrationCredentialBodySchema.parse({ workspaceSlug: 'default' }));
});

test('integration dto accepts valid save payload and keeps extra config validation deferred by provider', () => {
  const parsed = saveIntegrationCredentialBodySchema.parse({
    workspaceSlug: 'default',
    config: { token: 'secret' },
    publicMetadata: { label: 'ops bot' },
    externalIdentities: [{ provider: 'telegram', externalId: '123' }],
  });

  assert.equal(parsed.workspaceSlug, 'default');
  assert.equal(parsed.publicMetadata.label, 'ops bot');
});

test('integration dto rejects unexpected public metadata keys and invalid provider config', () => {
  assert.throws(() => saveIntegrationCredentialBodySchema.parse({
    workspaceSlug: 'default',
    config: { token: 'secret' },
    publicMetadata: { label: 'ops bot', apiKey: 'must-not-be-public' },
  }));

  const parsed = saveIntegrationCredentialBodySchema.parse({
    workspaceSlug: 'default',
    config: {},
    publicMetadata: { label: 'ops bot' },
  });
  assert.throws(() => parseSaveIntegrationCredentialBody('telegram', parsed), /invalid_integration_config/);
});
