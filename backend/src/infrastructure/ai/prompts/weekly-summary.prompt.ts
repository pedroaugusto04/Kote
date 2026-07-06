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
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid weekly summary response: expected object');
  }

  const parsed = input as Record<string, unknown>;
  const overview = typeof parsed.overview === 'string' ? parsed.overview.trim() : '';
  if (!overview) {
    throw new Error('Invalid weekly summary response: overview is missing or empty');
  }

    let keyHighlights: string[] = [];
    if (Array.isArray(parsed.keyHighlights)) {
      keyHighlights = parsed.keyHighlights
        .filter((i) => typeof i === 'string')
        .map((s) => (s as string).trim())
        .filter(Boolean);
    } else if (typeof parsed.keyHighlights === 'string' && parsed.keyHighlights.trim()) {
      keyHighlights = [parsed.keyHighlights.trim()];
    }

  let byProject: WeeklySummaryAnalysis['byProject'] = [];
  if (Array.isArray(parsed.byProject)) {
    byProject = parsed.byProject
      .filter((p) => p && typeof p === 'object')
      .map((p) => {
        const proj = p as Record<string, unknown>;
        const projectName = typeof proj.projectName === 'string' ? proj.projectName.trim() : '';
        const summary = typeof proj.summary === 'string' ? proj.summary.trim() : '';
        const noteCount = Number.isFinite(Number(proj.noteCount)) ? Number(proj.noteCount) : 0;
        const notableNotesRaw = Array.isArray(proj.notableNotes) ? proj.notableNotes : [];

        const notableNotes = notableNotesRaw
          .filter((n) => n && typeof n === 'object')
          .map((n) => {
            const nr = n as Record<string, unknown>;
            return {
              title: typeof nr.title === 'string' ? nr.title.trim() : '',
              summary: typeof nr.summary === 'string' ? nr.summary.trim() : '',
            };
          })
          .filter((nn) => nn.title || nn.summary);

        return {
          projectName,
          summary,
          noteCount,
          notableNotes,
        };
      })
      .filter((bp) => bp.projectName || bp.summary || bp.noteCount > 0 || bp.notableNotes.length > 0);
  }

  let recommendations: string[] = [];
  if (Array.isArray(parsed.recommendations)) {
    recommendations = parsed.recommendations
      .filter((r) => typeof r === 'string')
      .map((r) => (r as string).trim())
      .filter(Boolean);
  } else if (typeof parsed.recommendations === 'string' && parsed.recommendations.trim()) {
    recommendations = [parsed.recommendations.trim()];
  }

  return {
    overview,
    keyHighlights,
    byProject,
    recommendations,
  };
}
