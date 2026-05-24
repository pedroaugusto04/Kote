export type AskAnswerCardItem = {
  question: string;
  answer: string;
  projectSlug: string;
  sources: Array<{
    noteId: string;
    title: string;
    path: string;
  }>;
};
