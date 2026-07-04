import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteCurrentUserAvatar, fetchConnectionToken, fetchCurrentUser, uploadCurrentUserAvatar } from '../../shared/api/client';
import { fetchSubscriptionStatus } from '../../shared/api/billing';
import { getErrorMessage } from '../../shared/api/error-message';
import type { Workspace } from '../../shared/api/models/workspace';
import { InlineMessage, PageHead, Panel } from '../../shared/ui/primitives';
import { UserAvatar } from '../../shared/ui/user-avatar';
import { QuotaUsageWidget } from '../../features/quota/QuotaUsageWidget';

type ProfilePageProps = {
  workspace: Workspace;
};

export function ProfilePage({ workspace }: ProfilePageProps) {
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
  });
  const quotaStatusQuery = useQuery({
    queryKey: ['billing', 'status'],
    queryFn: fetchSubscriptionStatus,
    staleTime: 60_000,
  });
  const user = currentUserQuery.data?.user;
  const quotaStatus = quotaStatusQuery.data;
  const syncCurrentUser = (data: Awaited<ReturnType<typeof fetchCurrentUser>>) => {
    queryClient.setQueryData(['auth', 'me'], data);
    void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
  };
  const uploadAvatarMutation = useMutation({
    mutationFn: uploadCurrentUserAvatar,
    onSuccess: syncCurrentUser,
  });
  const deleteAvatarMutation = useMutation({
    mutationFn: deleteCurrentUserAvatar,
    onSuccess: syncCurrentUser,
  });
  const avatarBusy = uploadAvatarMutation.isPending || deleteAvatarMutation.isPending;

  const [connectionToken, setConnectionToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);

  const handleRevealToken = async () => {
    setIsRevealing(true);
    setRevealError(null);
    try {
      const res = await fetchConnectionToken();
      setConnectionToken(res.connectionToken);
    } catch (err) {
      setRevealError('Failed to retrieve connection token. Please try again.');
    } finally {
      setIsRevealing(false);
    }
  };

  const handleCopy = () => {
    if (!connectionToken) return;
    void navigator.clipboard.writeText(connectionToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <PageHead title="Profile" subtitle="" />
      <Panel className="profile-panel">
        {currentUserQuery.isLoading ? (
          <div className="profile-state" role="status">Loading profile...</div>
        ) : null}

        {currentUserQuery.isError ? (
          <InlineMessage tone="error">Could not load your profile details.</InlineMessage>
        ) : null}

        {user ? (
          <div className="profile-card">
            <div className="profile-avatar-section">
              <UserAvatar
                avatarUrl={user.avatarUrl}
                className="profile-avatar"
                displayName={user.displayName}
                email={user.email}
              />
              <div className="profile-avatar-actions">
                <label className={`icon-button profile-avatar-upload ${avatarBusy ? 'disabled' : ''}`}>
                  Change photo
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Change photo"
                    disabled={avatarBusy}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';
                      if (file) uploadAvatarMutation.mutate(file);
                    }}
                    type="file"
                  />
                </label>
                {user.avatarUrl ? (
                  <button
                    className="filter-chip"
                    disabled={avatarBusy}
                    onClick={() => deleteAvatarMutation.mutate()}
                    type="button"
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
              {avatarBusy ? <div className="profile-state" role="status">Updating photo...</div> : null}
              {uploadAvatarMutation.isError ? (
                <InlineMessage tone="error">
                  {getErrorMessage(uploadAvatarMutation.error, 'Could not update your profile photo.')}
                </InlineMessage>
              ) : null}
              {deleteAvatarMutation.isError ? (
                <InlineMessage tone="error">
                  {getErrorMessage(deleteAvatarMutation.error, 'Could not remove your profile photo.')}
                </InlineMessage>
              ) : null}
            </div>
            <dl className="profile-details" aria-label="Profile details">
              <div className="profile-detail-row">
                <dt>Name</dt>
                <dd>{user.displayName}</dd>
              </div>
              <div className="profile-detail-row">
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div className="profile-detail-row">
                <dt>Role</dt>
                <dd>{user.role}</dd>
              </div>
              <div className="profile-detail-row">
                <dt>Current workspace</dt>
                <dd>
                  <span>{workspace.displayName}</span>
                  <small>{workspace.workspaceSlug}</small>
                </dd>
              </div>
            </dl>

            <div className="profile-connection-section">
              <div className="profile-connection-header">
                <h3 className="profile-connection-title">IDE & CLI Connection</h3>
                <p className="profile-connection-desc">
                  Generate a unified connection token to authenticate your VS Code extension, CLI, or MCP server. This token contains refresh capability and will keep you logged in.
                </p>
              </div>

              {revealError && <InlineMessage tone="error">{revealError}</InlineMessage>}

              {connectionToken ? (
                <div className="profile-connection-box">
                  <input
                    readOnly
                    type="password"
                    value={connectionToken}
                    className="profile-connection-input"
                    aria-label="Connection Token"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="profile-connection-btn"
                  >
                    {copied ? 'Copied!' : 'Copy Token'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isRevealing}
                  onClick={handleRevealToken}
                  className="profile-connection-btn"
                  style={{ marginTop: '8px' }}
                >
                  {isRevealing ? 'Generating...' : 'Reveal Connection Token'}
                </button>
              )}
            </div>

            {quotaStatus && (
              <div style={{ marginTop: '24px', padding: '20px', background: 'var(--surface-2)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <QuotaUsageWidget status={quotaStatus} />
              </div>
            )}
          </div>
        ) : null}
      </Panel>
    </>
  );
}
