import { SourceChannel } from '../enums/knowledge.enums.js';

export type NoteSourceIdentifier = {
  sourceChannel?: string | null;
  source?: string | null;
};

function matchesDependencyChannel(value?: string | null): boolean {
  if (!value) {
    return false;
  }
  return value.trim().toLowerCase().replace(/_/g, '-') === SourceChannel.DependencyWatcher;
}

export function isDependencyNote(note?: NoteSourceIdentifier | null): boolean {
  if (!note) {
    return false;
  }

  return matchesDependencyChannel(note.sourceChannel) || matchesDependencyChannel(note.source);
}

export function isNoteEligibleForEmbedding(note?: NoteSourceIdentifier | null): boolean {
  if (!note) {
    return false;
  }

  if (isDependencyNote(note)) {
    return false;
  }

  return true;
}
