import type { NoteDetail, NoteSummary } from '../../shared/api/models/note';
import type { ProjectFolder } from '../../shared/api/models/project-folder';
import type { Project } from '../../shared/api/models/project';

export enum WorkspaceModalMode {
  Create = 'create',
  Edit = 'edit',
}

export enum ConfirmKind {
  Project = 'project',
  Folder = 'folder',
  Note = 'note',
}

export type FlatProjectFolder = ProjectFolder & { depth: number };

export type ProjectModalState =
  | { mode: WorkspaceModalMode.Create }
  | { mode: WorkspaceModalMode.Edit; project: Project };

export type FolderModalState =
  | { mode: WorkspaceModalMode.Create; projectSlug: string; parentFolderId?: string }
  | { mode: WorkspaceModalMode.Edit; projectSlug: string; folder: ProjectFolder };

export type NoteModalState =
  | {
      mode: WorkspaceModalMode.Create;
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
  | { mode: WorkspaceModalMode.Edit; note: NoteDetail };

export type ConfirmState =
  | { kind: ConfirmKind.Project; project: Project }
  | { kind: ConfirmKind.Folder; projectSlug: string; folder: ProjectFolder }
  | { kind: ConfirmKind.Note; note: NoteSummary };
