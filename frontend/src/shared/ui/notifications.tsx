import { Toaster, toast } from 'sonner';

import { useTheme } from '../../app/providers/theme';

const toastClassNames = {
  toast: 'kb-toast',
  title: 'kb-toast-title',
  description: 'kb-toast-description',
  closeButton: 'kb-toast-close',
  success: 'kb-toast-success',
  error: 'kb-toast-error',
  info: 'kb-toast-info',
  warning: 'kb-toast-warning',
};

export function NotificationsProvider() {
  const { effectiveTheme } = useTheme();

  return (
    <Toaster
      closeButton
      containerAriaLabel="Notifications"
      duration={3200}
      offset={16}
      position="top-right"
      theme={effectiveTheme}
      toastOptions={{ classNames: toastClassNames }}
      visibleToasts={4}
    />
  );
}

export function notifySuccess(message: string) {
  toast.success(message);
}

export function notifyError(message: string) {
  toast.error(message);
}

export function notifyInfo(message: string) {
  toast.info(message);
}

export function notifyWarning(message: string) {
  toast.warning(message);
}
