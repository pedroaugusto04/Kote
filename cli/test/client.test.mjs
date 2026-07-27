import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';

// Isolate config for tests
const TEST_DIR = path.join(os.tmpdir(), `kb-cli-test-client-${Date.now()}`);
process.env.KB_CLI_CONFIG_DIR = TEST_DIR;

const { ApiClient, ApiClientError } = await import('../../cli/dist/client.js');
const { saveConfig, loadConfig, clearConfigAuth } = await import('../../cli/dist/config.js');

/**
 * Start a lightweight HTTP server that returns predefined responses.
 * @param {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => void} handler
 * @returns {Promise<{url: string, close: () => Promise<void>}>}
 */
function startTestServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

test('ApiClient', async (t) => {
  t.before(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  t.after(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  await t.test('ApiClientError carries status and body', () => {
    const error = new ApiClientError(422, 'Validation failed', { detail: 'bad input' });
    assert.equal(error.status, 422);
    assert.equal(error.message, 'Validation failed');
    assert.deepEqual(error.body, { detail: 'bad input' });
    assert.equal(error.name, 'ApiClientError');
    assert.ok(error instanceof Error);
  });

  await t.test('fetch sends cookies from config and returns JSON', async () => {
    const server = await startTestServer((req, res) => {
      // Verify cookies are sent
      const cookies = req.headers.cookie || '';
      assert.ok(cookies.includes('kb_access_token=tok-abc'), `expected cookie, got: ${cookies}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: 'hello' }));
    });

    try {
      clearConfigAuth();
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'tok-abc' } });

      const client = new ApiClient();
      const result = await client.fetch('/api/test');

      assert.deepEqual(result, { data: 'hello' });
    } finally {
      await server.close();
    }
  });

  await t.test('fetch throws ApiClientError on non-ok responses', async () => {
    const server = await startTestServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not found' }));
    });

    try {
      clearConfigAuth();
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'tok-xyz' } });

      const client = new ApiClient();
      await assert.rejects(
        () => client.fetch('/api/missing'),
        (err) => {
          assert.ok(err instanceof ApiClientError);
          assert.equal(err.status, 404);
          assert.equal(err.message, 'Not found');
          return true;
        },
      );
    } finally {
      await server.close();
    }
  });

  await t.test('fetch returns null for 204 No Content', async () => {
    const server = await startTestServer((_req, res) => {
      res.writeHead(204);
      res.end();
    });

    try {
      clearConfigAuth();
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'tok-abc' } });

      const client = new ApiClient();
      const result = await client.fetch('/api/empty');
      assert.equal(result, null);
    } finally {
      await server.close();
    }
  });

  await t.test('fetch persists Set-Cookie headers from server response', async () => {
    const server = await startTestServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': ['kb_access_token=new-token; Path=/; HttpOnly', 'kb_refresh_token=new-refresh; Path=/; HttpOnly'],
      });
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      clearConfigAuth();
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'old-token' } });

      const client = new ApiClient();
      await client.fetch('/api/refresh-cookies');

      const config = loadConfig();
      assert.equal(config.cookies.kb_access_token, 'new-token');
      assert.equal(config.cookies.kb_refresh_token, 'new-refresh');
    } finally {
      await server.close();
    }
  });

  await t.test('login clears old auth, sends credentials, and saves new tokens', async () => {
    let receivedBody = null;
    const server = await startTestServer(async (req, res) => {
      if (req.url.includes('/auth/login')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        receivedBody = JSON.parse(Buffer.concat(chunks).toString());
        
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': ['kb_access_token=login-tok; Path=/; HttpOnly'],
        });
        res.end(JSON.stringify({ user: { id: 'u1' } }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({}));
      }
    });

    try {
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'should-be-cleared' } });

      const client = new ApiClient();
      const result = await client.login('test@example.com', 'pass123');

      assert.deepEqual(receivedBody, { email: 'test@example.com', password: 'pass123' });
      assert.deepEqual(result, { user: { id: 'u1' } });
      assert.equal(loadConfig().cookies.kb_access_token, 'login-tok');
    } finally {
      await server.close();
    }
  });

  await t.test('logout calls server and clears local auth', async () => {
    let logoutCalled = false;
    const server = await startTestServer((req, res) => {
      if (req.url.includes('/auth/logout')) {
        logoutCalled = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({}));
      }
    });

    try {
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'before-logout' } });

      const client = new ApiClient();
      await client.logout();

      assert.ok(logoutCalled, 'logout endpoint should be called');
      const config = loadConfig();
      assert.deepEqual(config.cookies, {}, 'cookies should be cleared after logout');
    } finally {
      await server.close();
    }
  });

  await t.test('logout clears local auth even when server call fails', async () => {
    const server = await startTestServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Server error' }));
    });

    try {
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'before-fail-logout' } });

      const client = new ApiClient();
      // logout() uses try/finally so clearConfigAuth() runs, but the fetch error
      // still propagates. Verify auth is cleared even though it throws.
      try {
        await client.logout();
      } catch {
        // Expected — the 500 from fetch propagates
      }

      const config = loadConfig();
      assert.deepEqual(config.cookies, {}, 'cookies should be cleared even on server failure');
    } finally {
      await server.close();
    }
  });

  await t.test('ask sends question and workspace context', async () => {
    let receivedBody = null;
    const server = await startTestServer(async (req, res) => {
      if (req.url.includes('/ask')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        receivedBody = JSON.parse(Buffer.concat(chunks).toString());

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ answer: 'Deploy to staging first.' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({}));
      }
    });

    try {
      clearConfigAuth();
      saveConfig({ apiUrl: server.url, workspaceSlug: 'my-ws', cookies: { kb_access_token: 'tok' } });

      const client = new ApiClient();
      const result = await client.ask('How to deploy?', 'infra');

      assert.equal(receivedBody.question, 'How to deploy?');
      assert.equal(receivedBody.projectSlug, 'infra');
      assert.equal(receivedBody.workspaceSlug, 'my-ws');
      assert.equal(result.answer, 'Deploy to staging first.');
    } finally {
      await server.close();
    }
  });

  await t.test('sendAgentMessage sends payload with workspace and project context', async () => {
    let receivedBody = null;
    let receivedUrl = '';
    const server = await startTestServer(async (req, res) => {
      if (req.url.includes('/conversation/agent')) {
        receivedUrl = req.url;
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        receivedBody = JSON.parse(Buffer.concat(chunks).toString());

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ action: 'submit', replyText: 'Note saved!' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({}));
      }
    });

    try {
      clearConfigAuth();
      saveConfig({ apiUrl: server.url, workspaceSlug: 'ws-1', defaultProjectSlug: 'inbox', cookies: { kb_access_token: 'tok' } });

      const client = new ApiClient();
      const result = await client.sendAgentMessage('My note', undefined, 'custom-proj');

      assert.ok(receivedUrl.includes('workspaceSlug=ws-1'));
      assert.ok(receivedUrl.includes('projectSlug=custom-proj'));
      assert.equal(receivedBody.messageText, 'My note');
      assert.equal(receivedBody.senderId, 'cli-user');
      assert.equal(receivedBody.hasMedia, false);
      assert.equal(result.action, 'submit');
    } finally {
      await server.close();
    }
  });

  await t.test('listProjects sends GET request to /api/projects', async () => {
    let receivedUrl = '';
    const server = await startTestServer((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ projects: [{ projectSlug: 'inbox' }] }));
    });

    try {
      clearConfigAuth();
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'tok' } });

      const client = new ApiClient();
      const result = await client.listProjects();

      assert.ok(receivedUrl.includes('/projects'));
      assert.equal(result[0].projectSlug, 'inbox');
    } finally {
      await server.close();
    }
  });

  await t.test('listWorkspaces sends GET request to /api/workspaces', async () => {
    let receivedUrl = '';
    const server = await startTestServer((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ workspaces: [{ workspaceSlug: 'default' }] }));
    });

    try {
      clearConfigAuth();
      saveConfig({ apiUrl: server.url, cookies: { kb_access_token: 'tok' } });

      const client = new ApiClient();
      const result = await client.listWorkspaces();

      assert.ok(receivedUrl.includes('/workspaces'));
      assert.equal(result.workspaces[0].workspaceSlug, 'default');
    } finally {
      await server.close();
    }
  });

  await t.test('fetch attempts token refresh on 401 and retries original request', async () => {
    let callCount = 0;
    const server = await startTestServer(async (req, res) => {
      if (req.url.includes('/auth/refresh')) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': ['kb_access_token=refreshed-tok; Path=/; HttpOnly'],
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      callCount++;
      if (callCount === 1) {
        // First call: return 401 to trigger refresh
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Unauthorized' }));
      } else {
        // Second call (after refresh): succeed
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: 'after-refresh' }));
      }
    });

    try {
      clearConfigAuth();
      saveConfig({
        apiUrl: server.url,
        cookies: { kb_access_token: 'expired', kb_refresh_token: 'valid-refresh' },
      });

      const client = new ApiClient();
      const result = await client.fetch('/api/protected');

      assert.equal(callCount, 2, 'original request should be retried after refresh');
      assert.deepEqual(result, { data: 'after-refresh' });
    } finally {
      await server.close();
    }
  });

  await t.test('fetch clears auth when refresh also fails', async () => {
    const server = await startTestServer((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Unauthorized' }));
    });

    try {
      clearConfigAuth();
      saveConfig({
        apiUrl: server.url,
        cookies: { kb_access_token: 'expired', kb_refresh_token: 'also-expired' },
      });

      const client = new ApiClient();
      await assert.rejects(
        () => client.fetch('/api/protected'),
        (err) => {
          assert.ok(err instanceof ApiClientError);
          assert.equal(err.status, 401);
          return true;
        },
      );

      const config = loadConfig();
      assert.deepEqual(config.cookies, {}, 'auth should be cleared when refresh fails');
    } finally {
      await server.close();
    }
  });

  await t.test('apiUrl path deduplication avoids double /api prefix', async () => {
    let receivedUrl = '';
    const server = await startTestServer((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      clearConfigAuth();
      // apiUrl already ends with /api
      saveConfig({ apiUrl: `${server.url}/api`, cookies: { kb_access_token: 'tok' } });

      const client = new ApiClient();
      await client.fetch('/api/test');

      // Should NOT result in /api/api/test
      assert.ok(!receivedUrl.includes('/api/api/'), `URL should not have double /api, got: ${receivedUrl}`);
      assert.ok(receivedUrl.includes('/test'), `URL should contain /test, got: ${receivedUrl}`);
    } finally {
      await server.close();
    }
  });
});
