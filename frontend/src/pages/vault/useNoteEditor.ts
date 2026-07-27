import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { updateNote, fetchWorkspaceCategories } from '../../shared/api/client';
import { invalidateNoteRelatedQueries } from '../../shared/api/note-query';
import type { NoteDetail } from '../../shared/api/models/note';
import { notifySuccess, notifyError } from '../../shared/ui/notifications';
import { useGlobalLoading } from '../../app/global-loading';

export function useNoteEditor(note: NoteDetail | null, workspaceSlug: string) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editRawText, setEditRawText] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editCategoryIds, setEditCategoryIds] = useState<string[]>([]);
  
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();

  const categoriesQuery = useQuery({
    queryKey: ['workspace-categories', workspaceSlug],
    queryFn: () => fetchWorkspaceCategories(workspaceSlug),
    enabled: Boolean(workspaceSlug) && isEditing,
  });


  // Initialize edit values when entering edit mode
  useEffect(() => {
    if (isEditing && note) {
      setEditTitle(note.title || '');
      setEditRawText(note.editor?.rawText || '');
      setEditTags(note.tags || []);
      setEditCategoryIds(note.categories?.map((c) => c.id) || []);
    }
  }, [isEditing, note]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!note) return;
      return globalLoading.trackPromise(
        updateNote(note.id, {
          title: editTitle,
          rawText: editRawText,
          tags: editTags,
          categoryIds: editCategoryIds,
        })
      );
    },
    onSuccess: async () => {
      notifySuccess('Note updated successfully');
      setIsEditing(false);
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
    setIsEditing(false);
    // Reset to original values
    if (note) {
      setEditTitle(note.title || '');
      setEditRawText(note.editor?.rawText || '');
      setEditTags(note.tags || []);
      setEditCategoryIds(note.categories?.map((c) => c.id) || []);
    }
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  return {
    isEditing,
    editTitle,
    setEditTitle,
    editRawText,
    setEditRawText,
    editTags,
    setEditTags,
    editCategoryIds,
    setEditCategoryIds,
    categoriesQuery,
    handleEdit,
    handleCancel,
    handleSave,
    isSaving: saveMutation.isPending,
  };
}
