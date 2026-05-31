import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';

// Isolate config for sync command tests
const TEST_DIR = path.join(os.tmpdir(), `kb-cli-test-sync-${Date.now()}`);
process.env.KB_CLI_CONFIG_DIR = TEST_DIR;

const { saveConfig, loadConfig, clearConfigAuth } = await import('../../cli/dist/config.js');

test('Sync command integration', async (t) => {
  let tempSyncDir = '';

  t.before(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
    tempSyncDir = path.join(TEST_DIR, 'sync-folder');
    fs.mkdirSync(tempSyncDir, { recursive: true });
  });

  t.after(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  await t.test('runSync scans dir, calls create API, injects ID and creates ledger', async () => {
    let createdPayloads = [];
    const server = await new Promise((resolve) => {
      const srv = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);

        if (req.method === 'POST' && req.url.includes('/notes')) {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          createdPayloads.push(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ noteId: `mock-id-${createdPayloads.length}` }));
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
        workspaceSlug: 'sync-ws',
        defaultProjectSlug: 'inbox',
        cookies: { kb_access_token: 'sync-token' },
      });

      // Create a markdown file to sync
      const notePath = path.join(tempSyncDir, 'test-note.md');
      fs.writeFileSync(
        notePath,
        `---
title: My First Note
tags: test, sync
---
Hello from local file sync!`,
        'utf8'
      );

      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        const { runSync } = await import('../../cli/dist/commands/sync.js');
        await runSync({ dir: tempSyncDir });
      } finally {
        console.log = originalLog;
      }

      // Check API was called correctly
      assert.equal(createdPayloads.length, 1);
      assert.equal(createdPayloads[0].title, 'My First Note');
      assert.deepEqual(createdPayloads[0].tags, ['test', 'sync']);
      assert.equal(createdPayloads[0].rawText, 'Hello from local file sync!');

      // Check ID was injected back into file frontmatter
      const updatedContent = fs.readFileSync(notePath, 'utf8');
      assert.ok(updatedContent.includes('id: mock-id-1'), 'ID should be injected back');

      // Check ledger exists and has the entry
      const ledgerPath = path.join(tempSyncDir, '.kb-sync.json');
      assert.ok(fs.existsSync(ledgerPath), 'Ledger file should be created');
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      assert.ok(ledger.files['test-note.md']);
      assert.equal(ledger.files['test-note.md'].noteId, 'mock-id-1');
    } finally {
      await server.close();
    }
  });

  await t.test('runSync updates existing note if ledger and ID are present and hash changed', async () => {
    let updatedPayloads = [];
    const server = await new Promise((resolve) => {
      const srv = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);

        if (req.method === 'PATCH' && req.url.includes('/notes/mock-id-1')) {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          updatedPayloads.push(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
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
        workspaceSlug: 'sync-ws',
        defaultProjectSlug: 'inbox',
        cookies: { kb_access_token: 'sync-token' },
      });

      // Update local file content
      const notePath = path.join(tempSyncDir, 'test-note.md');
      fs.writeFileSync(
        notePath,
        `---
id: mock-id-1
title: My First Note Updated
tags: test, sync, updated
---
Hello from local file sync - edit!`,
        'utf8'
      );

      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        const { runSync } = await import('../../cli/dist/commands/sync.js');
        // Clear require cache or use another way to re-run? 
        // Importing was already done, but we can call it directly
        await runSync({ dir: tempSyncDir });
      } finally {
        console.log = originalLog;
      }

      // Check API was called to update
      assert.equal(updatedPayloads.length, 1);
      assert.equal(updatedPayloads[0].title, 'My First Note Updated');
      assert.equal(updatedPayloads[0].rawText, 'Hello from local file sync - edit!');
    } finally {
      await server.close();
    }
  });

  await t.test('runSync skips note if hash has not changed', async () => {
    let apiCalled = false;
    const server = await new Promise((resolve) => {
      const srv = createServer(async (req, res) => {
        apiCalled = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
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

    try {
      clearConfigAuth();
      saveConfig({
        apiUrl: server.url,
        workspaceSlug: 'sync-ws',
        defaultProjectSlug: 'inbox',
        cookies: { kb_access_token: 'sync-token' },
      });

      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        const { runSync } = await import('../../cli/dist/commands/sync.js');
        await runSync({ dir: tempSyncDir });
      } finally {
        console.log = originalLog;
      }

      // API should not be called
      assert.equal(apiCalled, false, 'API should have been skipped');
    } finally {
      await server.close();
    }
  });

  await t.test('runSync syncs a single file when file path is provided instead of dir', async () => {
    let createdPayloads = [];
    const server = await new Promise((resolve) => {
      const srv = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);

        if (req.method === 'POST' && req.url.includes('/notes')) {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          createdPayloads.push(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ noteId: 'mock-single-file-id' }));
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
        workspaceSlug: 'sync-ws',
        defaultProjectSlug: 'inbox',
        cookies: { kb_access_token: 'sync-token' },
      });

      // Create a markdown file to sync
      const singleFilePath = path.join(tempSyncDir, 'single-file.md');
      fs.writeFileSync(
        singleFilePath,
        `---
title: Single File Sync
tags: single
---
Body of single file`,
        'utf8'
      );

      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        const { runSync } = await import('../../cli/dist/commands/sync.js');
        await runSync({ dir: singleFilePath });
      } finally {
        console.log = originalLog;
      }

      // Check API was called correctly
      assert.equal(createdPayloads.length, 1);
      assert.equal(createdPayloads[0].title, 'Single File Sync');

      // Check ID was injected back into file frontmatter
      const updatedContent = fs.readFileSync(singleFilePath, 'utf8');
      assert.ok(updatedContent.includes('id: mock-single-file-id'), 'ID should be injected back');
    } finally {
      await server.close();
    }
  });
});

