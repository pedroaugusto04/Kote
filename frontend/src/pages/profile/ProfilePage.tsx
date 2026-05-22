import { useQuery } from '@tanstack/react-query';

import { fetchCurrentUser } from '../../shared/api/client';
import type { Workspace } from '../../shared/api/models/workspace';
import { InlineMessage, PageHead, Panel } from '../../shared/ui/primitives';

type ProfilePageProps = {
  workspace: Workspace;
};

export function ProfilePage({ workspace }: ProfilePageProps) {
  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
  });
  const user = currentUserQuery.data?.user;

  return (
    <>
      <PageHead title="Profile" subtitle="Read-only details for the authenticated user." />
      <Panel className="profile-panel">
        {currentUserQuery.isLoading ? (
          <div className="profile-state" role="status">Loading profile...</div>
        ) : null}

        {currentUserQuery.isError ? (
          <InlineMessage tone="error">Could not load your profile details.</InlineMessage>
        ) : null}

        {user ? (
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
        ) : null}
      </Panel>
    </>
  );
}
