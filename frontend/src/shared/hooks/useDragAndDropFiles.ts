import { useState } from 'react';
import { fileToBase64 } from '../ui/attachment-input';

export interface Attachment {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
}

export interface PendingNote {
  title: string;
  attachments: Attachment[];
}

export interface UseDragAndDropFilesOptions {
  onCreateNote: (title: string, attachments: Attachment[]) => void;
  projectSlug?: string;
}

export function useDragAndDropFiles({
  onCreateNote,
  projectSlug = 'inbox',
}: UseDragAndDropFilesOptions) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [pendingNotesQueue, setPendingNotesQueue] = useState<PendingNote[]>([]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const pendingNotes: PendingNote[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await fileToBase64(file);
        pendingNotes.push({
          title: file.name,
          attachments: [
            {
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              sizeBytes: file.size,
              dataBase64: base64,
            },
          ],
        });
      } catch (error) {
        console.error('Failed to parse dropped file:', error);
      }
    }

    if (pendingNotes.length === 0) return;

    const firstNote = pendingNotes[0];
    const remainingNotes = pendingNotes.slice(1);
    setPendingNotesQueue(remainingNotes);

    onCreateNote(firstNote.title, firstNote.attachments);
  };

  const processNextNote = () => {
    if (pendingNotesQueue.length > 0) {
      const nextNote = pendingNotesQueue[0];
      setPendingNotesQueue(pendingNotesQueue.slice(1));
      onCreateNote(nextNote.title, nextNote.attachments);
    }
  };

  return {
    isDraggingOver,
    pendingNotesQueue,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    processNextNote,
  };
}
