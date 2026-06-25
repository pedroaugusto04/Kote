import type { WeeklySummaryAnalysis } from '../../../contracts/weekly-summary.js';

export const weeklySummaryFallback: WeeklySummaryAnalysis = {
  overview: 'Weekly summary is available.',
  keyHighlights: [],
  byProject: [],
  recommendations: [],
};

export function buildWeeklySummarySystemPrompt() {
  return [
    'You are a helpful knowledge management assistant generating a weekly summary for a user.',
    'Your goal is to provide a concise, valuable summary that helps the user understand their progress and key insights.',
    'Return strict JSON with keys: overview, keyHighlights, byProject, recommendations.',
    'byProject must be an array of { projectName, summary, noteCount, notableNotes }.',
    'notableNotes must be an array of { title, summary } containing the most important notes (max 3 per project).',
    'Guidelines:',
    '- overview: A 2-3 sentence high-level summary of the week\'s activity and progress.',
    '- keyHighlights: 3-5 bullet points of the most important achievements, patterns, or insights.',
    '- byProject: For each project, provide a brief summary of activity and the most notable notes.',
    '- recommendations: 2-4 actionable suggestions based on the content (e.g., follow-up tasks, areas to explore, connections between notes).',
    '- Keep all text concise, scannable, and actionable.',
    '- Avoid generic filler; focus on specific, relevant insights.',
    '- Write in English.',
  ].join(' ');
}

export function parseWeeklySummary(input: unknown): WeeklySummaryAnalysis {
  const parsed = input as Partial<WeeklySummaryAnalysis>;
  return {
    overview: String(parsed.overview || weeklySummaryFallback.overview),
    keyHighlights: Array.isArray(parsed.keyHighlights) ? parsed.keyHighlights.map((item) => String(item)) : [],
    byProject: Array.isArray(parsed.byProject)
      ? parsed.byProject
          .map((item) => item as Record<string, unknown>)
          .map((item) => ({
            projectName: String(item.projectName || ''),
            summary: String(item.summary || ''),
            noteCount: Number(item.noteCount || 0),
            notableNotes: Array.isArray(item.notableNotes)
              ? (item.notableNotes as Record<string, unknown>[])
                  .map((note) => ({
                    title: String(note.title || ''),
                    summary: String(note.summary || ''),
                  }))
              : [],
          }))
      : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map((item) => String(item)) : [],
  };
}
