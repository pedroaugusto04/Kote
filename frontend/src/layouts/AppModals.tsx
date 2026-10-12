import type { Project } from '../shared/api/models/project';
import type { ApiClientError } from '../shared/api/client';
import { ProjectNoteModal } from '../features/projects/modals/ProjectNoteModal';
import { ConfirmationModal } from '../shared/ui/confirmation-modal';
import { QuotaExceededModal } from '../shared/ui/QuotaExceededModal';
import {
  ConfirmKind,
  WorkspaceModalMode,
  type ConfirmState,
  type FlatProjectFolder,
  type NoteModalState,
} from '../features/projects/projects.types';
import { UI_MESSAGES } from '../shared/constants/ui.constants';

export interface AppModalsProps {
  noteModal: NoteModalState | null;
  noteModalFolders?: FlatProjectFolder[];
  onCloseNoteModal: () => void;
  onSavedNoteModal: (noteId: string, mode: WorkspaceModalMode) => void | Promise<void>;
  projects?: Project[];
  workspaceSlug: string;
  confirmState: ConfirmState | null;
  isDeletingNote: boolean;
  onCancelConfirm: () => void;
  onConfirmDeleteNote: (noteId: string) => void;
  quotaExceededError: ApiClientError | null;
  onCloseQuotaModal: () => void;
}

export function AppModals({
  noteModal,
  noteModalFolders,
  onCloseNoteModal,
  onSavedNoteModal,
  projects,
  workspaceSlug,
  confirmState,
  isDeletingNote,
  onCancelConfirm,
  onConfirmDeleteNote,
  quotaExceededError,
  onCloseQuotaModal,
}: AppModalsProps) {
  return (
    <>
      {noteModal ? (
        <ProjectNoteModal
          key={noteModal.mode === WorkspaceModalMode.Edit ? `edit-${noteModal.note.id}` : `create-${noteModal.projectSlug}`}
          folders={noteModal.mode === WorkspaceModalMode.Edit ? noteModalFolders : undefined}
          mode={noteModal.mode}
          note={noteModal.mode === WorkspaceModalMode.Edit ? noteModal.note : undefined}
          onClose={onCloseNoteModal}
          onSaved={onSavedNoteModal}
          projectSlug={noteModal.mode === WorkspaceModalMode.Edit ? noteModal.note.project : noteModal.projectSlug}
          initialFolderId={noteModal.mode === WorkspaceModalMode.Edit ? noteModal.note.folderId || undefined : undefined}
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
          projects={projects}
          workspaceSlug={workspaceSlug}
        />
      ) : null}

      {confirmState?.kind === ConfirmKind.Note ? (
        <ConfirmationModal
          busy={isDeletingNote}
          cancelLabel={UI_MESSAGES.CANCEL}
          confirmLabel={UI_MESSAGES.CONFIRM_DELETION}
          description={`Deleting note ${confirmState.note.title} also removes its linked reminder, when present.`}
          onCancel={onCancelConfirm}
          onConfirm={() => onConfirmDeleteNote(confirmState.note.id)}
          title={UI_MESSAGES.DELETE_NOTE}
        />
      ) : null}

      {quotaExceededError ? (
        <QuotaExceededModal error={quotaExceededError} onClose={onCloseQuotaModal} />
      ) : null}
    </>
  );
}
