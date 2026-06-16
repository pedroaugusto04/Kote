import type { SaveNoteInput } from '../../../application/models/repository-records.models.js';

export function buildNoteMutableValues(input: SaveNoteInput, markdownStorageKey: string): unknown[] {
  return [
    input.path,
    input.type,
    input.title,
    input.projectSlug,
    input.workspaceSlug,
    input.folderId,
    input.status,
    JSON.stringify(input.tags),
    input.occurredAt,
    input.sourceChannel,
    input.summary,
    markdownStorageKey,
    JSON.stringify(input.frontmatter),
    JSON.stringify(input.metadata),
    input.source,
  ];
}
