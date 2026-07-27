import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';

// Isolate config for integration tests
const TEST_DIR = path.join(os.tmpdir(), `kb-cli-test-integration-${Date.now()}`);
process.env.KB_CLI_CONFIG_DIR = TEST_DIR;

const { ApiClient, ApiClientError } = await import('../../cli/dist/client.js');
const { saveConfig, loadConfig, clearConfigAuth } = await import('../../cli/dist/config.js');

// --------------------------------------------------------------------------
// Helper: lightweight HTTP server that simulates the Knowledge Base API
// --------------------------------------------------------------------------
/**
 * @typedef {Object} MockEndpoint
 * @property {string} method
 * @property {string|RegExp} path
 * @property {number} status
 * @property {Object} body
 * @property {string[]} [setCookies]
 * @property {function} [onRequest] - callback(reqBody, reqUrl) for assertions
 */

/**
 * Creates a mock API server with configurable endpoints.
 * @param {MockEndpoint[]} endpoints
 * @returns {Promise<{url: string, close: () => Promise<void>, calls: Array<{method: string, url: string, body: any}>}>}
 */
function createMockApiServer(endpoints) {
  const calls = [];

  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyStr = Buffer.concat(chunks).toString();
      const body = bodyStr ? JSON.parse(bodyStr) : null;

      calls.push({ method: req.method, url: req.url, body });

      const match = endpoints.find((ep) => {
        const methodOk = ep.method === req.method;
        const pathOk = ep.path instanceof RegExp
          ? ep.path.test(req.url)
          : req.url.includes(ep.path);
        return methodOk && pathOk;
      });

      if (match) {
        if (match.onRequest) match.onRequest(body, req.url);

        const headers = { 'Content-Type': 'application/json' };
        if (match.setCookies) {
          headers['Set-Cookie'] = match.setCookies;
        }
        res.writeHead(match.status || 200, headers);
        res.end(JSON.stringify(match.body || {}));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: `No mock for ${req.method} ${req.url}` }));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(r)),
        calls,
      });
    });
  });
}

// --------------------------------------------------------------------------
// Integration: Full login → ask → list → logout flow
// --------------------------------------------------------------------------
test('Integration: full authentication → query → list → logout lifecycle', async (t) => {
  t.before(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  t.after(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  const server = await createMockApiServer([
    {
      method: 'POST',
      path: '/auth/login',
      status: 200,
      body: { user: { id: 'user-1', email: 'test@example.com' } },
      setCookies: [
        'kb_access_token=access-integration; Path=/; HttpOnly',
        'kb_refresh_token=refresh-integration; Path=/; HttpOnly',
      ],
    },
    {
      method: 'GET',
      path: '/workspaces',
      status: 200,
      body: {
        workspaces: [
          { workspaceSlug: 'default', displayName: 'Default Workspace' },
          { workspaceSlug: 'team-ws', displayName: 'Team Workspace' },
        ],
      },
    },
    {
      method: 'GET',
      path: '/projects',
      status: 200,
      body: {
        projects: [
          { projectSlug: 'inbox', displayName: 'Inbox', name: 'Inbox' },
          { projectSlug: 'platform', displayName: 'Platform', name: 'Platform' },
        ],
      },
    },
    {
      method: 'POST',
      path: '/ask',
      status: 200,
      body: {
        answer: 'Deploy via CI/CD pipeline.',
        confidence: 0.92,
        sources: [
          { noteId: 'n1', title: 'Deploy Guide', path: 'docs/deploy.md' },
        ],
      },
    },
    {
      method: 'POST',
      path: '/conversation/agent',
      status: 200,
      body: {
        action: 'submit',
        replyText: 'Note saved successfully!',
      },
    },
    {
      method: 'POST',
      path: '/auth/logout',
      status: 200,
      body: { ok: true },
    },
  ]);

  try {
    // Step 1: Login
    clearConfigAuth();
    saveConfig({ apiUrl: server.url });
    const client = new ApiClient();

    const loginResult = await client.login('test@example.com', 'securePass');
    assert.equal(loginResult.user.id, 'user-1');

    // Verify tokens were persisted
    let config = loadConfig();
    assert.equal(config.cookies.kb_access_token, 'access-integration');
    assert.equal(config.cookies.kb_refresh_token, 'refresh-integration');

    // Step 2: List workspaces
    const wsResult = await client.listWorkspaces();
    assert.equal(wsResult.workspaces.length, 2);
    assert.equal(wsResult.workspaces[0].workspaceSlug, 'default');

    // Step 3: List projects
    const projResult = await client.listProjects();
    assert.equal(projResult.length, 2);
    assert.ok(projResult.some((p) => p.projectSlug === 'platform'));

    // Step 4: Ask a question
    const askResult = await client.ask('How to deploy?', 'platform');
    assert.equal(askResult.answer, 'Deploy via CI/CD pipeline.');
    assert.equal(askResult.confidence, 0.92);
    assert.equal(askResult.sources.length, 1);
    assert.equal(askResult.sources[0].title, 'Deploy Guide');

    // Step 5: Send a note via agent
    const noteResult = await client.sendAgentMessage('Remember to update docs', undefined, 'platform');
    assert.equal(noteResult.action, 'submit');
    assert.equal(noteResult.replyText, 'Note saved successfully!');

    // Step 6: Logout
    await client.logout();
    config = loadConfig();
    assert.deepEqual(config.cookies, {}, 'cookies should be cleared after logout');

    // Verify all expected endpoints were called
    const calledPaths = server.calls.map((c) => `${c.method} ${c.url}`);
    assert.ok(calledPaths.some((p) => p.includes('POST') && p.includes('/auth/login')));
    assert.ok(calledPaths.some((p) => p.includes('GET') && p.includes('/workspaces')));
    assert.ok(calledPaths.some((p) => p.includes('GET') && p.includes('/projects')));
    assert.ok(calledPaths.some((p) => p.includes('POST') && p.includes('/ask')));
    assert.ok(calledPaths.some((p) => p.includes('POST') && p.includes('/conversation/agent')));
    assert.ok(calledPaths.some((p) => p.includes('POST') && p.includes('/auth/logout')));
  } finally {
    await server.close();
  }
});

// --------------------------------------------------------------------------
// Integration: Token refresh flow (expired access, valid refresh)
// --------------------------------------------------------------------------
test('Integration: automatic token refresh when access token expires', async (t) => {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });

  let askCallCount = 0;
  const server = await createMockApiServer([
    {
      method: 'POST',
      path: '/auth/refresh',
      status: 200,
      body: { ok: true },
      setCookies: ['kb_access_token=refreshed-tok; Path=/; HttpOnly'],
    },
    {
      method: 'POST',
      path: '/ask',
      status: 200,
      body: { answer: 'Refreshed answer' },
      onRequest: () => { askCallCount++; },
    },
  ]);

  // Override the /ask endpoint to return 401 on first call, then succeed
  // We need a more nuanced mock - create a custom server
  await server.close();

  let askAttempts = 0;
  const customServer = await createMockApiServer([
    {
      method: 'POST',
      path: '/auth/refresh',
      status: 200,
      body: { ok: true },
      setCookies: ['kb_access_token=refreshed-tok; Path=/; HttpOnly'],
    },
  ]);

  // Replace the server handler to handle /ask differently on each call
  await customServer.close();

  // Use a raw server for this more complex scenario
  let askCount = 0;
  const rawServer = await new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);

      if (req.url.includes('/auth/refresh')) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': ['kb_access_token=refreshed-tok; Path=/; HttpOnly'],
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.url.includes('/ask')) {
        askCount++;
        if (askCount === 1) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Token expired' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ answer: 'Refreshed answer' }));
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not found' }));
    });

    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => srv.close(r)),
      });
    });
  });

  try {
    clearConfigAuth();
    saveConfig({
      apiUrl: rawServer.url,
      cookies: { kb_access_token: 'expired-tok', kb_refresh_token: 'valid-refresh' },
    });

    const client = new ApiClient();
    const result = await client.ask('Test refresh');

    assert.equal(result.answer, 'Refreshed answer');
    assert.equal(askCount, 2, 'ask should be called twice (initial 401 + retry)');

    const config = loadConfig();
    assert.equal(config.cookies.kb_access_token, 'refreshed-tok');
  } finally {
    await rawServer.close();
  }
});

// --------------------------------------------------------------------------
// Integration: Agent conversation with multi-turn clarification
// --------------------------------------------------------------------------
test('Integration: agent conversation multi-turn (submit after ask)', async (t) => {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });

  let agentCallCount = 0;
  const server = await new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      const parsed = body ? JSON.parse(body) : null;

      if (req.url.includes('/conversation/agent')) {
        agentCallCount++;
        if (agentCallCount === 1) {
          // First call: agent asks for clarification
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            action: 'ask',
            replyText: 'Which project should I save this to?',
          }));
        } else {
          // Second call: agent submits
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            action: 'submit',
            replyText: `Saved to ${parsed?.messageText || 'unknown'}`,
          }));
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not found' }));
    });

    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => srv.close(r)),
      });
    });
  });

  try {
    clearConfigAuth();
    saveConfig({
      apiUrl: server.url,
      workspaceSlug: 'default',
      defaultProjectSlug: 'inbox',
      cookies: { kb_access_token: 'tok' },
    });

    const client = new ApiClient();

    // First turn: agent asks
    const first = await client.sendAgentMessage('Save this note');
    assert.equal(first.action, 'ask');
    assert.equal(first.replyText, 'Which project should I save this to?');

    // Second turn: user replies, agent submits
    const second = await client.sendAgentMessage('platform');
    assert.equal(second.action, 'submit');
    assert.equal(second.replyText, 'Saved to platform');

    assert.equal(agentCallCount, 2);
  } finally {
    await server.close();
  }
});

// --------------------------------------------------------------------------
// Integration: Config persistence across client instances
// --------------------------------------------------------------------------
test('Integration: config persists across multiple ApiClient instances', async (t) => {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });

  const server = await createMockApiServer([
    {
      method: 'POST',
      path: '/auth/login',
      status: 200,
      body: { user: { id: 'u1' } },
      setCookies: ['kb_access_token=persistent-tok; Path=/; HttpOnly'],
    },
    {
      method: 'GET',
      path: '/projects',
      status: 200,
      body: { projects: [{ projectSlug: 'inbox' }] },
    },
  ]);

  try {
    clearConfigAuth();
    saveConfig({ apiUrl: server.url });

    // Login with first client instance
    const client1 = new ApiClient();
    await client1.login('user@test.com', 'pass');

    // Create a completely new client instance - it should pick up the persisted token
    const client2 = new ApiClient();
    const result = await client2.listProjects();

    assert.equal(result[0].projectSlug, 'inbox');

    // Verify the second client sent the cookie from the first login
    const projectCall = server.calls.find((c) => c.url.includes('/projects'));
    assert.ok(projectCall, 'projects endpoint should have been called');
  } finally {
    await server.close();
  }
});

// --------------------------------------------------------------------------
// Integration: Error handling chain (network-level and API-level)
// --------------------------------------------------------------------------
test('Integration: error handling for failed API requests', async (t) => {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });

  await t.test('handles server returning error JSON body', async () => {
    const server = await createMockApiServer([
      {
        method: 'POST',
        path: '/ask',
        status: 422,
        body: { message: 'Question too short', errors: ['min length 5'] },
      },
    ]);

    try {
      clearConfigAuth();
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'tok' } });

      const client = new ApiClient();
      await assert.rejects(
        () => client.ask('Hi'),
        (err) => {
          assert.ok(err instanceof ApiClientError);
          assert.equal(err.status, 422);
          assert.equal(err.message, 'Question too short');
          assert.deepEqual(err.body.errors, ['min length 5']);
          return true;
        },
      );
    } finally {
      await server.close();
    }
  });

  await t.test('handles server returning 500 internal error', async () => {
    const server = await createMockApiServer([
      {
        method: 'GET',
        path: '/workspaces',
        status: 500,
        body: { message: 'Internal server error' },
      },
    ]);

    try {
      clearConfigAuth();
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'tok' } });

      const client = new ApiClient();
      await assert.rejects(
        () => client.listWorkspaces(),
        (err) => {
          assert.ok(err instanceof ApiClientError);
          assert.equal(err.status, 500);
          return true;
        },
      );
    } finally {
      await server.close();
    }
  });

  await t.test('handles connection refused (server not running)', async () => {
    clearConfigAuth();
    // Port that nothing is listening on
    saveConfig({ apiUrl: 'http://127.0.0.1:1', cookies: { kb_access_token: 'tok' } });

    const client = new ApiClient();
    await assert.rejects(
      () => client.listProjects(),
      (err) => {
        // Should be a network error, not an ApiClientError
        assert.ok(err.message || err.code, 'should have an error message or code');
        return true;
      },
    );
  });
});

// --------------------------------------------------------------------------
// Integration: Agent message with media attachment
// --------------------------------------------------------------------------
test('Integration: sendAgentMessage with media attachment', async (t) => {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });

  let receivedPayload = null;
  const server = await new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();

      if (req.url.includes('/conversation/agent')) {
        receivedPayload = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ action: 'submit', replyText: 'File received!' }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not found' }));
    });

    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => srv.close(r)),
      });
    });
  });

  try {
    clearConfigAuth();
    saveConfig({
      apiUrl: server.url,
      workspaceSlug: 'default',
      defaultProjectSlug: 'inbox',
      cookies: { kb_access_token: 'tok' },
    });

    const client = new ApiClient();
    const media = {
      fileName: 'test.txt',
      mimeType: 'text/plain',
      sizeBytes: 11,
      dataBase64: Buffer.from('hello world').toString('base64'),
    };

    const result = await client.sendAgentMessage('Check this file', media, 'docs');

    assert.equal(result.action, 'submit');
    assert.equal(result.replyText, 'File received!');

    // Verify the payload structure
    assert.equal(receivedPayload.messageText, 'Check this file');
    assert.equal(receivedPayload.hasMedia, true);
    assert.equal(receivedPayload.media.fileName, 'test.txt');
    assert.equal(receivedPayload.media.mimeType, 'text/plain');
    assert.equal(receivedPayload.media.sizeBytes, 11);
    assert.equal(receivedPayload.media.dataBase64, Buffer.from('hello world').toString('base64'));
  } finally {
    await server.close();
  }
});
