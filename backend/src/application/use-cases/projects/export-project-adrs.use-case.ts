import { Injectable } from '@nestjs/common';
import { NoteSynthesisRepository } from '../../ports/notes/note-synthesis.repository.js';
import { createZipArchive, type ZipEntry } from '../../../domain/utils/zip.utils.js';
import { sanitizeFileStem } from '../../../domain/strings.js';
import { getProjectDecisionStatusLabel, type ProjectDecisionItem } from '../../models/project-decisions.models.js';

export type ExportProjectAdrsInput = {
  projectSlug: string;
  status?: string;
  file?: string;
  search?: string;
  kind?: 'decision' | 'failed_attempt' | 'all';
};

export type ExportProjectAdrsResult = {
  buffer: Buffer;
  filename: string;
  totalDecisions: number;
};

@Injectable()
export class ExportProjectAdrsUseCase {
  constructor(private readonly noteSynthesisRepository: NoteSynthesisRepository) {}

  async execute(userId: string, input: ExportProjectAdrsInput): Promise<ExportProjectAdrsResult> {
    const decisionsResult = await this.noteSynthesisRepository.listProjectDecisions(userId, {
      projectSlug: input.projectSlug,
      status: input.status,
      file: input.file,
      search: input.search,
      kind: input.kind,
      page: 1,
      pageSize: 2000,
    });

    const items = decisionsResult.items;
    const entries: ZipEntry[] = [];
    const now = new Date();

    const adrTableRows: string[] = [];

    items.forEach((item, idx) => {
      const numStr = String(idx + 1).padStart(4, '0');
      const adrId = `ADR-${numStr}`;
      const firstLine = item.text.split('\n')[0].replace(/^#+\s*/, '').trim();
      const title = firstLine.length > 70 ? `${firstLine.slice(0, 67)}...` : firstLine;
      const fileStem = sanitizeFileStem(firstLine, `decision-${numStr}`);
      const adrFilename = `${numStr}-${fileStem}.md`;
      const relativePath = `adr/${adrFilename}`;

      const statusLabel = getProjectDecisionStatusLabel(item.status);
      const kindLabel = item.kind === 'failed_attempt' ? 'Failed Attempt' : 'Decision';
      const dateStr = item.occurredAt ? item.occurredAt.split('T')[0] : 'N/A';

      const markdownContent = [
        `# ${adrId}: ${title}`,
        '',
        `- **Status**: ${statusLabel}`,
        `- **Date**: ${dateStr}`,
        `- **Kind**: ${kindLabel}`,
        `- **Project**: ${input.projectSlug}`,
        `- **Source Note**: ${item.noteTitle || 'Untitled'} (\`${item.notePath}\`)`,
        `- **Source Channel**: ${item.sourceChannel || 'IDE'}`,
        '',
        '## Context & Summary',
        item.kind === 'failed_attempt'
          ? 'Recorded as an unviable path or rejected alternative during development.'
          : 'Recorded architectural or design decision from developer workflows.',
        '',
        '## Details',
        item.text,
        '',
        '## Affected Files',
        item.files.length > 0 ? item.files.map((f) => `- \`${f}\``).join('\n') : '_None specified_',
        '',
        '## Related Entities & Keywords',
        item.entities.length > 0 ? item.entities.map((e) => `- \`${e}\``).join('\n') : '_None specified_',
        '',
      ].join('\n');

      entries.push({
        path: relativePath,
        content: markdownContent,
        mtime: now,
      });

      adrTableRows.push(
        `| [${adrId}](./${relativePath}) | ${title.replace(/\|/g, '\\|')} | ${statusLabel} | ${kindLabel} | ${dateStr} | ${item.files.length} |`,
      );
    });

    const indexContent = [
      `# Architecture Decision Records: ${input.projectSlug}`,
      '',
      `Exported from Kote Knowledge Base on **${now.toISOString().split('T')[0]}**.`,
      `Total records: **${items.length}**`,
      '',
      '| ADR ID | Title | Status | Type | Date | Files |',
      '| --- | --- | --- | --- | --- | --- |',
      ...adrTableRows,
      '',
    ].join('\n');

    entries.unshift({
      path: 'INDEX.md',
      content: indexContent,
      mtime: now,
    });

    const buffer = createZipArchive(entries);
    const dateStamp = now.toISOString().split('T')[0];
    const filename = `kote-${input.projectSlug}-adrs-${dateStamp}.zip`;

    return {
      buffer,
      filename,
      totalDecisions: items.length,
    };
  }
}
