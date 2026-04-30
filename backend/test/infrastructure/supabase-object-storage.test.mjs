import test from 'node:test';
import assert from 'node:assert/strict';

import { ObjectStorageMissingContentError } from '../../dist/application/ports/object-storage.js';
import { SupabaseObjectStorage } from '../../dist/infrastructure/storage/supabase-object-storage.js';

function configureEnv() {
  process.env.SUPABASE_URL = 'https://project.supabase.co/';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.KB_SUPABASE_STORAGE_BUCKET = 'kb-private';
  process.env.KB_SUPABASE_CACHE_CONTROL = '60';
}

function restoreEnv(previous) {
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'KB_SUPABASE_STORAGE_BUCKET', 'KB_SUPABASE_CACHE_CONTROL']) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
}

function snapshotEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    KB_SUPABASE_STORAGE_BUCKET: process.env.KB_SUPABASE_STORAGE_BUCKET,
    KB_SUPABASE_CACHE_CONTROL: process.env.KB_SUPABASE_CACHE_CONTROL,
  };
}

test('supabase storage writes encoded object paths with service-role headers and cache control', async (t) => {
  const previousEnv = snapshotEnv();
  const previousFetch = globalThis.fetch;
  t.after(() => {
    restoreEnv(previousEnv);
    globalThis.fetch = previousFetch;
  });
  configureEnv();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('ok', { status: 200 });
  };

  await new SupabaseObjectStorage().put({
    key: 'users/user 1/workspaces/default/notes/20 Inbox/a#b.md',
    body: 'markdown',
    contentType: 'text/markdown; charset=utf-8',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://project.supabase.co/storage/v1/object/kb-private/users/user%201/workspaces/default/notes/20%20Inbox/a%23b.md');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer service-role-key');
  assert.equal(calls[0].init.headers.apikey, 'service-role-key');
  assert.equal(calls[0].init.headers['x-upsert'], 'true');
  assert.equal(calls[0].init.headers['cache-control'], '60');
  assert.equal(calls[0].init.headers['content-type'], 'text/markdown; charset=utf-8');
});

test('supabase storage reads object bytes', async (t) => {
  const previousEnv = snapshotEnv();
  const previousFetch = globalThis.fetch;
  t.after(() => {
    restoreEnv(previousEnv);
    globalThis.fetch = previousFetch;
  });
  configureEnv();
  globalThis.fetch = async () => new Response('hello world', { status: 200 });

  const bytes = await new SupabaseObjectStorage().get('users/u/workspaces/w/notes/n.md');

  assert.equal(bytes.toString('utf8'), 'hello world');
});

test('supabase storage ignores delete 404', async (t) => {
  const previousEnv = snapshotEnv();
  const previousFetch = globalThis.fetch;
  t.after(() => {
    restoreEnv(previousEnv);
    globalThis.fetch = previousFetch;
  });
  configureEnv();
  globalThis.fetch = async () => new Response('not found', { status: 404 });

  await assert.doesNotReject(() => new SupabaseObjectStorage().delete('users/u/missing.md'));
});

test('supabase storage throws clear config errors when required env is missing', async (t) => {
  const previousEnv = snapshotEnv();
  t.after(() => restoreEnv(previousEnv));
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.KB_SUPABASE_STORAGE_BUCKET;

  await assert.rejects(
    () => new SupabaseObjectStorage().put({ key: 'note.md', body: 'markdown' }),
    /SUPABASE_URL_not_configured/,
  );

  process.env.SUPABASE_URL = 'https://project.supabase.co';
  await assert.rejects(
    () => new SupabaseObjectStorage().get('note.md'),
    /SUPABASE_SERVICE_ROLE_KEY_not_configured/,
  );

  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  await assert.rejects(
    () => new SupabaseObjectStorage().delete('note.md'),
    /KB_SUPABASE_STORAGE_BUCKET_not_configured/,
  );
});

test('supabase storage maps read 404 to missing content', async (t) => {
  const previousEnv = snapshotEnv();
  const previousFetch = globalThis.fetch;
  t.after(() => {
    restoreEnv(previousEnv);
    globalThis.fetch = previousFetch;
  });
  configureEnv();
  globalThis.fetch = async () => new Response('not found', { status: 404 });

  await assert.rejects(
    () => new SupabaseObjectStorage().get('users/u/missing.md'),
    ObjectStorageMissingContentError,
  );
});
