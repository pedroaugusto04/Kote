import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// The CLI config module reads CONFIG_DIR from KB_CLI_CONFIG_DIR env var.
// We set it to a temp dir before importing so all tests use an isolated location.
const TEST_DIR = path.join(os.tmpdir(), `kb-cli-test-config-${Date.now()}`);
process.env.KB_CLI_CONFIG_DIR = TEST_DIR;

// Clear env vars that would override defaults so we can test the fallback behaviour
delete process.env.KB_API_URL;
delete process.env.KB_API_PUBLIC_BASE_URL;
delete process.env.KB_CLI_WORKSPACE;
delete process.env.KB_CLI_PROJECT;

const { loadConfig, saveConfig, clearConfigAuth } = await import('../../cli/dist/config.js');

test('CLI config', async (t) => {
  // Ensure a clean directory for every top-level run
  t.before(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  t.after(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  await t.test('loadConfig returns defaults when no config file exists', () => {
    const config = loadConfig();

    assert.equal(typeof config.apiUrl, 'string');
    assert.ok(config.apiUrl.length > 0, 'apiUrl should have a default value');
    assert.equal(config.workspaceSlug, 'default');
    assert.equal(config.defaultProjectSlug, 'inbox');
    assert.deepEqual(config.cookies, {});
  });

  await t.test('saveConfig creates config directory and persists values', () => {
    saveConfig({ workspaceSlug: 'my-workspace' });

    const configFile = path.join(TEST_DIR, 'config.json');
    assert.ok(fs.existsSync(configFile), 'config file should exist after save');

    const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.equal(raw.workspaceSlug, 'my-workspace');
  });

  await t.test('saveConfig merges with existing config without overwriting unrelated keys', () => {
    // First save sets workspace
    saveConfig({ workspaceSlug: 'ws-1', defaultProjectSlug: 'proj-1' });
    // Second save only updates project
    saveConfig({ defaultProjectSlug: 'proj-2' });

    const config = loadConfig();
    assert.equal(config.workspaceSlug, 'ws-1', 'unrelated key should not be overwritten');
    assert.equal(config.defaultProjectSlug, 'proj-2', 'updated key should reflect new value');
  });

  await t.test('saveConfig merges cookies without wiping existing cookie entries', () => {
    saveConfig({ cookies: { kb_access_token: 'access-123' } });
    saveConfig({ cookies: { kb_refresh_token: 'refresh-456' } });

    const config = loadConfig();
    assert.equal(config.cookies.kb_access_token, 'access-123');
    assert.equal(config.cookies.kb_refresh_token, 'refresh-456');
  });

  await t.test('loadConfig reads persisted config from disk', () => {
    // Ensure clean state
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });

    const configFile = path.join(TEST_DIR, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      apiUrl: 'https://custom.api/v1',
      workspaceSlug: 'custom-ws',
      defaultProjectSlug: 'custom-proj',
      cookies: { kb_access_token: 'tok-abc' },
    }), 'utf8');

    const config = loadConfig();
    assert.equal(config.apiUrl, 'https://custom.api/v1');
    assert.equal(config.workspaceSlug, 'custom-ws');
    assert.equal(config.defaultProjectSlug, 'custom-proj');
    assert.equal(config.cookies.kb_access_token, 'tok-abc');
  });

  await t.test('loadConfig returns defaults when config file contains invalid JSON', () => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });

    const configFile = path.join(TEST_DIR, 'config.json');
    fs.writeFileSync(configFile, 'NOT-JSON{{{', 'utf8');

    const config = loadConfig();
    // Should fallback to defaults without throwing
    assert.equal(config.workspaceSlug, 'default');
    assert.equal(config.defaultProjectSlug, 'inbox');
  });

  await t.test('clearConfigAuth removes cookie entries but keeps other config', () => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });

    saveConfig({
      workspaceSlug: 'keep-ws',
      defaultProjectSlug: 'keep-proj',
      cookies: { kb_access_token: 'secret', kb_refresh_token: 'refresh' },
    });

    clearConfigAuth();

    const config = loadConfig();
    assert.equal(config.workspaceSlug, 'keep-ws', 'workspace should be preserved');
    assert.equal(config.defaultProjectSlug, 'keep-proj', 'project should be preserved');
    assert.deepEqual(config.cookies, {}, 'cookies should be empty after clearConfigAuth');
  });

  await t.test('saveConfig sets file permissions to 0o600', { skip: process.platform === 'win32' }, () => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });

    saveConfig({ workspaceSlug: 'perm-test' });

    const configFile = path.join(TEST_DIR, 'config.json');
    const stats = fs.statSync(configFile);
    const mode = stats.mode & 0o777;
    assert.equal(mode, 0o600, `file mode should be 600, got ${mode.toString(8)}`);
  });
});
