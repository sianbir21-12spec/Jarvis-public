const { app, dialog } = require('electron');

/**
 * Auto-update is scaffolded but inert by default: electron-updater needs a
 * real publish target (GitHub Releases, S3, a generic static feed, etc.)
 * configured in package.json's "build.publish" before it can do anything.
 * Wiring it now means enabling updates later is a one-line config change,
 * not a new feature to build.
 */
function setupAutoUpdate({ enabled, getMainWindow }) {
  if (!enabled) {
    return { checkForUpdates: () => {} };
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    console.warn('[JARVIS Desktop] electron-updater is not installed; skipping update checks.');
    return { checkForUpdates: () => {} };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    const win = getMainWindow();
    dialog
      .showMessageBox(win, {
        type: 'info',
        buttons: ['Restart Now', 'Later'],
        title: 'JARVIS Update Ready',
        message: 'A new version of JARVIS has been downloaded.',
        detail: 'Restart to apply the update.'
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (err) => {
    console.error('[JARVIS Desktop] Auto-update error:', err);
  });

  app.whenReady().then(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  });

  return {
    checkForUpdates: (interactive = false) => {
      autoUpdater.checkForUpdates().catch((err) => {
        if (interactive) {
          dialog.showErrorBox('Update Check Failed', err.message || String(err));
        }
      });
    }
  };
}

module.exports = { setupAutoUpdate };
