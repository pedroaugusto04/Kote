import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';

import { createProjectFolder, updateProjectFolder } from '../../../shared/api/client';
import type { ProjectFolder } from '../../../shared/api/models/project-folder';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../../shared/forms/errors';
import { FormActions, FormField } from '../../../shared/forms/fields';
import { ConfirmationModal } from '../../../shared/ui/confirmation-modal';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../../shared/ui/use-modal-close-guard';
import { useGlobalLoading } from '../../../app/global-loading';
import { collectFolderAndDescendantIds } from '../projects.helpers';
import { folderFormSchema, type FolderFormValues } from '../projects.forms';
import type { FlatProjectFolder } from '../projects.types';

type ProjectFolderModalProps = {
  folders: FlatProjectFolder[];
  mode: 'create' | 'edit';
  folder?: ProjectFolder;
  initialParentFolderId?: string;
  onClose: () => void;
  onSaved: (folderId: string, mode: 'create' | 'edit') => void | Promise<void>;
  projectSlug: string;
};

export function ProjectFolderModal({
  folders,
  mode,
  folder,
  initialParentFolderId,
  onClose,
  onSaved,
  projectSlug,
}: ProjectFolderModalProps) {
  const globalLoading = useGlobalLoading();
  const excludedIds = folder ? new Set(collectFolderAndDescendantIds(folder)) : new Set<string>();
  const parentOptions = folders.filter((item) => !excludedIds.has(item.id));
  const formRef = useRef<HTMLFormElement>(null);
  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    setError,
  } = useForm<FolderFormValues>({
    resolver: zodResolver(folderFormSchema),
    shouldFocusError: false,
    defaultValues: {
      displayName: folder?.displayName || '',
      parentFolderId: folder?.parentFolderId || initialParentFolderId || '',
    },
  });
  const closeGuard = useModalCloseGuard({ isDirty, onClose });
  const mutation = useMutation({
    mutationFn: (values: FolderFormValues) => {
      const payload = {
        displayName: values.displayName,
        parentFolderId: values.parentFolderId || undefined,
      };
      return globalLoading.trackPromise(mode === 'create'
        ? createProjectFolder(projectSlug, payload)
        : updateProjectFolder(projectSlug, folder?.id || '', payload));
    },
    onSuccess: async (result) => {
      closeGuard.resetCloseGuard();
      await onSaved(result.folder.id, mode);
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<FolderFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, mode === 'create' ? 'Nao foi possivel criar a pasta.' : 'Nao foi possivel atualizar a pasta.');
    },
  });

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section aria-labelledby="folder-modal-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2 id="folder-modal-title">{mode === 'create' ? 'Nova pasta' : 'Editar pasta'}</h2>
              <p>{projectSlug}</p>
            </div>
            <button aria-label="Fechar detalhes" className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
          </div>
          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onSubmit={handleSubmit(
              (values: FolderFormValues) => mutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            <FormField name="displayName" label="Nome" error={errors.displayName?.message} required>
              {(fieldProps) => <input {...fieldProps} {...register('displayName')} />}
            </FormField>
            <FormField name="parentFolderId" label="Pasta pai" error={errors.parentFolderId?.message} optional>
              {(fieldProps) => (
                <select {...fieldProps} {...register('parentFolderId')}>
                  <option value="">Raiz</option>
                  {parentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {'  '.repeat(option.depth)}{option.displayName}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormActions disabled={mutation.isPending} onCancel={closeGuard.requestClose} submitLabel={mode === 'create' ? 'Criar pasta' : 'Salvar pasta'} />
          </form>
        </section>
      </div>
      {closeGuard.isDiscardConfirmationOpen ? (
        <ConfirmationModal
          cancelLabel={discardChangesConfirmationCopy.cancelLabel}
          confirmLabel={discardChangesConfirmationCopy.confirmLabel}
          description={discardChangesConfirmationCopy.description}
          onCancel={closeGuard.cancelClose}
          onConfirm={closeGuard.confirmClose}
          title={discardChangesConfirmationCopy.title}
          tone="default"
        />
      ) : null}
    </>
  );
}
