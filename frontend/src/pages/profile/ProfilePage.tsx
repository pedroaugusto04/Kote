import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteCurrentUserAvatar, fetchCurrentUser, uploadCurrentUserAvatar } from '../../shared/api/client';
import type { Workspace } from '../../shared/api/models/workspace';
import { InlineMessage, PageHead, Panel } from '../../shared/ui/primitives';
import { UserAvatar } from '../../shared/ui/user-avatar';

type ProfilePageProps = {
  workspace: Workspace;
};

export function ProfilePage({ workspace }: ProfilePageProps) {
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
  });
  const user = currentUserQuery.data?.user;
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
              {uploadAvatarMutation.isError ? <InlineMessage tone="error">Could not update your profile photo.</InlineMessage> : null}
              {deleteAvatarMutation.isError ? <InlineMessage tone="error">Could not remove your profile photo.</InlineMessage> : null}
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
          </div>
        ) : null}
      </Panel>
    </>
  );
}
