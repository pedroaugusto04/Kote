import { z } from 'zod';

export const prReviewFindingSchema = z.object({
  title: z.string().describe('Short descriptive title of the insight'),
  type: z.enum(['Architecture', 'Risk', 'Impact', 'Testing', 'Deprecation', 'Security']).describe('Category of the finding'),
  evidence: z.string().describe('File path, line reference, or knowledge base note cited as evidence'),
  impact: z.string().describe('Explanation of potential impact, regressions, or system behavior'),
  recommendation: z.string().describe('Concrete actionable recommendation for the engineer'),
});

export const prReviewAgentDecisionSchema = z.object({
  summary: z.string().describe('High-level executive summary of what the PR changes and its system impact'),
  insights: z.array(prReviewFindingSchema).default([]),
  overallAssessment: z.object({
    riskLevel: z.enum(['Low', 'Medium', 'High', 'Critical']),
    suggestedAction: z.enum(['Approve', 'Approve with caution', 'Request changes']),
  }),
  hasMeaningfulInsights: z.boolean().describe('False if changes are trivial, formatting-only, or lack architectural impact warranting a review comment'),
});

export type PrReviewFinding = z.infer<typeof prReviewFindingSchema>;
export type PrReviewAgentDecision = z.infer<typeof prReviewAgentDecisionSchema>;
