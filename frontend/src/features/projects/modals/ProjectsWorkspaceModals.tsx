import { useQueryClient } from '@tanstack/react-query';
import type { Dashboard } from '../../../shared/api/models/dashboard';
import type { GithubIntegrationRepository } from '../../../shared/api/models/integration';
import type { Project } from '../../../shared/api/models/project';
import { ConfirmationModal } from '../../../shared/ui/confirmation-modal';
import { notifySuccess } from '../../../shared/ui/notifications';
import { UI_MESSAGES } from '../../../shared/constants/ui.constants';
import { invalidateNoteRelatedQueries } from '../../../shared/api/note-query';
import { PROJECTS_WORKSPACE_MESSAGES } from '../projects-ui.constants';
import { ROOT_FOLDER_ID } from '../projects.constants';
import {
  ConfirmKind,
  WorkspaceModalMode,
  type ConfirmState,
  type FlatProjectFolder,
  type FolderModalState,
  type NoteModalState,
  type ProjectModalState,
} from '../projects.types';
import { ProjectFolderModal } from './ProjectFolderModal';
import { ProjectModal } from './ProjectModal';
import { ProjectNoteModal } from './ProjectNoteModal';

export type ProjectsWorkspaceModalsProps = {
  dashboard: Dashboard;
  workspaceSlug: string;
  selectedProject?: Project;
  flatFolders: FlatProjectFolder[];
  githubConnected: boolean;
  workspaceRepositories: GithubIntegrationRepository[];
  projectModal: ProjectModalState | null;
  setProjectModal: (state: ProjectModalState | null) => void;
  folderModal: FolderModalState | null;
  setFolderModal: (state: FolderModalState | null) => void;
  noteModal: NoteModalState | null;
  setNoteModal: (state: NoteModalState | null) => void;
  confirmState: ConfirmState | null;
  setConfirmState: (state: ConfirmState | null) => void;
  pendingNotesCount: number;
  processNextNote: () => void;
  openProject: (projectSlug: string) => void;
  onFolderCreatedOrUpdated: (folderId: string) => void;
  isDeleting: boolean;
  onDeleteProject: (projectSlug: string) => void;
  onDeleteFolder: (projectSlug: string, folderId: string) => void;
  onDeleteNote: (noteId: string) => void;
};

export function ProjectsWorkspaceModals({
  dashboard,
  workspaceSlug,
  selectedProject,
  flatFolders,
  githubConnected,
  workspaceRepositories,
  projectModal,
  setProjectModal,
  folderModal,
  setFolderModal,
  noteModal,
  setNoteModal,
  confirmState,
  setConfirmState,
  pendingNotesCount,
  processNextNote,
  openProject,
  onFolderCreatedOrUpdated,
  isDeleting,
  onDeleteProject,
  onDeleteFolder,
  onDeleteNote,
}: ProjectsWorkspaceModalsProps) {
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    await invalidateNoteRelatedQueries(queryClient);
  };

  return (
    <>
      {projectModal ? (
        <ProjectModal
          githubConnected={githubConnected}
          workspaceRepositories={workspaceRepositories}
          mode={projectModal.mode}
          project={projectModal.mode === WorkspaceModalMode.Edit ? projectModal.project : undefined}
          onClose={() => setProjectModal(null)}
          onSaved={async (projectSlug, mode) => {
            setProjectModal(null);
            notifySuccess(mode === WorkspaceModalMode.Create ? UI_MESSAGES.PROJECT_CREATED : UI_MESSAGES.PROJECT_UPDATED);
            openProject(projectSlug);
            await handleRefresh();
          }}
        />
      ) : null}

      {folderModal ? (
        <ProjectFolderModal
          folders={flatFolders}
          mode={folderModal.mode}
          folder={folderModal.mode === WorkspaceModalMode.Edit ? folderModal.folder : undefined}
          initialParentFolderId={folderModal.mode === WorkspaceModalMode.Create ? folderModal.parentFolderId : undefined}
          onClose={() => setFolderModal(null)}
          onSaved={async (folderId, mode) => {
            setFolderModal(null);
            onFolderCreatedOrUpdated(folderId || ROOT_FOLDER_ID);
            notifySuccess(mode === WorkspaceModalMode.Create ? UI_MESSAGES.FOLDER_CREATED : UI_MESSAGES.FOLDER_UPDATED);
            await handleRefresh();
          }}
          projectSlug={folderModal.projectSlug}
        />
      ) : null}

      {noteModal ? (
        <ProjectNoteModal
          key={
            noteModal.mode === WorkspaceModalMode.Edit
              ? `edit-${noteModal.note.id}`
              : `create-${noteModal.projectSlug}-${noteModal.folderId || ''}-${noteModal.initialTitle || ''}`
          }
          folders={
            selectedProject?.projectSlug ===
            (noteModal.mode === WorkspaceModalMode.Edit ? noteModal.note.project : noteModal.projectSlug)
              ? flatFolders
              : undefined
          }
          mode={noteModal.mode}
          note={noteModal.mode === WorkspaceModalMode.Edit ? noteModal.note : undefined}
          onClose={() => {
            if (pendingNotesCount > 0) {
              processNextNote();
            } else {
              setNoteModal(null);
            }
          }}
          onSaved={async (_noteId, mode) => {
            notifySuccess(mode === WorkspaceModalMode.Create ? UI_MESSAGES.NOTE_CREATED : UI_MESSAGES.NOTE_UPDATED);
            await handleRefresh();

            if (pendingNotesCount > 0) {
              processNextNote();
            } else {
              setNoteModal(null);
            }
          }}
          projectSlug={noteModal.mode === WorkspaceModalMode.Edit ? noteModal.note.project : noteModal.projectSlug}
          initialFolderId={noteModal.mode === WorkspaceModalMode.Edit ? noteModal.note.folderId || undefined : noteModal.folderId}
          initialTitle={noteModal.mode === WorkspaceModalMode.Create ? noteModal.initialTitle : undefined}
          initialAttachments={
            noteModal.mode === WorkspaceModalMode.Edit
              ? noteModal.note.attachments?.map((att) => ({
                  fileName: att.fileName,
                  mimeType: att.mimeType,
                  sizeBytes: att.sizeBytes,
                  dataBase64: '',
                }))
              : noteModal.mode === WorkspaceModalMode.Create
                ? noteModal.initialAttachments
                : undefined
          }
          projects={dashboard.projects}
          workspaceSlug={workspaceSlug}
        />
      ) : null}

      {confirmState ? (
        <ConfirmationModal
          busy={isDeleting}
          cancelLabel={UI_MESSAGES.CANCEL}
          confirmLabel={UI_MESSAGES.CONFIRM_DELETION}
          description={
            confirmState.kind === ConfirmKind.Project
              ? PROJECTS_WORKSPACE_MESSAGES.CONFIRMATION.DELETE_PROJECT.replace('{displayName}', confirmState.project.displayName)
              : confirmState.kind === ConfirmKind.Folder
                ? PROJECTS_WORKSPACE_MESSAGES.CONFIRMATION.DELETE_FOLDER.replace('{displayName}', confirmState.folder.displayName)
                : PROJECTS_WORKSPACE_MESSAGES.CONFIRMATION.DELETE_NOTE.replace('{title}', confirmState.note.title)
          }
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            if (confirmState.kind === ConfirmKind.Project) {
              onDeleteProject(confirmState.project.projectSlug);
              return;
            }
            if (confirmState.kind === ConfirmKind.Folder) {
              onDeleteFolder(confirmState.projectSlug, confirmState.folder.id);
              return;
            }
            onDeleteNote(confirmState.note.id);
          }}
          title={
            confirmState.kind === ConfirmKind.Project
              ? UI_MESSAGES.DELETE_PROJECT
              : confirmState.kind === ConfirmKind.Folder
                ? UI_MESSAGES.DELETE_FOLDER
                : UI_MESSAGES.DELETE_NOTE
          }
        />
      ) : null}
    </>
  );
}
