import { useEffect, useState } from 'react';

import { getUserInitials } from '../../entities/user';

type UserAvatarProps = {
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string | null;
  className?: string;
};

export function UserAvatar({ avatarUrl, className = '', displayName, email }: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getUserInitials({ displayName, email });

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !imageFailed) {
    return (
      <span className={`user-avatar ${className}`.trim()} aria-label={`${displayName || email || 'User'} avatar`}>
        <img alt="" draggable={false} src={avatarUrl} onError={() => setImageFailed(true)} />
      </span>
    );
  }

  return (
    <span className={`user-avatar user-avatar-fallback ${className}`.trim()} aria-label={`${displayName || email || 'User'} initials`}>
      {initials}
    </span>
  );
}
