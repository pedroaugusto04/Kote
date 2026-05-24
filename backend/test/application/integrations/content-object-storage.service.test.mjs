import test from 'node:test';
import assert from 'node:assert/strict';

import { ContentObjectStorageService } from '../../../dist/application/services/content-object-storage.service.js';

class RecordingObjectStorage {
  constructor() {
    this.calls = [];
  }

  async put(input) {
    this.calls.push(input);
  }

  async get() {
    throw new Error('not_implemented');
  }

  async delete() {}
}

test('content object storage normalizes attachment keys for supabase-safe filenames', async () => {
  const objectStorage = new RecordingObjectStorage();
  const service = new ContentObjectStorageService(objectStorage);

  const storageKey = await service.saveAttachmentData('user-1', 'workspace1', {
    noteId: 'note-1',
    fileName: 'FéConect-52e25237-dd8a-4511-ba6b-1e394674930f (11).pdf',
    mimeType: 'application/pdf',
    dataBase64: Buffer.from('hello pdf').toString('base64'),
    sizeBytes: 9,
    metadata: {},
  });

  assert.equal(
    storageKey,
    'users/user-1/workspaces/workspace1/attachments/note-1/feconect-52e25237-dd8a-4511-ba6b-1e394674930f-11.pdf',
  );
  assert.equal(objectStorage.calls.length, 1);
  assert.equal(objectStorage.calls[0].key, storageKey);
  assert.equal(Buffer.from(objectStorage.calls[0].body).toString('utf8'), 'hello pdf');
  assert.equal(objectStorage.calls[0].contentType, 'application/pdf');
});
