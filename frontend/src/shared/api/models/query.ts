export type QueryResponse = {
  ok: boolean;
  mode: string;
  query: string;
  matches: Array<{
    path: string;
    title: string;
    projectSlug: string;
    score: number;
    snippet: string;
  }>;
  answer: {
    answer: string;
    bullets: string[];
    citedPaths: string[];
  };
};
