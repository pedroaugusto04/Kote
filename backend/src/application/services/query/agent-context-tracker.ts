export type AgentSourceItem = {
  noteId: string;
  title: string;
  path: string;
};

export type AgentRelatedNoteItem = {
  id: string;
  title: string;
  path: string;
  projectSlug?: string;
  workspaceSlug?: string;
  workspaceId?: string;
};

export class AgentContextTracker {
  private readonly sourcesMap = new Map<string, AgentSourceItem>();
  private readonly relatedNotesMap = new Map<string, AgentRelatedNoteItem>();

  addSource(note: {
    noteId: string;
    title: string;
    path: string;
    projectSlug?: string;
    workspaceSlug?: string;
    workspaceId?: string;
  }) {
    if (!this.sourcesMap.has(note.noteId)) {
      this.sourcesMap.set(note.noteId, {
        noteId: note.noteId,
        title: note.title,
        path: note.path,
      });
    }
    this.addRelatedNote({
      id: note.noteId,
      title: note.title,
      path: note.path,
      projectSlug: note.projectSlug,
      workspaceSlug: note.workspaceSlug,
      workspaceId: note.workspaceId,
    });
  }

  addRelatedNote(note: AgentRelatedNoteItem) {
    if (!this.relatedNotesMap.has(note.id)) {
      this.relatedNotesMap.set(note.id, note);
    }
  }

  getSources(): AgentSourceItem[] {
    return Array.from(this.sourcesMap.values());
  }

  getRelatedNotes(): AgentRelatedNoteItem[] {
    return Array.from(this.relatedNotesMap.values());
  }
}
