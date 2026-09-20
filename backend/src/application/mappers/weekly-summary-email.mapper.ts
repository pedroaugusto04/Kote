import type { WeeklySummaryAnalysis } from '../../contracts/weekly-summary.js';
import type { WeeklySummaryCriticalDependency } from '../ports/weekly-summary/weekly-summary.repository.js';

export class WeeklySummaryEmailMapper {
  static toTextContent(
    displayName: string | null | undefined,
    appName: string,
    aiSummary: WeeklySummaryAnalysis,
    criticalDependencyUpdates?: WeeklySummaryCriticalDependency[],
  ): string {
    const textParts: string[] = [];
    textParts.push(`Hi ${displayName || ''},`);
    textParts.push('\n' + aiSummary.overview);
    textParts.push('\nKey Highlights:');
    for (const highlight of aiSummary.keyHighlights) {
      textParts.push(`- ${highlight}`);
    }
    textParts.push('\nBy Project:');
    for (const project of aiSummary.byProject) {
      textParts.push(`\n${project.projectName} (${project.noteCount} notes)`);
      textParts.push(project.summary);
      if (project.notableNotes.length > 0) {
        textParts.push('Notable notes:');
        for (const note of project.notableNotes) {
          textParts.push(`- ${note.title}: ${note.summary}`);
        }
      }
    }
    if (criticalDependencyUpdates && criticalDependencyUpdates.length > 0) {
      textParts.push('\nDependency Updates (Critical):');
      for (const dep of criticalDependencyUpdates) {
        const projectInfo = dep.projectName ? ` (${dep.projectName})` : '';
        textParts.push(`- ${dep.packageName}: ${dep.currentVersion} -> ${dep.latestVersion}${projectInfo}`);
      }
    }
    textParts.push('\nRecommendations:');
    for (const rec of aiSummary.recommendations) {
      textParts.push(`- ${rec}`);
    }
    textParts.push(`\nThanks — sent by ${appName}`);
    return textParts.join('\n');
  }

  static toSubject(appName: string, totalNotes: number): string {
    return `${appName} — Weekly summary (${totalNotes} new note${totalNotes > 1 ? 's' : ''})`;
  }
}
