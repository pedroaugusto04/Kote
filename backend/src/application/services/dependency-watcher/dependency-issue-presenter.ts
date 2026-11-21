import type { DependencyWatchRecord } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import type { DependencyAlertResult } from '../../ports/dependency-watcher/dependency-alert.port.js';
import type { RegistryVersionInfo } from '../../ports/dependency-registry/registry-strategy.interface.js';

export function buildDependencyNoteContent(
  record: DependencyWatchRecord,
  versionInfo: RegistryVersionInfo,
  analysis: DependencyAlertResult,
): string {
  const sections: string[] = [];

  sections.push('## Summary');
  sections.push(analysis.summary);
  sections.push('');

  sections.push('## Version Information');
  sections.push(`- **Package**: ${record.packageName}`);
  sections.push(`- **Current Version**: ${record.currentVersion}`);
  sections.push(`- **Latest Version**: ${versionInfo.version}`);
  sections.push(`- **Ecosystem**: ${record.ecosystem}`);
  sections.push('');

  if (analysis.breakingChanges && analysis.breakingChanges.length > 0) {
    sections.push('## Breaking Changes');
    analysis.breakingChanges.forEach((change: string) => {
      sections.push(`- ${change}`);
    });
    sections.push('');
  }

  if (analysis.nextSteps && analysis.nextSteps.length > 0) {
    sections.push('## Next Steps');
    analysis.nextSteps.forEach((step: string) => {
      sections.push(`- ${step}`);
    });
    sections.push('');
  }

  if (versionInfo.repositoryUrl) {
    sections.push('## Links');
    sections.push(`- Repository: ${versionInfo.repositoryUrl}`);
    sections.push('');
  }

  return sections.join('\n');
}

export function buildDependencyIssueTitle(input: {
  urgency: string;
  packageName: string;
  currentVersion: string;
  targetVersion: string;
}): string {
  return `[${input.urgency.toUpperCase()} Dependency Update] ${input.packageName}: ${input.currentVersion} → ${input.targetVersion}`;
}

export function buildDependencyIssueBody(input: {
  record: DependencyWatchRecord;
  versionInfo: RegistryVersionInfo;
  analysis: DependencyAlertResult;
}): string {
  const noteContent = buildDependencyNoteContent(input.record, input.versionInfo, input.analysis);
  const sections: string[] = [
    noteContent,
    '## Autonomous Repair Instructions (`heal-agent`)',
    `- Update \`${input.record.packageName}\` from \`${input.record.currentVersion}\` to \`${input.versionInfo.version}\` in the appropriate manifest and lockfile.`,
    '- Adapt any call sites affected by breaking changes listed above.',
    '- Run the project build and test suite to verify compatibility before opening the Draft PR.',
    '',
    `<!-- kote-dependency:${input.record.packageName}@${input.versionInfo.version} -->`,
  ];
  return sections.join('\n');
}
