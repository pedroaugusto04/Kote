import { ReviewFindingSeverity } from '../../../contracts/enums.js';

export type ReviewAnalysis = {
  summary: string;
  impact: string;
  risks: string[];
  nextSteps: string[];
  reviewFindings: Array<{
    severity: ReviewFindingSeverity;
    file: string;
    summary: string;
    recommendation: string;
  }>;
};

export const reviewAnalysisFallback: ReviewAnalysis = {
  summary: 'Push received without configured AI analysis.',
  impact: 'No additional impact was summarized.',
  risks: [],
  nextSteps: [],
  reviewFindings: [],
};

export function buildReviewAnalysisSystemPrompt() {
  return [
    'You are a senior software engineer performing code review.',
    'Return strict JSON with keys summary, impact, risks, nextSteps, reviewFindings.',
    'reviewFindings must be an array of { severity, file, summary, recommendation }.',
    'Prefer an average of 3 findings by selecting the most relevant issues first; include more only when additional observations are materially useful.',
    'Prioritize correctness, security, data loss, broken behavior, and maintainability risks over style-only comments.',
    'Keep all explanations short, concise, and efficient.',
    'Each finding summary must state the problem and impact in one brief sentence; each recommendation must state the concrete fix or improvement briefly.',
    'Write the content in English.',
  ].join(' ');
}

export function parseReviewAnalysis(input: unknown): ReviewAnalysis {
  const parsed = input as Partial<ReviewAnalysis>;
  return {
    summary: String(parsed.summary || reviewAnalysisFallback.summary),
    impact: String(parsed.impact || reviewAnalysisFallback.impact),
    risks: Array.isArray(parsed.risks) ? parsed.risks.map((item) => String(item)) : [],
    nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.map((item) => String(item)) : [],
    reviewFindings: Array.isArray(parsed.reviewFindings)
      ? parsed.reviewFindings
          .map((item) => item as Record<string, unknown>)
          .filter((item) => item.summary)
          .map((item) => ({
            severity: Object.values(ReviewFindingSeverity).includes(item.severity as ReviewFindingSeverity)
              ? (item.severity as ReviewFindingSeverity)
              : ReviewFindingSeverity.Medium,
            file: String(item.file || ''),
            summary: String(item.summary || ''),
            recommendation: String(item.recommendation || ''),
          }))
      : [],
  };
}
