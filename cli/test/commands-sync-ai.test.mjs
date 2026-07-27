import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';

const TEST_DIR = path.join(os.tmpdir(), `kb-cli-test-sync-ai-${Date.now()}`);

test('Sync AI sessions command integration', async (t) => {
  // Mock os.homedir to direct provider searches to our temp directory
  t.mock.method(os, 'homedir', () => TEST_DIR);

  t.before(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Setup Claude Code mock logs
    const claudeDir = path.join(TEST_DIR, '.claude', 'projects', 'my-project');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'claude-sess.jsonl'),
      `{"role": "user", "content": "How to build CLI?"}\n{"role": "assistant", "content": "Run npm run build:cli"}\n`,
      'utf8'
    );

    // Setup Codex mock logs
    const codexDir = path.join(TEST_DIR, '.codex', 'sessions');
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(
      path.join(codexDir, 'codex-sess.jsonl'),
      `{"role": "user", "content": "Hello Codex"}\n{"role": "assistant", "content": "Hi there"}\n`,
      'utf8'
    );

    // Setup Antigravity mock logs
    const antigravityDir = path.join(TEST_DIR, '.gemini', 'antigravity', 'brain', 'conv-123', '.system_generated', 'logs');
    fs.mkdirSync(antigravityDir, { recursive: true });
    fs.writeFileSync(
      path.join(antigravityDir, 'overview.txt'),
      `{"source": "USER_EXPLICIT", "type": "USER_INPUT", "content": "<USER_REQUEST>Hello Antigravity</USER_REQUEST>"}\n{"source": "MODEL", "type": "PLANNER_RESPONSE", "content": "Hello human"}\n`,
      'utf8'
    );

    // Setup OpenCode mock SQLite database
    const opencodeDir = path.join(TEST_DIR, '.local', 'share', 'opencode');
    fs.mkdirSync(opencodeDir, { recursive: true });
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(path.join(opencodeDir, 'opencode.db'));
      db.exec(`
        CREATE TABLE session (id TEXT, title TEXT, time_created INTEGER, time_updated INTEGER, slug TEXT);
        CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
        CREATE TABLE part (id TEXT, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
      `);
      db.exec(`
        INSERT INTO session VALUES ('ses_1', 'OpenCode Session Title', 1000, 1000, 'open-slug');
        INSERT INTO message VALUES ('msg_1', 'ses_1', 1000, '{"role": "user"}');
        INSERT INTO part VALUES ('p_1', 'msg_1', 'ses_1', 1000, '{"type": "text", "text": "Hello OpenCode"}');
        INSERT INTO message VALUES ('msg_2', 'ses_1', 2000, '{"role": "assistant"}');
        INSERT INTO part VALUES ('p_2', 'msg_2', 'ses_1', 2000, '{"type": "text", "text": "Hello from OpenCode Assistant!"}');
      `);
      db.close();
    } catch {
      // In case sqlite module isn't loaded/supported in test context (though it should be)
    }
  });

  t.after(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  await t.test('runSyncAi scans, lists, displays select, and saves selected session note', async () => {
    let createdNote = null;
    const server = await new Promise((resolve) => {
      const srv = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);

        if (req.method === 'POST' && req.url.includes('/notes')) {
          createdNote = JSON.parse(Buffer.concat(chunks).toString());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'mock-imported-id' }));
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
      // Setup mock API config
      const { saveConfig, clearConfigAuth } = await import('../../cli/dist/config.js');
      clearConfigAuth();
      saveConfig({
        apiUrl: server.url,
        workspaceSlug: 'sync-ai-ws',
        defaultProjectSlug: 'inbox',
        cookies: { kb_access_token: 'mock-sync-ai-token' },
      });

      // Import command and its clack object wrapper to apply mocks
      const { runSyncAi, clack } = await import('../../cli/dist/commands/sync-ai.js');

      // Mock clack prompts
      t.mock.method(clack, 'spinner', () => ({
        start: () => {},
        stop: () => {},
      }));

      t.mock.method(clack, 'isCancel', () => false);

      let capturedOptions = null;
      t.mock.method(clack, 'select', async (opts) => {
        capturedOptions = opts.options;
        // Find the Antigravity session from the list
        const antiSess = opts.options.find(o => o.value.providerId === 'antigravity');
        return antiSess.value;
      });

      // Capture logs
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        await runSyncAi({ project: 'custom-proj' });
      } finally {
        console.log = originalLog;
      }

      // Check captured select options contained our providers
      assert.ok(capturedOptions, 'Should have prompted with options');
      const providersList = capturedOptions.map(o => o.value.providerId);
      assert.ok(providersList.includes('antigravity'), 'Should list Antigravity session');
      assert.ok(providersList.includes('claude-code'), 'Should list Claude Code session');
      assert.ok(providersList.includes('codex-cli'), 'Should list Codex session');

      // Check that the correct note was posted to the API
      assert.ok(createdNote, 'API should be called to create a note');
      
      const dateObj = new Date();
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const expectedTitle = `Antigravity: Hello Antigravity (${year}-${month}-${day})`;

      assert.equal(createdNote.title, expectedTitle);
      assert.equal(createdNote.projectSlug, 'custom-proj');
      assert.equal(createdNote.sourceChannel, 'ai-chat');
      assert.ok(createdNote.rawText.includes('Source: Antigravity'));
      assert.ok(createdNote.rawText.includes('### 👤 User\nHello Antigravity'));
      assert.ok(createdNote.rawText.includes('### ✨ Assistant\nHello human'));

    } finally {
      await server.close();
    }
  });

  await t.test('runSyncAi pagination loop handles LOAD_MORE selection', async () => {
    let createdNote = null;
    const server = await new Promise((resolve) => {
      const srv = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        if (req.method === 'POST' && req.url.includes('/notes')) {
          createdNote = JSON.parse(Buffer.concat(chunks).toString());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'paginated-id' }));
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({}));
      });
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        resolve({
          url: `http://127.0.0.1:${addr.port}`,
          close: () => new Promise((r) => srv.close(r)),
        });
      });
    });

    // Write 25 Claude files in a nested projects folder to force pagination
    const paginatedDir = path.join(TEST_DIR, '.claude', 'projects', 'paginated');
    fs.mkdirSync(paginatedDir, { recursive: true });
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(
        path.join(paginatedDir, `session-${i}.jsonl`),
        `{"role": "user", "content": "Query number ${i}"}\n{"role": "assistant", "content": "Response ${i}"}\n`,
        'utf8'
      );
    }

    try {
      const { saveConfig, clearConfigAuth } = await import('../../cli/dist/config.js');
      clearConfigAuth();
      saveConfig({
        apiUrl: server.url,
        workspaceSlug: 'sync-ai-ws',
        defaultProjectSlug: 'inbox',
        cookies: { kb_access_token: 'mock-sync-ai-token' },
      });

      const { runSyncAi, clack } = await import('../../cli/dist/commands/sync-ai.js');

      // Mock clack prompts
      t.mock.method(clack, 'spinner', () => ({
        start: () => {},
        stop: () => {},
      }));
      t.mock.method(clack, 'isCancel', () => false);

      let selectCallsCount = 0;
      let optionsReceivedFirstCall = null;
      let optionsReceivedSecondCall = null;

      t.mock.method(clack, 'select', async (opts) => {
        selectCallsCount++;
        if (selectCallsCount === 1) {
          optionsReceivedFirstCall = opts.options;
          return 'LOAD_MORE'; // Select load more on first prompt
        }
        optionsReceivedSecondCall = opts.options;
        // Select the first real option on second prompt
        return opts.options[0].value;
      });

      // Capture logs
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        await runSyncAi({ project: 'custom-proj' });
      } finally {
        console.log = originalLog;
      }

      assert.equal(selectCallsCount, 2, 'Should prompt exactly twice');
      assert.equal(optionsReceivedFirstCall.length, 21, 'First call should list 20 sessions + 1 LOAD_MORE');
      assert.equal(optionsReceivedFirstCall[20].value, 'LOAD_MORE');
      assert.ok(optionsReceivedSecondCall.length > 21, 'Second call should display more sessions');
      assert.ok(createdNote, 'Note should be successfully saved');
    } finally {
      await server.close();
    }
  });
});
