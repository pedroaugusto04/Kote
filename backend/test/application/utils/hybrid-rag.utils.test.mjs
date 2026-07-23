import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rankHybridContextChunks,
  calculateRecencyBonus,
} from '../../../dist/application/utils/rag/hybrid-rag.utils.js';

test('calculateRecencyBonus returns 0 when disabled or maxBonus <= 0', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const note = { updatedAt: '2026-06-01T10:00:00Z' };

  assert.equal(calculateRecencyBonus(note, false, 0.008, 180, now), 0);
  assert.equal(calculateRecencyBonus(note, true, 0, 180, now), 0);
  assert.equal(calculateRecencyBonus(note, true, 0.008, 0, now), 0);
});

test('calculateRecencyBonus returns maxBonus for brand new notes and decays linearly', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const brandNewNote = { updatedAt: '2026-06-01T00:00:00Z' };
  const halfAgeNote = { updatedAt: '2026-03-03T00:00:00Z' }; // 90 days ago out of 180
  const oldNote = { updatedAt: '2025-12-01T00:00:00Z' }; // >180 days ago

  const bonusBrandNew = calculateRecencyBonus(brandNewNote, true, 0.008, 180, now);
  assert.ok(Math.abs(bonusBrandNew - 0.008) < 1e-6);

  const bonusHalf = calculateRecencyBonus(halfAgeNote, true, 0.008, 180, now);
  assert.ok(Math.abs(bonusHalf - 0.004) < 1e-4);

  const bonusOld = calculateRecencyBonus(oldNote, true, 0.008, 180, now);
  assert.equal(bonusOld, 0);
});

test('rankHybridContextChunks applies recency bonus to boost recent note rank', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const candidates = [
    {
      chunk: { noteId: 'old-note', chunkIndex: 0 },
      note: { id: 'old-note', updatedAt: '2024-01-01T00:00:00Z' },
      vectorScore: 0.9, // rank 1 in vector search
      keywordScore: 0,
    },
    {
      chunk: { noteId: 'new-note', chunkIndex: 0 },
      note: { id: 'new-note', updatedAt: '2026-05-31T00:00:00Z' }, // 1 day old
      vectorScore: 0.88, // rank 2 in vector search (very close)
      keywordScore: 0,
    },
  ];

  // Without recency bonus: old-note (#1 vector) ranks first
  const unboosted = rankHybridContextChunks(candidates, {
    vectorWeight: 0.7,
    keywordWeight: 0.3,
    rrfK: 20,
    topLimit: 10,
    recencyBonusEnabled: false,
  });
  assert.equal(unboosted[0].note.id, 'old-note');

  // With recency bonus: new-note gets ~0.00795 bonus and overtakes old-note
  const boosted = rankHybridContextChunks(candidates, {
    vectorWeight: 0.7,
    keywordWeight: 0.3,
    rrfK: 20,
    topLimit: 10,
    recencyBonusEnabled: true,
    recencyMaxBonus: 0.008,
    recencyMaxBonusDays: 180,
    now,
  });
  assert.equal(boosted[0].note.id, 'new-note');
});
