export type AskResponse = {
  ok: boolean;
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  sources: Array<{
    noteId: string;
    title: string;
    path: string;
  }>;
  relatedNotes: Array<{
    id: string;
    title: string;
    path: string;
    projectSlug?: string;
    workspaceSlug?: string;
  }>;
};
