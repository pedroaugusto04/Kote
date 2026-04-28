import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGithubReviewEvent } from '../dist/application/github-review.js';

test('github push is converted to canonical code review event', async () => {
  const event = await buildGithubReviewEvent(
    {
      headers: {},
      body: {
        ref: 'refs/heads/main',
        before: 'abc123',
        after: 'def456',
        repository: {
          full_name: 'pedroaugusto04/N8N-Automations',
          name: 'N8N-Automations',
        },
        pusher: {
          name: 'Pedro',
        },
        head_commit: {
          message: 'refactor knowledge base',
          timestamp: '2026-04-27T10:00:00.000Z',
          url: 'https://github.com/example/commit/def456',
        },
        commits: [
          {
            id: 'def456',
            message: 'refactor knowledge base',
            modified: ['knowledge-base/src/index.ts'],
          },
        ],
      },
      rawBody: '{}',
    },
    {
      vaultPath: '',
      archivePath: '',
      manifestPath: '',
      workspacesManifestPath: '',
      webhookSecret: '',
      githubWebhookSecret: '',
      attachmentMaxVaultBytes: 0,
      conversationTimeoutMs: 0,
      reviewAiProvider: 'none',
      reviewAiBaseUrl: '',
      reviewAiModel: '',
      reviewAiApiKey: '',
      conversationAiProvider: 'none',
      conversationAiBaseUrl: '',
      conversationAiModel: '',
      conversationAiApiKey: '',
      githubApiToken: '',
      enableGitPush: false,
      gitBatchMode: true,
      vaultRemoteUrl: '',
      gitUserName: '',
      gitUserEmail: '',
      gitPushUsername: '',
      gitPushToken: '',
      allowedGroupId: '',
      publicBaseUrl: 'https://example.com',
      githubPushWebhookPath: '/n8n/webhook/kb-github-push',
      ingestWebhookPath: '/n8n/webhook/kb-event',
      whatsappWebhookPath: '/n8n/webhook/whatsapp-kb-event',
      onboardingWebhookPath: '/n8n/webhook/kb-onboarding',
      queryWebhookPath: '/n8n/webhook/kb-query',
      githubAppInstallUrl: 'https://github.com/apps/example/installations/new',
      whatsappPairingUrl: 'https://example.com/connect-whatsapp',
    },
  );

  assert.equal(event.event.type, 'code_review');
  assert.equal(event.classification.canonicalType, 'knowledge');
  assert.match(event.content.title, /Review/);
  assert.equal(event.metadata.repoFullName, 'pedroaugusto04/N8N-Automations');
});
