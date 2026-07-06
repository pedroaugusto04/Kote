import test from 'node:test';
import assert from 'node:assert/strict';

import { NoteChunkingService } from '../../../dist/application/services/note-chunking.service.js';

test('note chunking includes attachment metadata so ask can retrieve attached files', () => {
  const mockRuntimeEnv = {
    read: () => ({
      chunkTargetTokens: 512,
      chunkOverlapTokens: 64,
      chunkMinChars: 100,
      chunkCodeBlockOverlapLines: 3,
    }),
  };
  const chunks = new NoteChunkingService(mockRuntimeEnv).chunkNote({
    title: 'Deploy checklist',
    projectSlug: 'n8n-automations',
    body: 'Checklist curto',
    attachments: [
      {
        fileName: 'FéConect-52e25237-dd8a-4511-ba6b-1e394674930f (11).pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      },
      {
        fileName: 'erro.png',
        mimeType: 'image/png',
        sizeBytes: 11,
      },
    ],
  });

  assert.equal(chunks.length, 1);
  assert.match(chunks[0].chunkText, /Attachments:/);
  assert.match(chunks[0].chunkText, /FéConect-52e25237-dd8a-4511-ba6b-1e394674930f \(11\)\.pdf/);
  assert.match(chunks[0].chunkText, /application\/pdf/);
  assert.match(chunks[0].chunkText, /2 KB/);
  assert.match(chunks[0].chunkText, /erro\.png/);
  assert.match(chunks[0].chunkText, /image\/png/);
});
