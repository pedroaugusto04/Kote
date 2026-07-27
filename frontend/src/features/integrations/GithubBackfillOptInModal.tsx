import { useMutation } from '@tanstack/react-query';

import { startGithubBackfill } from '../../shared/api/client';
import { INTEGRATION_MESSAGES } from './integrations.constants';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { notifySuccess } from '../../shared/ui/notifications';
import { useGlobalLoading } from '../../app/global-loading';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';

interface GithubBackfillOptInModalProps {
  workspaceSlug: string;
  repositories: string[];
  backfillLimit: number;
  onClose: () => void;
  onDeclined: () => void;
  onStarted: (jobId: string) => void;
}

export function GithubBackfillOptInModal({
  workspaceSlug,
  repositories,
  backfillLimit,
  onClose,
  onDeclined,
  onStarted,
}: GithubBackfillOptInModalProps) {
  const globalLoading = useGlobalLoading();
  const startMutation = useMutation({
    mutationFn: () => globalLoading.trackPromise(startGithubBackfill(workspaceSlug, repositories)),
    onSuccess: (result) => {
      notifySuccess(INTEGRATION_MESSAGES.GITHUB_BACKFILL.STARTED);
      onStarted(result.jobId);
      onClose();
    },
    onError: (error) => notifyGeneralFormError(error, INTEGRATION_MESSAGES.GITHUB_BACKFILL.ERROR),
  });

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="github-backfill-title"
        aria-modal="true"
        className="modal-panel integration-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <div className="card-kicker">GitHub</div>
            <h2 id="github-backfill-title">{INTEGRATION_MESSAGES.GITHUB_BACKFILL.TITLE}</h2>
          </div>
          <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={onClose}>x</button>
        </div>
        <p className="meta" style={{ marginBottom: '16px' }}>
          {INTEGRATION_MESSAGES.GITHUB_BACKFILL.DESCRIPTION.replace('{limit}', String(backfillLimit))}
        </p>
        <p className="meta">{repositories.join(', ')}</p>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button className="filter-chip" type="button" onClick={() => { onDeclined(); onClose(); }}>
            {INTEGRATION_MESSAGES.GITHUB_BACKFILL.SKIP}
          </button>
          <button
            className="icon-button"
            disabled={startMutation.isPending}
            type="button"
            onClick={() => startMutation.mutate()}
          >
            {INTEGRATION_MESSAGES.GITHUB_BACKFILL.IMPORT.replace('{limit}', String(backfillLimit))}
          </button>
        </div>
      </section>
    </div>
  );
}
