import test from 'node:test';
import assert from 'node:assert/strict';

import { readEnvironment } from '../../../dist/adapters/environment.js';
import { buildIntegrationStatuses } from '../../../dist/application/integrations.js';

const baseProjects = [
  {
    projectSlug: 'n8n-automations',
    displayName: 'N8N Automations',
    repositories: [{
      id: '0',
      workspaceSlug: 'default',
      externalId: '0',
      fullName: 'acme/repo',
      htmlUrl: null,
      description: null,
      defaultBranch: null,
      createdAt: '',
      updatedAt: ''
    }],
    workspaceSlug: 'default',
    defaultTags: [],
    enabled: true,
  },
];

const baseWorkspaces = [
  {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '120363@g.us',
    telegramChatId: '123',
    githubRepos: ['acme/repo'],
    projectSlugs: ['n8n-automations'],
    createdAt: '',
    updatedAt: '',
  },
];

function env(overrides = {}) {
  return readEnvironment({
    KB_PUBLIC_BASE_URL: 'https://kb.example.com/knowledge-base',
    KB_API_PUBLIC_BASE_URL: 'https://kb.example.com/knowledge-base/api',
    KB_GITHUB_APP_INSTALL_URL: 'https://github.com/apps/kb/installations/new',
    KB_GITHUB_APP_WEBHOOK_SECRET: 'github-secret-value',
    KB_GITHUB_APP_ID: '12345',
    KB_GITHUB_APP_PRIVATE_KEY: 'github-private-key-value',
    EVOLUTION_API_URL: 'https://evolution.internal',
    EVOLUTION_API_KEY: 'evolution-key-value',
    EVOLUTION_INSTANCE_NAME: 'kb-instance',
    EVOLUTION_API_PUBLIC_URL: 'https://evolution.example.com',
    KB_TELEGRAM_BOT_TOKEN: 'telegram-token-value',
    KB_TELEGRAM_CHAT_ID: '123',
    KB_REVIEW_AI_PROVIDER: 'openrouter',
    KB_REVIEW_AI_API_KEY: 'review-key-value',
    KB_CONVERSATION_AI_PROVIDER: 'openai',
    KB_CONVERSATION_AI_API_KEY: 'conversation-key-value',
    KB_PROJECT_BRIEF_AI_PROVIDER: 'openai',
    KB_PROJECT_BRIEF_AI_API_KEY: 'project-brief-key-value',
    ...overrides,
  });
}

function byId(result, id) {
  return result.integrations.find((integration) => integration.id === id);
}

test('integration status reports connected services without leaking secrets', () => {
  const result = buildIntegrationStatuses({ environment: env(), workspaces: baseWorkspaces, projects: baseProjects });

  assert.equal(result.ok, true);
  assert.equal(result.workspaceSlug, 'default');
  assert.equal(byId(result, 'github-app').status, 'connected');
  assert.equal(byId(result, 'webhooks').links[0].url, 'https://kb.example.com/knowledge-base/api/n8n/webhook/kb-github-push');
  assert.equal(result.integrations.some((integration) => integration.name.includes('Vault')), false);

  const json = JSON.stringify(result);
  assert.equal(json.includes('github-secret-value'), false);
  assert.equal(json.includes('github-private-key-value'), false);
  assert.equal(json.includes('telegram-token-value'), false);
  assert.equal(json.includes('review-key-value'), false);
  assert.equal(json.includes('conversation-key-value'), false);
  assert.equal(json.includes('project-brief-key-value'), false);
});

test('integration status distinguishes partial and missing configuration', () => {
  const partial = buildIntegrationStatuses({
    environment: env({
      KB_PUBLIC_BASE_URL: '',
      KB_API_PUBLIC_BASE_URL: '',
      KB_GITHUB_APP_WEBHOOK_SECRET: '',
      KB_GITHUB_APP_ID: '',
      KB_TELEGRAM_BOT_TOKEN: '',
      KB_REVIEW_AI_API_KEY: '',
      KB_CONVERSATION_AI_API_KEY: '',
      KB_PROJECT_BRIEF_AI_API_KEY: '',
    }),
    workspaces: baseWorkspaces,
    projects: baseProjects,
  });

  assert.equal(byId(partial, 'github-app').status, 'partial');
  assert.equal(byId(partial, 'webhooks').status, 'partial');
  assert.equal(byId(partial, 'telegram').status, 'partial');
  assert.equal(byId(partial, 'ai-review').status, 'partial');
  assert.equal(byId(partial, 'ai-conversation').status, 'partial');
  assert.equal(byId(partial, 'project-brief-ai').status, 'partial');
  assert.deepEqual(byId(partial, 'webhooks').missingEnv, ['KB_API_PUBLIC_BASE_URL']);
  assert.equal(byId(partial, 'webhooks').links[0].url, '/n8n/webhook/kb-github-push');

  const missing = buildIntegrationStatuses({
    environment: env({
      KB_GITHUB_APP_INSTALL_URL: '',
      KB_GITHUB_APP_WEBHOOK_SECRET: '',
      KB_GITHUB_APP_ID: '',
      KB_GITHUB_APP_PRIVATE_KEY: '',
      EVOLUTION_API_URL: '',
      EVOLUTION_API_KEY: '',
      EVOLUTION_INSTANCE_NAME: '',
      EVOLUTION_API_PUBLIC_URL: '',
      KB_TELEGRAM_BOT_TOKEN: '',
      KB_TELEGRAM_CHAT_ID: '',
    }),
    workspaces: [],
    projects: [],
  });

  assert.equal(byId(missing, 'github-app').status, 'missing');
  assert.equal(byId(missing, 'whatsapp').status, 'missing');
  assert.equal(byId(missing, 'telegram').status, 'missing');
});
