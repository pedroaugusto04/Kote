import type { PrReviewAgentDecision } from '../../../contracts/pr-review-agent.js';
import type { AgentSourceItem } from '../query/agent-context-tracker.js';

export function formatPrReviewComment(
  decision: PrReviewAgentDecision,
  headSha: string,
  trackedSources?: AgentSourceItem[],
): string {
  const sections: string[] = [];

  sections.push('## PR Insights\n');
  sections.push(`${decision.summary}\n`);

  if (decision.insights.length > 0) {
    sections.push('### Key Insights\n');
    for (const insight of decision.insights) {
      sections.push(`#### ${insight.title}\n`);
      sections.push(`- **Type:** \`${insight.type}\``);
      sections.push(`- **Evidence:** ${insight.evidence}`);
      sections.push(`- **Impact:** ${insight.impact}`);
      sections.push(`- **Recommendation:** ${insight.recommendation}\n`);
    }
  }

  sections.push('### Overall Assessment\n');
  sections.push(`- **Risk Level:** \`${decision.overallAssessment.riskLevel}\``);
  sections.push(`- **Suggested Action:** \`${decision.overallAssessment.suggestedAction}\`\n`);

  if (trackedSources && trackedSources.length > 0) {
    sections.push('### Context Notes & Architectural References\n');
    for (const source of trackedSources) {
      sections.push(`- **${source.title}** (\`${source.path}\`)`);
    }
    sections.push('');
  }

  return sections.join('\n');
}
