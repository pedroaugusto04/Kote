import { Injectable, NotFoundException } from "@nestjs/common";

import type { ExportProjectNotesInput } from "../../models/project-timeline.models.js";
import type { NoteRecord } from "../../models/repository-records.models.js";
import { collectFolderDescendantIds } from "../../utils/content/project-folder.utils.js";
import { ContentRepository } from "../../ports/notes/content.repository.js";
import { ContentObjectStorageService } from "../../services/content/content-object-storage.service.js";
import { createZipArchive, type ZipEntry } from "../../../domain/utils/zip.utils.js";
import { slugify } from "../../../domain/strings.js";

const EXPORT_ZIP_CONSTANTS = {
  ALL_PROJECTS_SLUG: "all-projects",
  ALL_PROJECTS_NAME: "All Projects",
  ALL_ALIAS: "all",
  INDEX_FILENAME: "INDEX.md",
  NO_DATE_LABEL: "no-date",
  UNTITLED_NOTE: "Untitled",
  DEFAULT_SLUG: "note",
  FILTER_ALL: "ALL",
  FILTER_NONE: "None",
  NOTES_FOLDER_PREFIX: "notes",
  ERROR_PROJECT_NOT_FOUND: "project_not_found",
} as const;

export type ExportNotesZipResult = {
  buffer: Buffer;
  filename: string;
  totalNotes: number;
};

type NoteIndexItem = {
  index: number;
  dateStr: string;
  title: string;
  filename: string;
  summary: string;
};

type ProjectScope = {
  projectId?: string;
  projectSlug: string;
  displayName: string;
};

type IndexMetadataInput = {
  projectScope: ProjectScope;
  category?: string;
  status?: string;
  query?: string;
  totalNotes: number;
  items: NoteIndexItem[];
};

@Injectable()
export class ExportProjectNotesZipUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) {}

  async execute(
    userId: string,
    input: ExportProjectNotesInput & { projectSlug?: string },
  ): Promise<ExportNotesZipResult> {
    const projectScope = await this.resolveProjectScope(userId, input.projectSlug, input.projectId);
    const folderIds = await this.resolveFolderIds(userId, projectScope.projectId, input.folderId);

    const rawNotes = await this.contentRepository.findNotesForExport(userId, {
      ...input,
      projectId: projectScope.projectId,
      folderId: undefined,
      folderIds,
    });

    const hydratedNotes = await this.hydrateNotes(rawNotes);
    const { noteEntries, indexItems } = this.buildNoteEntries(hydratedNotes);

    const indexMarkdown = this.buildIndexMarkdown({
      projectScope,
      category: input.category,
      status: input.status,
      query: input.query,
      totalNotes: hydratedNotes.length,
      items: indexItems,
    });

    const allEntries: ZipEntry[] = [
      {
        path: EXPORT_ZIP_CONSTANTS.INDEX_FILENAME,
        content: indexMarkdown,
        mtime: new Date(),
      },
      ...noteEntries,
    ];

    const zipBuffer = createZipArchive(allEntries);
    const downloadDate = new Date().toISOString().split("T")[0];
    const filename = `kote-${projectScope.projectSlug}-${downloadDate}.zip`;

    return {
      buffer: zipBuffer,
      filename,
      totalNotes: hydratedNotes.length,
    };
  }

  private async resolveProjectScope(
    userId: string,
    projectSlug?: string,
    fallbackProjectId?: string,
  ): Promise<ProjectScope> {
    const isSpecificProject = Boolean(projectSlug && projectSlug !== EXPORT_ZIP_CONSTANTS.ALL_ALIAS);

    if (!isSpecificProject) {
      return {
        projectId: fallbackProjectId,
        projectSlug: EXPORT_ZIP_CONSTANTS.ALL_PROJECTS_SLUG,
        displayName: EXPORT_ZIP_CONSTANTS.ALL_PROJECTS_NAME,
      };
    }

    const project = await this.contentRepository.getProjectBySlug(userId, projectSlug!);
    if (!project || !project.enabled) {
      throw new NotFoundException(EXPORT_ZIP_CONSTANTS.ERROR_PROJECT_NOT_FOUND);
    }

    return {
      projectId: project.id,
      projectSlug: project.projectSlug,
      displayName: project.displayName,
    };
  }

  private async resolveFolderIds(
    userId: string,
    projectId?: string,
    folderId?: string,
  ): Promise<string[] | undefined> {
    const normalizedFolderId = folderId?.trim();
    if (!projectId || !normalizedFolderId) {
      return undefined;
    }

    const folders = await this.contentRepository.listProjectFolders(userId, projectId);
    const selectedFolder = folders.find((folder) => folder.id === normalizedFolderId);
    if (!selectedFolder) {
      return undefined;
    }

    return collectFolderDescendantIds(folders, normalizedFolderId);
  }

  private async hydrateNotes(notes: NoteRecord[]): Promise<NoteRecord[]> {
    return Promise.all(
      notes.map(async (note) => {
        try {
          return await this.contentObjectStorage.hydrateMarkdown(note);
        } catch {
          return note;
        }
      }),
    );
  }

  private buildNoteEntries(notes: NoteRecord[]): {
    noteEntries: ZipEntry[];
    indexItems: NoteIndexItem[];
  } {
    const noteEntries: ZipEntry[] = [];
    const indexItems: NoteIndexItem[] = [];

    notes.forEach((note, idx) => {
      const index = idx + 1;
      const dateObj = this.resolveNoteDate(note);
      const dateStr = this.formatDateString(dateObj);
      const title = (note.title || EXPORT_ZIP_CONSTANTS.UNTITLED_NOTE).trim();
      const slugTitle = slugify(title).slice(0, 50) || EXPORT_ZIP_CONSTANTS.DEFAULT_SLUG;
      const sequence = String(index).padStart(3, "0");
      const filename = `${EXPORT_ZIP_CONSTANTS.NOTES_FOLDER_PREFIX}/${sequence}_${dateStr}_${slugTitle}.md`;
      const markdownContent = this.formatNoteMarkdown(title, note.markdown, note.summary);

      noteEntries.push({
        path: filename,
        content: markdownContent,
        mtime: dateObj,
      });

      indexItems.push({
        index,
        dateStr,
        title,
        filename,
        summary: note.summary?.trim() || "",
      });
    });

    return { noteEntries, indexItems };
  }

  private resolveNoteDate(note: NoteRecord): Date {
    const rawDate = note.occurredAt || note.createdAt;
    const parsed = rawDate ? new Date(rawDate) : new Date();
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private formatDateString(date: Date): string {
    return isNaN(date.getTime()) ? EXPORT_ZIP_CONSTANTS.NO_DATE_LABEL : date.toISOString().split("T")[0];
  }

  private formatNoteMarkdown(title: string, markdown?: string, summary?: string): string {
    const trimmedMd = markdown?.trim();
    if (!trimmedMd) {
      const fallbackSummary = summary?.trim() ? `\n\n${summary.trim()}` : "";
      return `# ${title}${fallbackSummary}`;
    }

    if (trimmedMd.startsWith("# ")) {
      return trimmedMd;
    }

    return `# ${title}\n\n${trimmedMd}`;
  }

  private buildIndexMarkdown(input: IndexMetadataInput): string {
    const exportTimestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    const sourceFilter = (input.category?.trim() || EXPORT_ZIP_CONSTANTS.FILTER_ALL).toUpperCase();
    const statusFilter = (input.status?.trim() || EXPORT_ZIP_CONSTANTS.FILTER_ALL).toUpperCase();
    const searchFilter = input.query?.trim() ? `\`${input.query.trim()}\`` : EXPORT_ZIP_CONSTANTS.FILTER_NONE;

    const headerSection = [
      `# Notes Index - ${input.projectScope.displayName}`,
      "",
      `- **Project:** ${input.projectScope.displayName} (\`${input.projectScope.projectSlug}\`)`,
      `- **Source Filter:** ${sourceFilter}`,
      `- **Status Filter:** ${statusFilter}`,
      `- **Search Query:** ${searchFilter}`,
      `- **Total Notes:** ${input.totalNotes}`,
      `- **Exported At:** ${exportTimestamp} (UTC)`,
      "",
      "---",
      "",
      "## Notes (Chronological Order - Oldest to Newest)",
      "",
    ].join("\n");

    if (input.items.length === 0) {
      return `${headerSection}*No notes found matching the selected filters.*\n`;
    }

    const noteListSection = input.items
      .map((item) => {
        const link = `./${item.filename}`;
        const summarySuffix = item.summary
          ? ` — *${item.summary.replace(/\n+/g, " ").slice(0, 120)}*`
          : "";
        return `- **[${item.dateStr}]** [${item.title}](${link})${summarySuffix}`;
      })
      .join("\n");

    return `${headerSection}${noteListSection}\n`;
  }
}