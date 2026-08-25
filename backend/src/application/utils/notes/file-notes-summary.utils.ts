import { FileNotesSummaryFallbackReason } from '../../../domain/enums/ai.enums.js';

export type FileNotesSummaryRequest = {
  filePath: string;
  workspaceSlug?: string;
  projectSlug?: string;
  notes: Array<{
    id: string;
    title: string;
    date: string;
    content: string;
    summary?: string;
    workspaceSlug?: string;
    revision?: string;
  }>;
};

export type FileNotesSummaryResponse = {
  summary: string;
  understanding: string;
  timeline: Array<{
    date: string;
    title: string;
    description: string;
    noteId: string;
  }>;
  keyChanges: Array<{
    description: string;
    noteId: string;
  }>;
  generatedAt: string;
  fallback?: boolean;
  fallbackReason?: FileNotesSummaryFallbackReason;
};

const FALLBACK_MESSAGES: Record<FileNotesSummaryFallbackReason, { summary: string; understanding: string }> = {
  [FileNotesSummaryFallbackReason.FeatureDisabled]: {
    summary: 'AI file summary is not enabled for this workspace.',
    understanding: 'Enable File Notes Summary AI in Automations to generate an AI summary. Showing the notes recorded for this file below.',
  },
  [FileNotesSummaryFallbackReason.QuotaExceeded]: {
    summary: 'AI file summary is unavailable because your AI credits have been exhausted.',
    understanding: 'Your AI credit quota resets at the start of the next billing period. Showing the notes recorded for this file below.',
  },
  [FileNotesSummaryFallbackReason.GenerationFailed]: {
    summary: '',
    understanding: 'AI summary generation failed. Showing the notes recorded for this file below.',
  },
};

export function buildFileNotesSummaryFallback(
  request: FileNotesSummaryRequest,
  reason: FileNotesSummaryFallbackReason,
): FileNotesSummaryResponse {
  const safeTime = (date: string) => {
    const timestamp = new Date(date).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const sortedNotes = [...request.notes].sort((left, right) => safeTime(left.date) - safeTime(right.date));
  const messages = FALLBACK_MESSAGES[reason];

  return {
    summary: messages.summary || `Found ${request.notes.length} note${request.notes.length === 1 ? '' : 's'} about this file.`,
    understanding: messages.understanding,
    timeline: sortedNotes.map((note) => ({
      date: safeTime(note.date) ? new Date(note.date).toISOString().split('T')[0] : '',
      title: note.title || 'Untitled',
      description: note.summary || note.content?.substring(0, 200) || 'No description',
      noteId: note.id,
    })),
    keyChanges: sortedNotes.map((note) => ({
      description: note.title || 'Note entry',
      noteId: note.id,
    })),
    generatedAt: new Date().toISOString(),
    fallback: true,
    fallbackReason: reason,
  };
}
