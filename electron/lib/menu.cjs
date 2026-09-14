const { app, Menu, shell, dialog } = require('electron');

/**
 * Builds JARVIS's native menu bar. Renderer-facing actions (new chat, open
 * settings, etc.) are dispatched by sending an IPC-free approach: we just
 * call webContents.send and the preload bridge listens for it, OR — since
 * this app intentionally exposes no privileged IPC surface — we drive the
 * same effect by injecting a click on the existing in-page buttons via
 * executeJavaScript. This keeps the renderer's security model untouched
 * while still giving the menu real functionality.
 */
function dispatchToRenderer(win, elementId) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript(
    `document.getElementById(${JSON.stringify(elementId)})?.click();`,
    true
  ).catch(() => {});
}

function buildMenu({ getMainWindow, appName, onCheckForUpdates }) {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [
          {
            label: appName,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Check for Updates…',
                click: () => onCheckForUpdates?.(true)
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Protocol',
          accelerator: 'CmdOrCtrl+N',
          click: () => dispatchToRenderer(getMainWindow(), 'btn-new-chat')
        },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => dispatchToRenderer(getMainWindow(), 'btn-toggle-sidebar')
        },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => dispatchToRenderer(getMainWindow(), 'btn-open-settings')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'JARVIS',
      submenu: [
        {
          label: 'Voice Input',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => dispatchToRenderer(getMainWindow(), 'btn-voice-input')
        },
        {
          label: 'Summarize Conversation',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => dispatchToRenderer(getMainWindow(), 'btn-quick-summarize')
        },
        {
          label: 'Code Explainer',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => dispatchToRenderer(getMainWindow(), 'btn-quick-code-explainer')
        },
        {
          label: 'Attach Webpage Context',
          click: () => dispatchToRenderer(getMainWindow(), 'btn-open-context')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://github.com/your-repo/jarvis-web/issues')
        },
        {
          label: 'About JARVIS',
          click: () => {
            dialog.showMessageBox(getMainWindow(), {
              type: 'info',
              title: `About ${appName}`,
              message: appName,
              detail: `Version ${app.getVersion()}\nFuturistic personal AI assistant command center powered by OmniRoute.`
            });
          }
        }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
