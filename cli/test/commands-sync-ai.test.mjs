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

  t.before(async () => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Setup Claude Code mock logs
    const claudeDir = path.join(TEST_DIR, '.claude', 'projects', 'my-project');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'claude-sess.jsonl'),
      `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"How to build CLI?"}]}}\n{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I will inspect the project."},{"type":"tool_use","name":"Read"}]}}\n{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"internal tool output"}]}}\n{"type":"user","isMeta":true,"message":{"role":"user","content":"<system-reminder>internal instructions</system-reminder>"}}\n{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"private reasoning"},{"type":"text","text":"Run npm run build:cli"}]}}\n`,
      'utf8'
    );

    // Setup Codex mock logs
    const codexDir = path.join(TEST_DIR, '.codex', 'sessions');
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(
      path.join(codexDir, 'codex-sess.jsonl'),
      `{"type":"session_meta","payload":{"id":"codex-session-id"}}\n{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>internal context</environment_context>"}]}}\n{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Hello Codex, keep this question complete."}]}}\n{"type":"response_item","payload":{"type":"reasoning","summary":[{"type":"summary_text","text":"private reasoning"}]}}\n{"type":"response_item","payload":{"type":"message","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"I am inspecting files."}]}}\n{"type":"response_item","payload":{"type":"message","role":"assistant","phase":"final_answer","content":[{"type":"output_text","text":"Hi there, this is the complete final answer."}]}}\n`,
      'utf8'
    );

    // Setup Antigravity mock logs (both IDE and CLI)
    const antigravityDir = path.join(TEST_DIR, '.gemini', 'antigravity-ide', 'brain', 'conv-123', '.system_generated', 'logs');
    fs.mkdirSync(antigravityDir, { recursive: true });
    fs.writeFileSync(
      path.join(antigravityDir, 'transcript_full.jsonl'),
      `{"source":"USER_EXPLICIT","type":"USER_INPUT","content":"<USER_REQUEST>Hello Antigravity</USER_REQUEST><SYSTEM_MESSAGE>internal system content</SYSTEM_MESSAGE>"}\n{"source":"MODEL","type":"PLANNER_RESPONSE","content":"I am inspecting files."}\n{"source":"MODEL","type":"GENERIC","content":"Created At: now Tool output that must not be saved"}\n{"source":"MODEL","type":"PLANNER_RESPONSE","content":"<thought>private reasoning</thought>Hello human"}\n`,
      'utf8'
    );

    const antigravityCliDir = path.join(TEST_DIR, '.gemini', 'antigravity-cli', 'brain', 'conv-cli-456', '.system_generated', 'logs');
    fs.mkdirSync(antigravityCliDir, { recursive: true });
    fs.writeFileSync(
      path.join(antigravityCliDir, 'transcript.jsonl'),
      `{"source": "USER_EXPLICIT", "type": "USER_INPUT", "content": "<USER_REQUEST>Hello from Agy CLI</USER_REQUEST>"}\n{"source": "MODEL", "type": "PLANNER_RESPONSE", "content": "Hello from model"}\n`,
      'utf8'
    );

    // Setup OpenCode mock SQLite database
    const opencodeDir = path.join(TEST_DIR, '.local', 'share', 'opencode');
    fs.mkdirSync(opencodeDir, { recursive: true });
    try {
      const { DatabaseSync } = await import('node:sqlite');
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
        INSERT INTO message VALUES ('msg_2', 'ses_1', 1500, '{"role": "assistant", "finish": "tool-calls"}');
        INSERT INTO part VALUES ('p_2', 'msg_2', 'ses_1', 1500, '{"type": "text", "text": "I will inspect the repository."}');
        INSERT INTO message VALUES ('msg_3', 'ses_1', 2000, '{"role": "assistant", "finish": "stop"}');
        INSERT INTO part VALUES ('p_3', 'msg_3', 'ses_1', 2000, '{"type": "reasoning", "text": "private OpenCode reasoning"}');
        INSERT INTO part VALUES ('p_4', 'msg_3', 'ses_1', 2100, '{"type": "text", "text": "Hello from OpenCode Assistant!"}');
      `);
      db.close();
    } catch {
      // In case sqlite module isn't loaded/supported in test context (though it should be)
    }
  });

  await t.test('provider strategies parse current logs without internal model noise', async () => {
    const { ClaudeCodeHistoryProvider } = await import('../../cli/dist/ai-history/providers/claude-code.provider.js');
    const { CodexHistoryProvider } = await import('../../cli/dist/ai-history/providers/codex.provider.js');
    const { AntigravityHistoryProvider } = await import('../../cli/dist/ai-history/providers/antigravity.provider.js');
    const { OpenCodeHistoryProvider } = await import('../../cli/dist/ai-history/providers/opencode.provider.js');

    const claude = (await new ClaudeCodeHistoryProvider().getRecentSessions()).find(session => session.sessionId === 'claude-sess');
    assert.ok(claude, 'Should parse the current nested Claude transcript format');
    assert.deepEqual(claude.turns, [
      { role: 'user', content: 'How to build CLI?' },
      { role: 'assistant', content: 'Run npm run build:cli' },
    ]);

    const codex = (await new CodexHistoryProvider().getRecentSessions()).find(session => session.sessionId === 'codex-session-id');
    assert.ok(codex, 'Should parse the current Codex rollout format');
    assert.deepEqual(codex.turns, [
      { role: 'user', content: 'Hello Codex, keep this question complete.' },
      { role: 'assistant', content: 'Hi there, this is the complete final answer.' },
    ]);

    const antigravity = (await new AntigravityHistoryProvider().getRecentSessions()).find(session => session.sessionId === 'conv-123');
    assert.ok(antigravity, 'Should parse the current Antigravity transcript format');
    assert.deepEqual(antigravity.turns, [
      { role: 'user', content: 'Hello Antigravity' },
      { role: 'assistant', content: 'Hello human' },
    ]);

    const openCode = (await new OpenCodeHistoryProvider().getRecentSessions()).find(session => session.sessionId === 'ses_1');
    assert.ok(openCode, 'Should parse the current OpenCode database format');
    assert.deepEqual(openCode.turns, [
      { role: 'user', content: 'Hello OpenCode' },
      { role: 'assistant', content: 'Hello from OpenCode Assistant!' },
    ]);
  });

  await t.test('provider strategies correctly extract multi-model token usage into byModel array', async () => {
    const { ClaudeCodeHistoryProvider } = await import('../../cli/dist/ai-history/providers/claude-code.provider.js');

    // Create a multi-model Claude log file
    const multiClaudeDir = path.join(TEST_DIR, '.claude', 'projects', 'multi-model-proj');
    fs.mkdirSync(multiClaudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(multiClaudeDir, 'multi-claude.jsonl'),
      `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Plan task"}]}}\n` +
      `{"type":"assistant","message":{"model":"claude-3-5-sonnet-20241022","role":"assistant","content":[{"type":"text","text":"Planning..."}],"usage":{"input_tokens":1000,"output_tokens":200,"cache_read_input_tokens":500}}}\n` +
      `{"type":"assistant","message":{"model":"claude-3-5-haiku-20241022","role":"assistant","content":[{"type":"text","text":"Executing fast check..."}],"usage":{"input_tokens":500,"output_tokens":100,"cache_read_input_tokens":0}}}\n`,
      'utf8'
    );

    const claudeProvider = new ClaudeCodeHistoryProvider();
    const sessions = await claudeProvider.getRecentSessions();
    const multiSession = sessions.find((s) => s.sessionId === 'multi-claude');
    assert.ok(multiSession);
    assert.ok(multiSession.tokenUsage);
    assert.equal(multiSession.tokenUsage.totalTokens, 1800);
    assert.equal(multiSession.tokenUsage.inputTokens, 1500);
    assert.equal(multiSession.tokenUsage.outputTokens, 300);
    assert.ok(Array.isArray(multiSession.tokenUsage.byModel));
    assert.equal(multiSession.tokenUsage.byModel.length, 2);

    const sonnet = multiSession.tokenUsage.byModel.find((m) => m.model === 'claude-3-5-sonnet-20241022');
    assert.ok(sonnet);
    assert.equal(sonnet.inputTokens, 1000);
    assert.equal(sonnet.outputTokens, 200);
    assert.equal(sonnet.totalTokens, 1200);
    assert.equal(sonnet.cachedTokens, 500);

    const haiku = multiSession.tokenUsage.byModel.find((m) => m.model === 'claude-3-5-haiku-20241022');
    assert.ok(haiku);
    assert.equal(haiku.inputTokens, 500);
    assert.equal(haiku.outputTokens, 100);
    assert.equal(haiku.totalTokens, 600);

    // Test Antigravity multi-model token extraction
    const { AntigravityHistoryProvider } = await import('../../cli/dist/ai-history/providers/antigravity.provider.js');
    const multiAntiDir = path.join(TEST_DIR, '.gemini', 'antigravity-cli', 'brain', 'conv-multi-anti');
    const logsDir = path.join(multiAntiDir, '.system_generated', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    fs.writeFileSync(
      path.join(logsDir, 'transcript.jsonl'),
      `{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","content":"<USER_REQUEST>Initial request</USER_REQUEST><USER_SETTINGS_CHANGE>The user changed setting \`Model Selection\` from None to Gemini 3.7 Flash (Medium). No need to comment.</USER_SETTINGS_CHANGE>"}\n` +
      `{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","content":"Short response"}\n` +
      `{"step_index":2,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","content":"<USER_REQUEST>Second request</USER_REQUEST><USER_SETTINGS_CHANGE>The user changed setting \`Model Selection\` from Gemini 3.7 Flash (Medium) to Gemini 3.6 Flash (Low). No need to comment.</USER_SETTINGS_CHANGE>"}\n` +
      `{"step_index":3,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","content":"Much longer response with Gemini 3.6 to test weighted token allocation proportionally across the models in the transcript."}\n`,
      'utf8'
    );

    fs.writeFileSync(
      path.join(multiAntiDir, 'statusline.json'),
      JSON.stringify({
        model: { id: 'Gemini 3.6 Flash (Low)', display_name: 'Gemini 3.6 Flash (Low)' },
        context_window: {
          total_input_tokens: 10000,
          total_output_tokens: 2000,
          current_usage: { cache_read_input_tokens: 500 }
        }
      }),
      'utf8'
    );

    const antiProvider = new AntigravityHistoryProvider();
    const antiSessions = await antiProvider.getRecentSessions();
    const multiAntiSession = antiSessions.find((s) => s.sessionId === 'conv-multi-anti');
    assert.ok(multiAntiSession);
    assert.ok(multiAntiSession.tokenUsage);
    assert.equal(multiAntiSession.tokenUsage.totalTokens, 12000);
    assert.equal(multiAntiSession.tokenUsage.inputTokens, 10000);
    assert.equal(multiAntiSession.tokenUsage.outputTokens, 2000);
    assert.ok(Array.isArray(multiAntiSession.tokenUsage.byModel));
    assert.equal(multiAntiSession.tokenUsage.byModel.length, 2);

    const flash36 = multiAntiSession.tokenUsage.byModel.find((m) => m.model === 'Gemini 3.6 Flash (Low)');
    assert.ok(flash36);
    assert.ok(flash36.totalTokens > 0);

    const flash37 = multiAntiSession.tokenUsage.byModel.find((m) => m.model === 'Gemini 3.7 Flash (Medium)');
    assert.ok(flash37);
    assert.ok(flash37.totalTokens > 0);

    assert.equal(flash36.totalTokens + flash37.totalTokens, 12000);
    assert.equal(flash36.inputTokens + flash37.inputTokens, 10000);
    assert.equal(flash36.outputTokens + flash37.outputTokens, 2000);
    assert.ok(flash36.totalTokens > flash37.totalTokens, 'Flash 3.6 should have more tokens due to heavier content in its step');
    assert.equal(multiAntiSession.tokenUsage.model, 'Gemini 3.6 Flash (Low)', 'Primary model should be the one with more tokens');

    fs.rmSync(multiAntiDir, { recursive: true, force: true });

    // Test Codex multi-model token extraction
    const { CodexHistoryProvider } = await import('../../cli/dist/ai-history/providers/codex.provider.js');
    const multiCodexDir = path.join(TEST_DIR, '.codex', 'sessions', '2026', '09', '19');
    fs.mkdirSync(multiCodexDir, { recursive: true });
    fs.writeFileSync(
      path.join(multiCodexDir, 'rollout-multi-codex.jsonl'),
      `{"type":"session_meta","payload":{"id":"multi-codex","model":"gpt-6-astra"}}\n` +
      `{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"First turn"}]}}\n` +
      `{"type":"token_usage_record","payload":{"usage":{"input_tokens":5000,"output_tokens":1000,"cached_input_tokens":1200,"reasoning_output_tokens":100}}}\n` +
      `{"type":"event_msg","payload":{"type":"thread_settings_applied","thread_settings":{"model":"gpt-5.6-sol"}}}\n` +
      `{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Second turn"}]}}\n` +
      `{"type":"token_usage_record","payload":{"usage":{"input_tokens":2000,"output_tokens":400,"cached_input_tokens":500,"reasoning_output_tokens":50}}}\n`,
      'utf8'
    );

    const codexProvider = new CodexHistoryProvider();
    const codexSessions = await codexProvider.getRecentSessions();
    const multiCodexSession = codexSessions.find((s) => s.sessionId === 'multi-codex');
    assert.ok(multiCodexSession);
    assert.ok(multiCodexSession.tokenUsage);
    assert.equal(multiCodexSession.tokenUsage.totalTokens, 8400);
    assert.equal(multiCodexSession.tokenUsage.inputTokens, 7000);
    assert.equal(multiCodexSession.tokenUsage.outputTokens, 1400);
    assert.equal(multiCodexSession.tokenUsage.cachedTokens, 1700);
    assert.equal(multiCodexSession.tokenUsage.reasoningTokens, 150);
    assert.ok(Array.isArray(multiCodexSession.tokenUsage.byModel));
    assert.equal(multiCodexSession.tokenUsage.byModel.length, 2);

    const astra = multiCodexSession.tokenUsage.byModel.find((m) => m.model === 'gpt-6-astra');
    assert.ok(astra);
    assert.equal(astra.inputTokens, 5000);
    assert.equal(astra.outputTokens, 1000);
    assert.equal(astra.totalTokens, 6000);
    assert.equal(astra.cachedTokens, 1200);
    assert.equal(astra.reasoningTokens, 100);

    const sol = multiCodexSession.tokenUsage.byModel.find((m) => m.model === 'gpt-5.6-sol');
    assert.ok(sol);
    assert.equal(sol.inputTokens, 2000);
    assert.equal(sol.outputTokens, 400);
    assert.equal(sol.totalTokens, 2400);
    assert.equal(sol.cachedTokens, 500);
    assert.equal(sol.reasoningTokens, 50);

    fs.rmSync(multiCodexDir, { recursive: true, force: true });
  });

  await t.test('history manager composes provider strategies and sorts their sessions', async () => {
    const { AiHistoryManager } = await import('../../cli/dist/ai-history/history-manager.js');
    const firstProvider = {
      id: 'claude-code',
      name: 'Claude Code',
      async getRecentSessions() {
        return [{ providerId: this.id, sessionId: 'older', title: 'Older', turns: [], timestamp: 1 }];
      },
    };
    const secondProvider = {
      id: 'codex-cli',
      name: 'Codex CLI',
      async getRecentSessions() {
        return [{ providerId: this.id, sessionId: 'newer', title: 'Newer', turns: [], timestamp: 2 }];
      },
    };
    const unavailableProvider = {
      id: 'open-code',
      name: 'OpenCode',
      async getRecentSessions() {
        throw new Error('Provider unavailable');
      },
    };

    const sessions = await new AiHistoryManager([firstProvider, unavailableProvider, secondProvider]).getAllSessions();
    assert.deepEqual(sessions.map(session => session.sessionId), ['newer', 'older']);
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
        // Find the Antigravity standard session from the list
        const antiSess = opts.options.find(o => o.value.providerId === 'antigravity' && o.value.title.includes('Hello Antigravity'));
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
      const antiSessions = capturedOptions.filter(o => o.value.providerId === 'antigravity');
      assert.equal(antiSessions.length, 2, 'Should list both standard Antigravity and Agy CLI sessions');
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
      assert.ok(!createdNote.rawText.includes('internal system content'));
      assert.ok(!createdNote.rawText.includes('private reasoning'));
      assert.ok(!createdNote.rawText.includes('I am inspecting files.'));
      assert.ok(!createdNote.rawText.includes('Tool output that must not be saved'));

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
        `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Query number ${i}"}]}}\n{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Response ${i}"}]}}\n`,
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
