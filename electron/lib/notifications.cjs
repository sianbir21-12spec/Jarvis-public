const { Notification } = require('electron');

const MARKER = '__jarvis_response_complete__';

/**
 * The renderer's source isn't modified for this — instead we inject a small
 * observer script once the page loads. It watches the stop-generation
 * button (present while a response streams) and logs a marker to the
 * console when a response finishes. We listen for that marker via the
 * `console-message` event and fire a native OS notification if the window
 * isn't focused, so users get pinged when they've clicked away.
 */
const OBSERVER_SCRIPT = `
(() => {
  if (window.__jarvisNotifyObserverInstalled) return;
  window.__jarvisNotifyObserverInstalled = true;
  let wasStreaming = false;
  const check = () => {
    const streaming = !!document.getElementById('btn-stop-generation');
    if (wasStreaming && !streaming) {
      console.log('${MARKER}');
    }
    wasStreaming = streaming;
  };
  const observer = new MutationObserver(check);
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(check, 1000);
})();
`;

function setupResponseNotifications(win) {
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(OBSERVER_SCRIPT).catch(() => {});
  });

  win.webContents.on('console-message', (event, level, message) => {
    if (typeof message === 'string' && message.includes(MARKER)) {
      if (!win.isFocused() && Notification.isSupported()) {
        new Notification({
          title: 'JARVIS',
          body: 'Directive complete. Response ready for review.',
          silent: false
        })
          .on('click', () => {
            win.show();
            win.focus();
          })
          .show();
      }
    }
  });
}

module.exports = { setupResponseNotifications };
