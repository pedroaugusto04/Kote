import { describe, expect, it } from 'vitest';
import {
  NOTE_SYNTHESIS_ACTION_LABEL,
  NOTE_SYNTHESIS_TITLE,
  NOTE_SYNTHESIS_TONE,
  formatScheduledSynthesisTitle,
  getSynthesisState,
  groupSynthesisMemory,
} from '../../../src/widgets/notes/note-synthesis.constants';

describe('note-synthesis.constants', () => {
  const baseNow = new Date('2026-09-10T12:00:00.000Z');

  describe('formatScheduledSynthesisTitle', () => {
    it('returns default Scheduled title when availableAt is missing', () => {
      expect(formatScheduledSynthesisTitle(undefined, baseNow)).toBe(NOTE_SYNTHESIS_TITLE.SCHEDULED);
      expect(formatScheduledSynthesisTitle(null, baseNow)).toBe(NOTE_SYNTHESIS_TITLE.SCHEDULED);
    });

    it('returns Scheduled with formatted remaining time when availableAt is valid', () => {
      expect(formatScheduledSynthesisTitle('2026-09-11T11:00:00.000Z', baseNow)).toBe('Scheduled · in 23h');
      expect(formatScheduledSynthesisTitle('2026-09-10T12:30:00.000Z', baseNow)).toBe('Scheduled · in 30m');
      expect(formatScheduledSynthesisTitle('2026-09-10T11:00:00.000Z', baseNow)).toBe('Scheduled · shortly');
    });
  });

  describe('getSynthesisState', () => {
    it('returns pending state with remaining time for scheduled jobs', () => {
      const state = getSynthesisState('pending', false, '2026-09-11T10:00:00.000Z', baseNow);
      expect(state).toEqual({
        tone: NOTE_SYNTHESIS_TONE.PENDING,
        title: 'Scheduled · in 22h',
        canRequest: true,
        actionLabel: NOTE_SYNTHESIS_ACTION_LABEL.GENERATE_NOW,
      });
    });

    it('returns requested state when manually requested', () => {
      const state = getSynthesisState('pending', true, '2026-09-11T10:00:00.000Z', baseNow);
      expect(state).toEqual({
        tone: NOTE_SYNTHESIS_TONE.REQUESTED,
        title: NOTE_SYNTHESIS_TITLE.REQUESTED,
        canRequest: false,
        actionLabel: NOTE_SYNTHESIS_ACTION_LABEL.GENERATE_NOW,
      });
    });

    it('returns processing state', () => {
      const state = getSynthesisState('processing');
      expect(state).toEqual({
        tone: NOTE_SYNTHESIS_TONE.PROCESSING,
        title: NOTE_SYNTHESIS_TITLE.GENERATING,
        canRequest: false,
        actionLabel: '',
      });
    });

    it('returns unavailable state for failed or skipped statuses', () => {
      const failedState = getSynthesisState('failed');
      expect(failedState).toEqual({
        tone: NOTE_SYNTHESIS_TONE.UNAVAILABLE,
        title: NOTE_SYNTHESIS_TITLE.UNAVAILABLE,
        canRequest: true,
        actionLabel: NOTE_SYNTHESIS_ACTION_LABEL.RETRY,
      });

      const skippedState = getSynthesisState('skipped');
      expect(skippedState).toEqual({
        tone: NOTE_SYNTHESIS_TONE.UNAVAILABLE,
        title: NOTE_SYNTHESIS_TITLE.UNAVAILABLE,
        canRequest: true,
        actionLabel: NOTE_SYNTHESIS_ACTION_LABEL.RETRY,
      });
    });

    it('returns null for completed or undefined status', () => {
      expect(getSynthesisState('completed')).toBeNull();
      expect(getSynthesisState(undefined)).toBeNull();
    });
  });

  describe('groupSynthesisMemory', () => {
    it('groups synthesis items by kind', () => {
      const groups = groupSynthesisMemory([
        { kind: 'goal', text: 'Define roadmap', status: 'current', turnRefs: [1] },
        { kind: 'goal', text: 'Set budget', status: 'current', turnRefs: [2] },
        { kind: 'decision', text: 'Use PostgreSQL', status: 'current', turnRefs: [3] },
      ]);

      expect(groups).toEqual([
        {
          kind: 'goal',
          label: 'Goals',
          items: [
            { kind: 'goal', text: 'Define roadmap', status: 'current', turnRefs: [1] },
            { kind: 'goal', text: 'Set budget', status: 'current', turnRefs: [2] },
          ],
        },
        {
          kind: 'decision',
          label: 'Decisions',
          items: [
            { kind: 'decision', text: 'Use PostgreSQL', status: 'current', turnRefs: [3] },
          ],
        },
      ]);
    });
  });
});
