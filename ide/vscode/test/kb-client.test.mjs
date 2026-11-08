import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_AI_REQUEST_TIMEOUT_MS,
  KbClient,
} = require('../out/kb-client.js');

test('timeout constants are defined with resilient values', () => {
  assert.equal(DEFAULT_REQUEST_TIMEOUT_MS, 30_000);
  assert.equal(DEFAULT_AI_REQUEST_TIMEOUT_MS, 120_000);
});

test('sendConversationTurn and ask use DEFAULT_AI_REQUEST_TIMEOUT_MS by default', async () => {
  const client = new KbClient();
  const capturedCalls = [];

  // Mock internal fetch to verify timeout options passed
  client.fetch = async (urlPath, options) => {
    capturedCalls.push({ urlPath, options });
    return { action: 'ask', replyText: 'mocked', payload: null, agent: null };
  };

  // 1. sendConversationTurn without explicit timeout
  await client.sendConversationTurn({
    messageText: 'what decisions were made',
    senderId: 'user1',
    chatId: 'chat1',
    messageId: 'msg1',
  });

  assert.equal(capturedCalls.length, 1);
  assert.equal(capturedCalls[0].urlPath.startsWith('/api/conversation/agent'), true);
  assert.equal(capturedCalls[0].options.timeout, DEFAULT_AI_REQUEST_TIMEOUT_MS);

  // 2. sendConversationTurn with explicit timeout override
  await client.sendConversationTurn(
    {
      messageText: 'quick query',
      senderId: 'user1',
      chatId: 'chat1',
      messageId: 'msg2',
    },
    'my-workspace',
    'my-project',
    { timeout: 45_000 },
  );

  assert.equal(capturedCalls.length, 2);
  assert.equal(capturedCalls[1].options.timeout, 45_000);

  // 3. ask without explicit timeout
  await client.ask('what decisions were made', 'my-project');
  assert.equal(capturedCalls.length, 3);
  assert.equal(capturedCalls[2].urlPath, '/api/ask');
  assert.equal(capturedCalls[2].options.timeout, DEFAULT_AI_REQUEST_TIMEOUT_MS);

  // 4. ask with explicit timeout override
  await client.ask('what decisions were made', 'my-project', { timeout: 15_000 });
  assert.equal(capturedCalls.length, 4);
  assert.equal(capturedCalls[3].options.timeout, 15_000);
});

test('getFileNotesSummary, findNotesBySnippet, getSessionHandoff and syncProjectCommits pass increased timeouts', async () => {
  const client = new KbClient();
  const capturedCalls = [];

  client.fetch = async (urlPath, options) => {
    capturedCalls.push({ urlPath, options });
    return {};
  };

  await client.getFileNotesSummary('src/index.ts');
  assert.equal(capturedCalls[0].options.timeout, DEFAULT_AI_REQUEST_TIMEOUT_MS);

  await client.findNotesBySnippet({ filePath: 'src/index.ts' });
  assert.equal(capturedCalls[1].options.timeout, DEFAULT_AI_REQUEST_TIMEOUT_MS);

  await client.getSessionHandoff({ rawText: 'session summary' });
  assert.equal(capturedCalls[2].options.timeout, DEFAULT_AI_REQUEST_TIMEOUT_MS);

  await client.syncProjectCommits('my-project', []);
  assert.equal(capturedCalls[3].options.timeout, 60_000);
});
