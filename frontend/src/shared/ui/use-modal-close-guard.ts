import { useCallback, useState, useEffect } from 'react';
import { KEYBOARD_KEYS } from '../constants/keyboard.constants';

export const discardChangesConfirmationCopy = {
  cancelLabel: 'Keep editing',
  confirmLabel: 'Close without saving',
  description: 'You have unsaved changes. Are you sure you want to close this modal and lose the entered data?',
  title: 'Discard changes?',
} as const;

export function useModalCloseGuard({ isDirty, onClose }: { isDirty: boolean; onClose: () => void }) {
  const [isDiscardConfirmationOpen, setIsDiscardConfirmationOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (!isDirty) {
      setIsDiscardConfirmationOpen(false);
      onClose();
      return;
    }
    setIsDiscardConfirmationOpen(true);
  }, [isDirty, onClose]);

  const confirmClose = useCallback(() => {
    setIsDiscardConfirmationOpen(false);
    onClose();
  }, [onClose]);

  const cancelClose = useCallback(() => {
    setIsDiscardConfirmationOpen(false);
  }, []);

  const resetCloseGuard = useCallback(() => {
    setIsDiscardConfirmationOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYBOARD_KEYS.ESCAPE) {
        if (isDiscardConfirmationOpen) {
          event.preventDefault();
          cancelClose();
        } else {
          event.preventDefault();
          requestClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDiscardConfirmationOpen, cancelClose, requestClose]);

  return {
    cancelClose,
    confirmClose,
    isDiscardConfirmationOpen,
    requestClose,
    resetCloseGuard,
  };
}

