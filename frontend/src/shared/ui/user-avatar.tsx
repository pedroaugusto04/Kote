import { useState } from 'react';

import { getUserInitials } from '../utils/user';

type UserAvatarProps = {
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string | null;
  className?: string;
};

export function UserAvatar({ avatarUrl, className = '', displayName, email }: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = getUserInitials({ displayName, email });
  const imageFailed = Boolean(avatarUrl && failedUrl === avatarUrl);

  if (avatarUrl && !imageFailed) {
    return (
      <span className={`user-avatar ${className}`.trim()} aria-label={`${displayName || email || 'User'} avatar`}>
        <img alt="" draggable={false} src={avatarUrl} onError={() => setFailedUrl(avatarUrl)} />
      </span>
    );
  }

  return (
    <span className={`user-avatar user-avatar-fallback ${className}`.trim()} aria-label={`${displayName || email || 'User'} initials`}>
      {initials}
    </span>
  );
}
