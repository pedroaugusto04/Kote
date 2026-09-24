import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeReplyText,
  formatAskReply,
  formatAskAttachmentNotices,
  mediaTypeFromMime,
} from '../../../../dist/application/utils/webhook/whatsapp-webhook-reply.utils.js';

test('normalizeReplyText returns fallback for falsy or blank input', () => {
  assert.equal(normalizeReplyText(''), 'I could not build the reply. Please try again.');
  assert.equal(normalizeReplyText(null), 'I could not build the reply. Please try again.');
  assert.equal(normalizeReplyText('Hello world'), 'Hello world');
});

test('formatAskReply formats answer and appends notices', () => {
  const reply = formatAskReply(
    { answer: 'Here is the summary' },
    {
      requested: true,
      noteCount: 1,
      attachmentCount: 0,
      oversizedCount: 1,
      media: [],
      missingContentCount: 0,
    },
  );

  assert.ok(reply.includes('Here is the summary'));
  assert.ok(reply.includes('I could not find any attached files in the notes found.'));
  assert.ok(reply.includes('larger than 15 MB'));
});

test('formatAskAttachmentNotices returns empty array when not requested', () => {
  assert.deepEqual(formatAskAttachmentNotices(undefined), []);
  assert.deepEqual(formatAskAttachmentNotices({ requested: false }), []);
});

test('mediaTypeFromMime maps mime prefixes correctly', () => {
  assert.equal(mediaTypeFromMime('image/png'), 'image');
  assert.equal(mediaTypeFromMime('video/mp4'), 'video');
  assert.equal(mediaTypeFromMime('audio/ogg'), 'audio');
  assert.equal(mediaTypeFromMime('application/pdf'), 'document');
});
