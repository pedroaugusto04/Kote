import path from 'node:path';

import type { IngestPayload } from '../contracts/ingest.js';
import { renderFrontmatter } from './frontmatter.js';
import type { Project } from './projects.js';
import { sanitizeFileStem, trimText } from './strings.js';
import { getSaoPauloParts } from './time.js';

export const vaultFolders = {
  home: '00 Home',
  projects: '10 Projects',
  inbox: '20 Inbox',
  knowledge: '30 Knowledge',
  incidents: '40 Incidents',
  followups: '50 Followups',
  reminders: '60 Reminders',
  assets: '90 Assets',
} as const;

export function vaultLink(relativePath: string, label = ''): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/\.md$/i, '');
  return label ? `[[${normalized}|${label}]]` : `[[${normalized}]]`;
}

export function folderForCanonicalType(type: IngestPayload['classification']['canonicalType']): string {
  if (type === 'knowledge' || type === 'decision') return vaultFolders.knowledge;
  if (type === 'incident') return vaultFolders.incidents;
  if (type === 'followup') return vaultFolders.followups;
  if (type === 'reminder') return vaultFolders.reminders;
  return vaultFolders.inbox;
}

export function buildNotePaths(project: Project, payload: IngestPayload): {
  eventRelativePath: string;
  canonicalRelativePath: string;
  followupRelativePath: string;
  reminderRelativePath: string;
  assetRelativePaths: string[];
  dailyRelativePath: string;
} {
  const occurredAt = new Date(payload.event.occurredAt);
  const safeDate = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;
  const { year, month, day, time } = getSaoPauloParts(safeDate);
  const titleStem = sanitizeFileStem(payload.content.title || payload.content.rawText, payload.classification.kind);
  const baseFile = `${year}${month}${day}-${time}-${titleStem}.md`;
  const eventRelativePath = path.join(vaultFolders.inbox, project.projectSlug, year, month, baseFile);
  const canonicalRelativePath =
    payload.classification.canonicalType !== 'event'
      ? path.join(folderForCanonicalType(payload.classification.canonicalType), project.projectSlug, year, month, baseFile)
      : '';
  const followupRelativePath = payload.actions.followUpBy
    ? path.join(vaultFolders.followups, project.projectSlug, year, month, `${year}${month}${day}-${time}-${titleStem}-followup.md`)
    : '';
  const reminderRelativePath = payload.actions.reminderDate
    ? path.join(vaultFolders.reminders, project.projectSlug, year, month, `${year}${month}${day}-${time}-${titleStem}-reminder.md`)
    : '';
  const assetRelativePaths = payload.content.attachments.map((attachment) =>
    path.join(vaultFolders.assets, project.projectSlug, year, month, `${year}${month}${day}-${time}-${sanitizeFileStem(attachment.fileName, 'attachment')}`),
  );
  const dailyRelativePath = path.join(vaultFolders.inbox, project.projectSlug, year, `${year}-${month}-${day}.md`);
  return {
    eventRelativePath,
    canonicalRelativePath,
    followupRelativePath,
    reminderRelativePath,
    assetRelativePaths,
    dailyRelativePath,
  };
}

function renderList(items: string[]): string {
  if (!items.length) return '- none';
  return items.map((item) => `- ${item}`).join('\n');
}

function renderReviewFindings(findings: NonNullable<IngestPayload['content']['sections']>['reviewFindings']): string {
  if (!findings.length) return 'No findings registered.';
  return findings
    .map((finding) => {
      const parts = [`- [${finding.severity.toUpperCase()}] ${finding.summary}`];
      if (finding.file) parts.push(`  file: ${finding.file}`);
      if (finding.recommendation) parts.push(`  recommendation: ${finding.recommendation}`);
      return parts.join('\n');
    })
    .join('\n');
}

export function renderEventNote(project: Project, payload: IngestPayload, paths: ReturnType<typeof buildNotePaths>): string {
  const sections = payload.content.sections;
  const frontmatter = renderFrontmatter({
    id: payload.source.correlationId,
    type: 'event',
    workspace: project.workspaceSlug,
    source_channel: payload.source.channel,
    source_system: payload.source.system,
    event_type: payload.event.type,
    project: project.projectSlug,
    kind: payload.classification.kind,
    canonical_type: payload.classification.canonicalType,
    importance: payload.classification.importance,
    status: payload.classification.status || 'active',
    tags: payload.classification.tags,
    occurred_at: payload.event.occurredAt,
    related: [paths.canonicalRelativePath, paths.followupRelativePath, paths.reminderRelativePath].filter(Boolean),
  });
  return [
    frontmatter,
    `# ${trimText(payload.content.title, payload.content.rawText)}`,
    '',
    `Projeto: ${vaultLink(path.join(vaultFolders.projects, `${project.projectSlug}.md`), project.displayName)}`,
    '',
    '## Texto original',
    '',
    payload.content.rawText,
    '',
    '## Resumo',
    '',
    sections.summary || 'No summary generated.',
    '',
    '## Impacto',
    '',
    sections.impact || 'No impact registered.',
    '',
    '## Riscos',
    '',
    renderList(sections.risks),
    '',
    '## Proximos passos',
    '',
    renderList(sections.nextSteps),
    '',
    payload.event.type === 'code_review'
      ? ['## Findings de review', '', renderReviewFindings(sections.reviewFindings)].join('\n')
      : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function renderCanonicalNote(project: Project, payload: IngestPayload, relatedEventPath: string): string {
  const sections = payload.content.sections;
  const frontmatter = renderFrontmatter({
    id: `${payload.source.correlationId}:canonical`,
    type: payload.classification.canonicalType,
    workspace: project.workspaceSlug,
    project: project.projectSlug,
    importance: payload.classification.importance,
    status: payload.classification.status || 'active',
    tags: payload.classification.tags,
    occurred_at: payload.event.occurredAt,
    canonical: true,
    related: [relatedEventPath],
  });
  return [
    frontmatter,
    `# ${trimText(payload.content.title, payload.content.rawText)}`,
    '',
    '## Resumo consolidado',
    '',
    sections.summary || payload.content.rawText,
    '',
    '## Impacto',
    '',
    sections.impact || 'No impact registered.',
    '',
    '## Riscos',
    '',
    renderList(sections.risks),
    '',
    '## Proximos passos',
    '',
    renderList(sections.nextSteps),
    '',
    `Origem: ${vaultLink(relatedEventPath, 'evento original')}`,
    '',
  ].join('\n');
}

export function renderFollowupNote(project: Project, payload: IngestPayload, relatedEventPath: string): string {
  const sections = payload.content.sections;
  const frontmatter = renderFrontmatter({
    id: `${payload.source.correlationId}:followup`,
    type: 'followup',
    workspace: project.workspaceSlug,
    project: project.projectSlug,
    importance: payload.classification.importance,
    status: 'open',
    tags: [...payload.classification.tags, 'followup'],
    occurred_at: payload.event.occurredAt,
    follow_up_by: payload.actions.followUpBy,
    related: [relatedEventPath],
  });
  return [
    frontmatter,
    `# Follow-up ${trimText(payload.content.title, payload.content.rawText)}`,
    '',
    '## O que fazer',
    '',
    renderList(sections.nextSteps.length ? sections.nextSteps : [payload.content.rawText]),
    '',
    `Prazo: ${payload.actions.followUpBy || 'not defined'}`,
    '',
    `Origem: ${vaultLink(relatedEventPath, 'evento original')}`,
    '',
  ].join('\n');
}

export function renderReminderNote(project: Project, payload: IngestPayload, relatedEventPath: string, reminderAt: string): string {
  const frontmatter = renderFrontmatter({
    id: `${payload.source.correlationId}:reminder`,
    type: 'reminder',
    workspace: project.workspaceSlug,
    project: project.projectSlug,
    importance: payload.classification.importance,
    status: 'open',
    tags: [...payload.classification.tags, 'reminder'],
    occurred_at: payload.event.occurredAt,
    reminder_date: payload.actions.reminderDate,
    reminder_time: payload.actions.reminderTime,
    reminder_at: reminderAt,
    related: [relatedEventPath],
  });
  return [
    frontmatter,
    `# Reminder ${trimText(payload.content.title, payload.content.rawText)}`,
    '',
    '## O que lembrar',
    '',
    payload.content.sections.summary || payload.content.rawText,
    '',
    `Agendado para: ${payload.actions.reminderDate}${payload.actions.reminderTime ? ` ${payload.actions.reminderTime}` : ''}`,
    '',
    `Origem: ${vaultLink(relatedEventPath, 'evento original')}`,
    '',
  ].join('\n');
}

export function renderProjectSummary(project: Project, recentEntries: string[]): string {
  const frontmatter = renderFrontmatter({
    id: `project:${project.projectSlug}`,
    type: 'project_summary',
    workspace: project.workspaceSlug,
    project: project.projectSlug,
    repo_full_name: project.repoFullName,
    tags: ['project', project.projectSlug],
  });
  return [
    frontmatter,
    `# ${project.displayName}`,
    '',
    project.repoFullName ? `Repo: ${project.repoFullName}` : '',
    '',
    '## Entradas recentes',
    '',
    recentEntries.length ? recentEntries.map((entry) => `- ${entry}`).join('\n') : '- none',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function renderHomePage(projects: Project[]): string {
  return [
    '# Home',
    '',
    '## Navegacao',
    '',
    `- ${vaultLink(path.join(vaultFolders.projects, 'Projects.md'), 'Projetos')}`,
    `- ${vaultLink(path.join(vaultFolders.reminders, 'Reminders.md'), 'Lembretes')}`,
    '',
    '## Projetos',
    '',
    ...projects.map((project) => `- ${vaultLink(path.join(vaultFolders.projects, `${project.projectSlug}.md`), project.displayName)}`),
    '',
  ].join('\n');
}

export function renderProjectsIndex(projects: Project[]): string {
  return [
    '# Projetos',
    '',
    ...projects.map((project) => `- ${vaultLink(path.join(vaultFolders.projects, `${project.projectSlug}.md`), project.displayName)}`),
    '',
  ].join('\n');
}

export function renderRemindersIndex(reminders: string[]): string {
  return [
    '# Lembretes',
    '',
    ...reminders.map((entry) => `- ${entry}`),
    '',
  ].join('\n');
}
