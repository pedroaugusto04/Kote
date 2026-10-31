import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { updateNote, fetchWorkspaceCategories, fetchProjectFolders } from '../../shared/api/client';
import { invalidateNoteRelatedQueries } from '../../shared/api/note-query';
import type { NoteDetail } from '../../shared/api/models/note';
import type { Project } from '../../shared/api/models/project';
import type { PendingAttachment } from '../../shared/ui/attachment-input';
import { notifySuccess, notifyError } from '../../shared/ui/notifications';
import { useGlobalLoading } from '../../app/global-loading';
import { flattenFolders } from '../../features/projects/projects.helpers';
import { reminderInputDateTime, reminderAtToUtc } from '../../shared/utils/format';

type UseNoteEditorOptions = {
  projects?: Project[];
  onProjectMoved?: (newProjectSlug: string) => void;
};

export function useNoteEditor(
  note: NoteDetail | null,
  workspaceSlug: string,
  options?: UseNoteEditorOptions,
) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editRawText, setEditRawText] = useState('');
  const [editProjectSlug, setEditProjectSlug] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editCategoryIds, setEditCategoryIds] = useState<string[]>([]);
  const [editReminderAt, setEditReminderAt] = useState('');
  const [editAttachments, setEditAttachments] = useState<PendingAttachment[]>([]);
  const [isDiscardConfirmationOpen, setIsDiscardConfirmationOpen] = useState(false);

  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();

  const categoriesQuery = useQuery({
    queryKey: ['workspace-categories', workspaceSlug],
    queryFn: () => fetchWorkspaceCategories(workspaceSlug),
    enabled: Boolean(workspaceSlug) && isEditing,
  });

  const foldersQuery = useQuery({
    queryKey: ['project-folders', 'vault-edit', editProjectSlug],
    queryFn: () => fetchProjectFolders(editProjectSlug),
    enabled: Boolean(editProjectSlug) && isEditing,
  });

  const folders = useMemo(
    () => flattenFolders(foldersQuery.data?.folders || []),
    [foldersQuery.data?.folders],
  );

  const resetFields = () => {
    if (note) {
      setEditTitle(note.title || '');
      setEditRawText(note.editor?.rawText || '');
      setEditProjectSlug(note.project || '');
      setEditFolderId(note.folderId || '');
      setEditTags(note.tags || []);
      setEditCategoryIds(note.categories?.map((c) => c.id) || []);
      setEditReminderAt(reminderInputDateTime({ reminderAt: note.editor?.reminderAt }));
      setEditAttachments([]);
    }
  };

  // Initialize edit values when entering edit mode or note changes
  useEffect(() => {
    if (isEditing && note) {
      resetFields();
    }
  }, [isEditing, note]);

  const isDirty = useMemo(() => {
    if (!isEditing || !note) return false;
    const initialReminder = reminderInputDateTime({ reminderAt: note.editor?.reminderAt });
    const initialCategoryIds = note.categories?.map((c) => c.id) || [];
    const initialTags = note.tags || [];

    return (
      editTitle !== (note.title || '') ||
      editRawText !== (note.editor?.rawText || '') ||
      editProjectSlug !== (note.project || '') ||
      editFolderId !== (note.folderId || '') ||
      editReminderAt !== initialReminder ||
      editAttachments.length > 0 ||
      editCategoryIds.length !== initialCategoryIds.length ||
      editCategoryIds.some((id) => !initialCategoryIds.includes(id)) ||
      editTags.length !== initialTags.length ||
      editTags.some((tag) => !initialTags.includes(tag))
    );
  }, [isEditing, note, editTitle, editRawText, editProjectSlug, editFolderId, editReminderAt, editAttachments, editCategoryIds, editTags]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!note) return;
      const reminderUtc = reminderAtToUtc(editReminderAt);
      return globalLoading.trackPromise(
        updateNote(note.id, {
          title: editTitle.trim(),
          rawText: editRawText,
          projectSlug: editProjectSlug || undefined,
          folderId: editFolderId || undefined,
          tags: editTags,
          categoryIds: editCategoryIds,
          reminderAt: reminderUtc ?? '',
          attachments: editAttachments.length > 0 ? editAttachments : undefined,
        })
      );
    },
    onSuccess: async () => {
      notifySuccess('Note updated successfully');
      setIsEditing(false);
      setEditAttachments([]);
      if (editProjectSlug && editProjectSlug !== note?.project) {
        options?.onProjectMoved?.(editProjectSlug);
      }
      await invalidateNoteRelatedQueries(queryClient);
    },
    onError: (_error) => {
      notifyError('Could not update the note.');
    },
  });

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (isDirty) {
      setIsDiscardConfirmationOpen(true);
      return;
    }
    setIsEditing(false);
    resetFields();
  };

  const handleConfirmDiscard = () => {
    setIsDiscardConfirmationOpen(false);
    setIsEditing(false);
    resetFields();
  };

  const handleCancelDiscard = () => {
    setIsDiscardConfirmationOpen(false);
  };

  const handleSave = () => {
    if (!editTitle.trim()) {
      notifyError('Enter the note title.');
      return;
    }
    saveMutation.mutate();
  };

  const handleProjectChange = (newProjectSlug: string) => {
    setEditProjectSlug(newProjectSlug);
    setEditFolderId('');
  };

  return {
    isEditing,
    isDirty,
    editTitle,
    setEditTitle,
    editRawText,
    setEditRawText,
    editProjectSlug,
    setEditProjectSlug: handleProjectChange,
    editFolderId,
    setEditFolderId,
    folders,
    isLoadingFolders: foldersQuery.isLoading,
    editTags,
    setEditTags,
    editCategoryIds,
    setEditCategoryIds,
    editReminderAt,
    setEditReminderAt,
    editAttachments,
    setEditAttachments,
    categoriesQuery,
    isDiscardConfirmationOpen,
    handleEdit,
    handleCancel,
    handleConfirmDiscard,
    handleCancelDiscard,
    handleSave,
    isSaving: saveMutation.isPending,
  };
}
