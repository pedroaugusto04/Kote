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

function createStorageDouble() {
  const calls = [];
  const handlers = {
    upload: async () => ({ error: null }),
    download: async () => ({ data: new Blob(['default']), error: null }),
    remove: async () => ({ error: null }),
  };
  const storage = {
    upload: async (...args) => {
      calls.push({ method: 'upload', args });
      return handlers.upload(...args);
    },
    download: async (...args) => {
      calls.push({ method: 'download', args });
      return handlers.download(...args);
    },
    remove: async (...args) => {
      calls.push({ method: 'remove', args });
      return handlers.remove(...args);
    },
  };
  const factoryCalls = [];
  const factory = (config) => {
    factoryCalls.push(config);
    return storage;
  };
  return { calls, factory, factoryCalls, handlers };
}

test('supabase storage uploads with bucket config, cache control and upsert', async (t) => {
  const previousEnv = snapshotEnv();
  t.after(() => restoreEnv(previousEnv));
  configureEnv();
  const double = createStorageDouble();

  await new SupabaseObjectStorage(double.factory).put({
    key: 'users/user 1/workspaces/default/notes/20 Inbox/a#b.md',
    body: 'markdown',
    contentType: 'text/markdown',
  });

  assert.deepEqual(double.factoryCalls, [{
    url: 'https://project.supabase.co',
    serviceRoleKey: 'service-role-key',
    bucket: 'kb-private',
    cacheControl: '60',
  }]);
  assert.equal(double.calls.length, 1);
  assert.equal(double.calls[0].method, 'upload');
  assert.equal(double.calls[0].args[0], 'users/user 1/workspaces/default/notes/20 Inbox/a#b.md');
  assert.equal(double.calls[0].args[1], 'markdown');
  assert.deepEqual(double.calls[0].args[2], {
    cacheControl: '60',
    contentType: 'text/markdown',
    upsert: true,
  });
});

test('supabase storage uploads buffers as Uint8Array', async (t) => {
  const previousEnv = snapshotEnv();
  t.after(() => restoreEnv(previousEnv));
  configureEnv();
  const double = createStorageDouble();
  const body = Buffer.from('hello world', 'utf8');

  await new SupabaseObjectStorage(double.factory).put({
    key: 'users/u/workspaces/w/notes/n.md',
    body,
  });

  assert.equal(double.calls[0].method, 'upload');
  assert.ok(double.calls[0].args[1] instanceof Uint8Array);
  assert.equal(Buffer.from(double.calls[0].args[1]).toString('utf8'), 'hello world');
  assert.deepEqual(double.calls[0].args[2], {
    cacheControl: '60',
    contentType: 'application/octet-stream',
    upsert: true,
  });
});

test('supabase storage reads object bytes', async (t) => {
  const previousEnv = snapshotEnv();
  t.after(() => restoreEnv(previousEnv));
  configureEnv();
  const double = createStorageDouble();
  double.handlers.download = async () => ({ data: new Blob(['hello world']), error: null });

  const bytes = await new SupabaseObjectStorage(double.factory).get('users/u/workspaces/w/notes/n.md');

  assert.equal(bytes.toString('utf8'), 'hello world');
  assert.equal(double.calls[0].method, 'download');
  assert.equal(double.calls[0].args[0], 'users/u/workspaces/w/notes/n.md');
});

test('supabase storage ignores delete 404', async (t) => {
  const previousEnv = snapshotEnv();
  t.after(() => restoreEnv(previousEnv));
  configureEnv();
  const double = createStorageDouble();
  double.handlers.remove = async () => ({ error: { message: 'not found', statusCode: '404' } });

  await assert.doesNotReject(() => new SupabaseObjectStorage(double.factory).delete('users/u/missing.md'));
  assert.equal(double.calls[0].method, 'remove');
  assert.deepEqual(double.calls[0].args[0], ['users/u/missing.md']);
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
  t.after(() => restoreEnv(previousEnv));
  configureEnv();
  const double = createStorageDouble();
  double.handlers.download = async () => ({ data: null, error: { message: 'not found', statusCode: 404 } });

  await assert.rejects(
    () => new SupabaseObjectStorage(double.factory).get('users/u/missing.md'),
    ObjectStorageMissingContentError,
  );
});

test('supabase storage surfaces sdk errors with action prefixes', async (t) => {
  const previousEnv = snapshotEnv();
  t.after(() => restoreEnv(previousEnv));
  configureEnv();

  const putDouble = createStorageDouble();
  putDouble.handlers.upload = async () => ({ error: { message: 'upload failed', statusCode: 503 } });
  await assert.rejects(
    () => new SupabaseObjectStorage(putDouble.factory).put({ key: 'note.md', body: 'x' }),
    /supabase_storage_put_failed:503:upload failed/,
  );

  const getDouble = createStorageDouble();
  getDouble.handlers.download = async () => ({ data: null, error: { message: 'download failed', statusCode: '500' } });
  await assert.rejects(
    () => new SupabaseObjectStorage(getDouble.factory).get('note.md'),
    /supabase_storage_get_failed:500:download failed/,
  );

  const deleteDouble = createStorageDouble();
  deleteDouble.handlers.remove = async () => ({ error: { message: 'delete failed', statusCode: 400 } });
  await assert.rejects(
    () => new SupabaseObjectStorage(deleteDouble.factory).delete('note.md'),
    /supabase_storage_delete_failed:400:delete failed/,
  );
});
