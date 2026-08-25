import { SourceChannel } from '../enums/knowledge.enums.js';

export type NoteSourceIdentifier = {
  sourceChannel?: string | null;
  source?: string | null;
};

export function isDependencyNote(note?: NoteSourceIdentifier | null): boolean {
  if (!note) {
    return false;
  }

  if (note.sourceChannel === SourceChannel.DependencyWatcher) {
    return true;
  }

  if (note.source === SourceChannel.DependencyWatcher) {
    return true;
  }

  return false;
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
