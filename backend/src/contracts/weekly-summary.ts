export type WeeklySummaryAnalysis = {
  overview: string;
  keyHighlights: string[];
  byProject: Array<{
    projectName: string;
    summary: string;
    noteCount: number;
    notableNotes: Array<{
      title: string;
      summary: string;
    }>;
  }>;
  recommendations: string[];
};
