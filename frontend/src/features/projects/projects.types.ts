import type { NoteDetail, NoteSummary } from '../../shared/api/models/note';
import type { ProjectFolder } from '../../shared/api/models/project-folder';
import type { Project } from '../../shared/api/models/project';

export type FlatProjectFolder = ProjectFolder & { depth: number };

export type ProjectModalState =
  | { mode: 'create' }
  | { mode: 'edit'; project: Project };

export type FolderModalState =
  | { mode: 'create'; projectSlug: string; parentFolderId?: string }
  | { mode: 'edit'; projectSlug: string; folder: ProjectFolder };

export type NoteModalState =
  | {
      mode: 'create';
      projectSlug: string;
      folderId?: string;
      initialTitle?: string;
      initialAttachments?: Array<{
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        dataBase64: string;
      }>;
    }
  | { mode: 'edit'; note: NoteDetail };

export type ConfirmState =
  | { kind: 'project'; project: Project }
  | { kind: 'folder'; projectSlug: string; folder: ProjectFolder }
  | { kind: 'note'; note: NoteSummary };
