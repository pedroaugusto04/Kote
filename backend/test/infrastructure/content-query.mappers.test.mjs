import test from 'node:test';
import assert from 'node:assert/strict';

import { noteAttachment } from '../../dist/infrastructure/mappers/content-query.mappers.js';

test('noteAttachment uses API public base url and preserves nested api base path', (t) => {
  const previousPublicBaseUrl = process.env.KB_PUBLIC_BASE_URL;
  const previousApiPublicBaseUrl = process.env.KB_API_PUBLIC_BASE_URL;
  process.env.KB_PUBLIC_BASE_URL = '';
  process.env.KB_API_PUBLIC_BASE_URL = '';
  t.after(() => {
    if (previousPublicBaseUrl === undefined) delete process.env.KB_PUBLIC_BASE_URL;
    else process.env.KB_PUBLIC_BASE_URL = previousPublicBaseUrl;
    if (previousApiPublicBaseUrl === undefined) delete process.env.KB_API_PUBLIC_BASE_URL;
    else process.env.KB_API_PUBLIC_BASE_URL = previousApiPublicBaseUrl;
  });

  const attachment = noteAttachment('note-1', {
    id: 'attachment-1',
    noteId: 'note-1',
    fileName: 'doc.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 123,
    storageKey: 'users/u/workspaces/default/attachments/note-1/doc.pdf',
    checksumSha256: '',
    metadata: {},
    createdAt: '',
  });

  assert.equal(
    attachment.url,
    '/api/notes/note-1/attachments/attachment-1/content',
  );
});
