import test from 'node:test';
import assert from 'node:assert/strict';

import { createZipArchive } from '../../dist/domain/utils/zip.utils.js';
import { decodeBase64, isValidZipArchive, isZipAttachment, isZipFileName } from '../../dist/domain/utils/attachment-validation.utils.js';

test('ZIP validation accepts complete archives without extracting entries', () => {
  const archive = createZipArchive([{ path: 'notes/readme.txt', content: 'safe text' }]);
  assert.equal(isValidZipArchive(archive), true);
  assert.equal(isZipFileName('archive.ZIP'), true);
  assert.equal(isZipAttachment('archive.zip', 'application/octet-stream'), true);
  assert.equal(isZipAttachment('archive.bin', 'application/zip'), true);
});

test('ZIP validation rejects invalid Base64 and incomplete ZIP data', () => {
  assert.equal(decodeBase64('not base64!'), null);
  assert.equal(isValidZipArchive(Buffer.from('PK\x03\x04not-an-archive')), false);
  assert.equal(isValidZipArchive(Buffer.from('plain text')), false);
});

test('Base64 decoding accepts large valid attachment payloads without regex stack overflow', () => {
  const original = Buffer.alloc(6 * 1024 * 1024, 0xab);
  const decoded = decodeBase64(original.toString('base64'));

  assert.ok(decoded);
  assert.deepEqual(decoded, original);
});
