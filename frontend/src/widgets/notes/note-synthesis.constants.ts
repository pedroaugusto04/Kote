import { formatRelativeTimeUntil } from '../../shared/utils/format';
import { NOTE_SYNTHESIS_STATUS, type NoteSynthesisStatus } from '../../shared/api/models/note';

export const NOTE_SYNTHESIS_TONE = {
  PENDING: 'pending',
  REQUESTED: 'requested',
  PROCESSING: 'processing',
  UNAVAILABLE: 'unavailable',
} as const;

export type NoteSynthesisTone = typeof NOTE_SYNTHESIS_TONE[keyof typeof NOTE_SYNTHESIS_TONE];

export const NOTE_SYNTHESIS_ACTION_LABEL = {
  GENERATE_NOW: 'Generate now',
  REQUESTING: 'Requesting…',
  RETRY: 'Retry',
} as const;

export const NOTE_SYNTHESIS_TITLE = {
  SCHEDULED: 'Scheduled',
  REQUESTED: 'Requested',
  GENERATING: 'Generating',
  UNAVAILABLE: 'Unavailable',
} as const;

export const SYNTHESIS_KIND_LABELS: Record<string, string> = {
  goal: 'Goals',
  outcome: 'Outcomes',
  decision: 'Decisions',
  change: 'Changes',
  failed_attempt: 'Failed attempts',
  open_item: 'Open items',
  fact: 'Context',
};

export type SynthesisStateConfig = {
  tone: NoteSynthesisTone;
  title: string;
  canRequest: boolean;
  actionLabel: string;
};

export function formatScheduledSynthesisTitle(availableAt?: string | null, now?: Date): string {
  if (!availableAt) return NOTE_SYNTHESIS_TITLE.SCHEDULED;
  const timeUntil = formatRelativeTimeUntil(availableAt, now);
  return timeUntil
    ? `${NOTE_SYNTHESIS_TITLE.SCHEDULED} · ${timeUntil}`
    : NOTE_SYNTHESIS_TITLE.SCHEDULED;
}

export function getSynthesisState(
  status?: NoteSynthesisStatus,
  isManuallyRequested = false,
  availableAt?: string | null,
  now?: Date,
): SynthesisStateConfig | null {
  if (status === NOTE_SYNTHESIS_STATUS.PENDING) {
    return {
      tone: isManuallyRequested ? NOTE_SYNTHESIS_TONE.REQUESTED : NOTE_SYNTHESIS_TONE.PENDING,
      title: isManuallyRequested ? NOTE_SYNTHESIS_TITLE.REQUESTED : formatScheduledSynthesisTitle(availableAt, now),
      canRequest: !isManuallyRequested,
      actionLabel: NOTE_SYNTHESIS_ACTION_LABEL.GENERATE_NOW,
    };
  }

  if (status === NOTE_SYNTHESIS_STATUS.PROCESSING) {
    return {
      tone: NOTE_SYNTHESIS_TONE.PROCESSING,
      title: NOTE_SYNTHESIS_TITLE.GENERATING,
      canRequest: false,
      actionLabel: '',
    };
  }

  if (status === NOTE_SYNTHESIS_STATUS.FAILED || status === NOTE_SYNTHESIS_STATUS.SKIPPED) {
    return {
      tone: NOTE_SYNTHESIS_TONE.UNAVAILABLE,
      title: NOTE_SYNTHESIS_TITLE.UNAVAILABLE,
      canRequest: true,
      actionLabel: NOTE_SYNTHESIS_ACTION_LABEL.RETRY,
    };
  }

  return null;
}

export type SynthesisMemoryItem = { kind: string; text: string; status: string; turnRefs: number[] };

export function groupSynthesisMemory(memory: SynthesisMemoryItem[]) {
  const groups = new Map<string, SynthesisMemoryItem[]>();
  for (const item of memory) {
    const kind = SYNTHESIS_KIND_LABELS[item.kind] ? item.kind : 'fact';
    groups.set(kind, [...(groups.get(kind) || []), item]);
  }
  return Array.from(groups, ([kind, items]) => ({ kind, label: SYNTHESIS_KIND_LABELS[kind], items }));
}

