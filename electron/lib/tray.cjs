const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function iconPathFor(platform) {
  const base = path.join(__dirname, '..', 'icons');
  if (platform === 'darwin') {
    return path.join(base, 'tray-iconTemplate.png');
  }
  return path.join(base, 'tray-icon.png');
}

function createTray({ getMainWindow, showWindow, quitApp }) {
  const image = nativeImage.createFromPath(iconPathFor(process.platform));
  if (process.platform === 'darwin') {
    image.setTemplateImage(true);
  }

  tray = new Tray(image);
  tray.setToolTip('JARVIS');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show JARVIS',
      click: () => showWindow()
    },
    {
      label: 'New Protocol',
      click: () => {
        const win = getMainWindow();
        showWindow();
        win?.webContents.executeJavaScript(
          `document.getElementById('btn-new-chat')?.click();`,
          true
        ).catch(() => {});
      }
    },
    { type: 'separator' },
    {
      label: 'Quit JARVIS',
      click: () => quitApp()
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    showWindow();
  });

  return tray;
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
  tray = null;
}

module.exports = { createTray, destroyTray };
