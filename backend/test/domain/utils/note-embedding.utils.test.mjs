import test from 'node:test';
import assert from 'node:assert/strict';

import { isDependencyNote, isNoteEligibleForEmbedding } from '../../../dist/domain/utils/note-embedding.utils.js';
import { SourceChannel } from '../../../dist/contracts/enums.js';

test('isDependencyNote identifies dependency watcher notes by sourceChannel enum', () => {
  assert.equal(isDependencyNote({ sourceChannel: SourceChannel.DependencyWatcher }), true);
});

test('isDependencyNote identifies dependency watcher notes by source property', () => {
  assert.equal(isDependencyNote({ source: SourceChannel.DependencyWatcher }), true);
});

test('isDependencyNote returns false for regular notes', () => {
  assert.equal(isDependencyNote({ sourceChannel: SourceChannel.Github, source: 'github' }), false);
  assert.equal(isDependencyNote({ sourceChannel: SourceChannel.Whatsapp, source: 'whatsapp' }), false);
  assert.equal(isDependencyNote({ sourceChannel: SourceChannel.AiChat, source: 'ai-chat' }), false);
  assert.equal(isDependencyNote({ sourceChannel: SourceChannel.External, source: 'manual' }), false);
  assert.equal(isDependencyNote(null), false);
  assert.equal(isDependencyNote(undefined), false);
});

test('isNoteEligibleForEmbedding returns false for dependency notes and true for regular notes', () => {
  assert.equal(isNoteEligibleForEmbedding({ sourceChannel: SourceChannel.DependencyWatcher }), false);
  assert.equal(isNoteEligibleForEmbedding({ source: SourceChannel.DependencyWatcher }), false);

  assert.equal(isNoteEligibleForEmbedding({ sourceChannel: SourceChannel.Github, source: 'github' }), true);
  assert.equal(isNoteEligibleForEmbedding({ sourceChannel: SourceChannel.Whatsapp }), true);
  assert.equal(isNoteEligibleForEmbedding({ sourceChannel: SourceChannel.External, title: 'Arch decision' }), true);
  assert.equal(isNoteEligibleForEmbedding(null), false);
  assert.equal(isNoteEligibleForEmbedding(undefined), false);
});
