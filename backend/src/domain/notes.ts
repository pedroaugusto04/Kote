import path from 'node:path';

import type { IngestPayload } from '../contracts/ingest.js';
import { renderFrontmatter } from './frontmatter.js';
import type { Project } from './projects.js';
import { sanitizeFileStem, trimText } from './strings.js';
import { getUtcParts } from './time.js';
import { VAULT_FOLDERS } from './constants/vault.constants.js';
import { AI_SOURCE_PATTERNS } from './constants/ai.constants.js';
import {
  MARKDOWN_LIST_NONE,
  MARKDOWN_NO_FINDINGS,
  MARKDOWN_NO_IMPACT,
  MARKDOWN_NO_SUMMARY,
  MARKDOWN_SECTIONS,
} from './constants/markdown.constants.js';

export function folderForCanonicalType(type: IngestPayload['classification']['canonicalType']): string {
  if (type === 'knowledge' || type === 'decision') return VAULT_FOLDERS.KNOWLEDGE;
  if (type === 'incident') return VAULT_FOLDERS.INCIDENTS;
  if (type === 'followup') return VAULT_FOLDERS.FOLLOWUPS;
  return VAULT_FOLDERS.INBOX;
}

function folderPathSegments(folderSlugPath = ''): string[] {
  return String(folderSlugPath || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function noteProjectPathPrefix(projectSlug: string, folderSlugPath = ''): string {
  return path.join(VAULT_FOLDERS.INBOX, projectSlug, ...folderPathSegments(folderSlugPath)).replace(/\\/g, '/');
}

export function rewriteNotePathForFolder(
  notePath: string,
  projectSlug: string,
  previousFolderSlugPath: string,
  nextFolderSlugPath: string,
): string {
  return relocateNotePath(notePath, projectSlug, previousFolderSlugPath, nextFolderSlugPath);
}

export function relocateNotePath(
  notePath: string,
  projectSlug: string,
  previousFolderSlugPath = '',
  nextFolderSlugPath = '',
): string {
  const normalizedPath = notePath.replace(/\\/g, '/');
  const previousPrefix = `${noteProjectPathPrefix(projectSlug, previousFolderSlugPath)}/`;
  const nextPrefix = `${noteProjectPathPrefix(projectSlug, nextFolderSlugPath)}/`;
  return normalizedPath.startsWith(previousPrefix)
    ? `${nextPrefix}${normalizedPath.slice(previousPrefix.length)}`
    : normalizedPath;
}

export function buildNotePaths(project: Project, payload: IngestPayload, folderSlugPath = ''): {
  eventRelativePath: string;
  canonicalRelativePath: string;
  followupRelativePath: string;
  assetRelativePaths: string[];
  dailyRelativePath: string;
} {
  const occurredAt = new Date(payload.event.occurredAt);
  const safeDate = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;
  const { year, month, day, time } = getUtcParts(safeDate);
  const titleStem = sanitizeFileStem(payload.content.title || payload.content.rawText, payload.classification.kind);
  const baseFile = `${year}${month}${day}-${time}-${titleStem}.md`;
  const eventRelativePath = path.join(noteProjectPathPrefix(project.projectSlug, folderSlugPath), year, month, baseFile);
  const canonicalRelativePath =
    payload.classification.canonicalType !== 'event'
      ? path.join(folderForCanonicalType(payload.classification.canonicalType), project.projectSlug, ...folderPathSegments(folderSlugPath), year, month, baseFile)
      : '';
  const followupRelativePath = payload.actions.followUpBy
    ? path.join(VAULT_FOLDERS.FOLLOWUPS, project.projectSlug, ...folderPathSegments(folderSlugPath), year, month, `${year}${month}${day}-${time}-${titleStem}-followup.md`)
    : '';
  const assetRelativePaths = payload.content.attachments.map((attachment) =>
    path.join(VAULT_FOLDERS.ASSETS, project.projectSlug, ...folderPathSegments(folderSlugPath), year, month, `${year}${month}${day}-${time}-${sanitizeFileStem(attachment.fileName, 'attachment')}`),
  );
  const dailyRelativePath = path.join(noteProjectPathPrefix(project.projectSlug, folderSlugPath), year, `${year}-${month}-${day}.md`);
  return {
    eventRelativePath,
    canonicalRelativePath,
    followupRelativePath,
    assetRelativePaths,
    dailyRelativePath,
  };
}

function renderList(items: string[]): string {
  if (!items.length) return MARKDOWN_LIST_NONE;
  return items.map((item) => `- ${item}`).join('\n');
}

function renderReviewFindings(findings: NonNullable<IngestPayload['content']['sections']>['reviewFindings']): string {
  if (!findings.length) return MARKDOWN_NO_FINDINGS;
  return findings
    .map((finding) => {
      const parts = [`- **[${finding.severity.toUpperCase()}] ${finding.summary}**`];
      if (finding.file) parts.push(`  file: ${finding.file}`);
      if (finding.recommendation) parts.push(`  recommendation: ${finding.recommendation}`);
      return parts.join('\n');
    })
    .join('\n');
}


export function isAiSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const normalized = source.toLowerCase().trim();
  return AI_SOURCE_PATTERNS.some((pattern) => normalized === pattern || normalized.includes(pattern));
}

export function isAiNote(payload: IngestPayload): boolean {
  return (
    payload.source.channel === 'ai-chat' ||
    isAiSource(payload.source.system)
  );
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
    related: [paths.canonicalRelativePath, paths.followupRelativePath].filter(Boolean),
  });

  if (isAiNote(payload)) {
    return [
      frontmatter,
      `# ${trimText(payload.content.title, payload.content.rawText)}`,
      '',
      `Project: ${project.displayName || project.projectSlug}`,
      '',
      payload.content.rawText,
      '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    frontmatter,
    `# ${trimText(payload.content.title, payload.content.rawText)}`,
    '',
    `Project: ${project.displayName || project.projectSlug}`,
    '',
    MARKDOWN_SECTIONS.ORIGINAL_TEXT,
    '',
    payload.content.rawText,
    '',
    MARKDOWN_SECTIONS.SUMMARY,
    '',
    sections.summary || MARKDOWN_NO_SUMMARY,
    '',
    MARKDOWN_SECTIONS.IMPACT,
    '',
    sections.impact || MARKDOWN_NO_IMPACT,
    '',
    MARKDOWN_SECTIONS.RISKS,
    '',
    renderList(sections.risks),
    '',
    MARKDOWN_SECTIONS.NEXT_STEPS,
    '',
    renderList(sections.nextSteps),
    '',
    payload.event.type === 'code_review'
      ? [MARKDOWN_SECTIONS.REVIEW_FINDINGS, '', renderReviewFindings(sections.reviewFindings)].join('\n')
      : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}
