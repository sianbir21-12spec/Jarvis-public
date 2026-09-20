// Push notification service for the browser build.
//
// The Electron desktop app already gets native OS notifications for free
// via electron/lib/notifications.cjs + electron/main.cjs, which watches the
// DOM for the stop-generation button and fires a native Notification when a
// response finishes while the window is unfocused. This service exists for
// everyone running JARVIS in a plain browser tab (no Electron), where that
// mechanism doesn't apply -- so it detects Electron and no-ops there rather
// than double-firing.

function isElectronRenderer(): boolean {
  return typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');
}

const PERMISSION_ASKED_KEY = 'jarvis_notify_permission_asked';

export const notificationService = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window && !isElectronRenderer();
  },

  getPermission(): NotificationPermission | 'unsupported' {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },

  async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!this.isSupported()) return 'unsupported';
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Notification.permission;
    }
    try {
      localStorage.setItem(PERMISSION_ASKED_KEY, '1');
    } catch {
      /* ignore */
    }
    return Notification.requestPermission();
  },

  hasAskedBefore(): boolean {
    try {
      return localStorage.getItem(PERMISSION_ASKED_KEY) === '1';
    } catch {
      return false;
    }
  },

  // Only fires when permission is granted and the tab isn't the one the
  // user is actively looking at -- otherwise they're already watching the
  // response arrive and a notification would just be noise.
  notify(title: string, body: string, opts?: { force?: boolean; tag?: string }): void {
    if (!this.isSupported()) return;
    if (Notification.permission !== 'granted') return;
    if (!opts?.force && document.visibilityState === 'visible' && document.hasFocus()) return;

    try {
      const n = new Notification(title, {
        body,
        tag: opts?.tag || 'jarvis-response',
        silent: false
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (e) {
      console.error('Notification failed', e);
    }
  }
};
