import { z } from 'zod';

export const FILE_NOTES_SUMMARY_MAX_NOTES = 50;
export const FILE_NOTES_SUMMARY_MAX_NOTE_CHARS = 3_500;
export const FILE_NOTES_SUMMARY_MAX_TOTAL_CHARS = 60_000;

export const fileNotesSummaryResponseSchema = z.object({
  summary: z.string().trim().default(''),
  understanding: z.string().trim().default(''),
  timeline: z.array(
    z.object({
      date: z.string().trim(),
      title: z.string().trim().default(''),
      description: z.string().trim().default(''),
      noteId: z.string().trim(),
    }),
  ).default([]),
  keyChanges: z.array(
    z.object({
      description: z.string().trim().default(''),
      noteId: z.string().trim(),
    }),
  ).default([]),
});

export function buildFileNotesSummarySystemPrompt() {
  return [
    'You are a helpful Kote assistant specializing in code documentation and engineering memory.',
    'You will receive a collection of notes about a specific file, along with the file path.',
    'Your task is to synthesize these notes into a comprehensive summary that helps the developer understand:',
    '1. What this file does (overall understanding)',
    '2. How it has evolved over time (timeline of changes)',
    '3. Key decisions, modifications, or important changes made to it',
    '',
    'Structure your response as follows:',
    '- summary: A concise 2-3 sentence overview of the file\'s purpose and role in the codebase',
    '- understanding: A more detailed explanation of what the file does, its key components, and its relationships',
    '- timeline: A chronological array of entries, each with date (from note creation), title (note title), description (what happened at that time), and noteId (for reference)',
    '- keyChanges: An array of significant changes, decisions, or modifications, each with description and the noteId that documents it',
    '',
    'Use the note dates to build the timeline. Group related changes when appropriate.',
    'Focus on actionable insights that help a developer quickly understand the file\'s history and current state.',
    'Return strict JSON only. Do not wrap the response in markdown or use markdown code blocks.',
    'Use this JSON shape: {"summary": "...", "understanding": "...", "timeline": [{"date": "YYYY-MM-DD", "title": "...", "description": "...", "noteId": "..."}], "keyChanges": [{"description": "...", "noteId": "..."}]}',
  ].join('\n');
}

export function buildFileNotesSummaryPrompt(payload: {
  filePath: string;
  notes: Array<{
    id: string;
    title: string;
    date: string;
    content: string;
    summary?: string;
  }>;
}) {
  let remainingChars = FILE_NOTES_SUMMARY_MAX_TOTAL_CHARS;
  const safeTime = (date: string) => {
    const timestamp = new Date(date).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const orderedNotes = [...payload.notes]
    .sort((left, right) => safeTime(left.date) - safeTime(right.date))
    .slice(-FILE_NOTES_SUMMARY_MAX_NOTES);
  const notes = orderedNotes.map((note, index) => {
    const summary = String(note.summary || '').trim();
    const content = String(note.content || '').trim();
    const evidence = summary && content && summary !== content
      ? `Summary: ${summary}\n\nContent: ${content}`
      : content || summary;
    const remainingNotes = orderedNotes.length - index;
    const fairShare = remainingNotes > 0 ? Math.floor(remainingChars / remainingNotes) : 0;
    const allowedChars = Math.max(0, Math.min(FILE_NOTES_SUMMARY_MAX_NOTE_CHARS, fairShare));
    const boundedEvidence = evidence.slice(0, allowedChars);
    remainingChars -= boundedEvidence.length;
    return {
      id: note.id,
      title: note.title,
      date: note.date,
      content: boundedEvidence,
    };
  });

  return JSON.stringify({
    filePath: payload.filePath,
    notes,
  });
}

export function parseFileNotesSummaryResponse(input: unknown, allowedNoteIds?: Iterable<string>) {
  const parsed = fileNotesSummaryResponseSchema.parse(input);
  const allowed = allowedNoteIds ? new Set(allowedNoteIds) : null;
  const safeTime = (date: string) => {
    const timestamp = new Date(date).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  return {
    ...parsed,
    timeline: parsed.timeline
      .filter((entry) => !allowed || allowed.has(entry.noteId))
      .sort((left, right) => safeTime(left.date) - safeTime(right.date)),
    keyChanges: parsed.keyChanges.filter((entry) => !allowed || allowed.has(entry.noteId)),
    generatedAt: new Date().toISOString(),
  };
}
