import test from 'node:test';
import assert from 'node:assert/strict';

import { isPdfAttachment } from '../../dist/domain/utils/attachment.utils.js';
import { extractTextFromPdf } from '../../dist/domain/utils/pdf.utils.js';

test('isPdfAttachment identifies PDF mime types and file extensions', () => {
  assert.equal(isPdfAttachment('application/pdf', 'relatorio.pdf'), true);
  assert.equal(isPdfAttachment('application/octet-stream', 'manual.pdf'), true);
  assert.equal(isPdfAttachment('APPLICATION/PDF', 'document.PDF'), true);

  assert.equal(isPdfAttachment('text/plain', 'notes.txt'), false);
  assert.equal(isPdfAttachment('image/png', 'photo.png'), false);
});

test('extractTextFromPdf returns empty string safely on empty or invalid buffer', async () => {
  const emptyResult = await extractTextFromPdf(Buffer.from(''));
  assert.equal(emptyResult, '');

  const invalidResult = await extractTextFromPdf(Buffer.from('not a real pdf content'));
  assert.equal(invalidResult, '');
});
