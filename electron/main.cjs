const { app, BrowserWindow, shell, globalShortcut, Menu, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const { createWindowStateKeeper } = require('./lib/windowState.cjs');
const { buildMenu } = require('./lib/menu.cjs');
const { createTray, destroyTray } = require('./lib/tray.cjs');
const { setupAutoUpdate } = require('./lib/updater.cjs');
const { setupResponseNotifications } = require('./lib/notifications.cjs');

const APP_NAME = 'JARVIS';
const PORT = Number(process.env.PORT) || 3000;
const IS_DEV = process.env.NODE_ENV === 'development';
const ICON_PATH = path.join(__dirname, 'icons', 'app-icon.png');

app.setName(APP_NAME);

// On macOS, the packaged .icns is only used once electron-builder has run.
// During `npm run electron:dev` the app launches via the plain `electron`
// binary, so without this the dock would show the generic Electron icon.
if (process.platform === 'darwin' && app.dock) {
  app.dock.setIcon(ICON_PATH);
}

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let isQuitting = false;
let updater = { checkForUpdates: () => {} };

// --- Single instance lock -------------------------------------------------
// A "proper app" doesn't silently spawn a second window (and a second
// backend server fighting for the same port) if the user double-clicks the
// dock icon or launches it again from the OS.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

// --- Backend server lifecycle ----------------------------------------------

function waitForServer(timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get({ host: 'localhost', port: PORT, path: '/api/health', timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Timed out waiting for JARVIS backend server to start.'));
          return;
        }
        setTimeout(check, 300);
      });
      req.on('timeout', () => req.destroy());
    };
    check();
  });
}

function startServerProcess() {
  const serverPath = path.join(__dirname, '..', 'dist', 'server.cjs');
  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: 'inherit'
  });
  serverProcess.on('error', (err) => {
    console.error('[JARVIS Desktop] Failed to launch backend server:', err);
  });
  serverProcess.on('exit', (code) => {
    if (!isQuitting && code !== 0) {
      console.error(`[JARVIS Desktop] Backend server exited unexpectedly (code ${code}).`);
    }
  });
}

function stopServerProcess() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
}

// --- Windows ---------------------------------------------------------------

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 360,
    frame: false,
    resizable: false,
    movable: true,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    center: true,
    show: false,
    skipTaskbar: true,
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow?.show());
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createMainWindow() {
  const windowStateKeeper = createWindowStateKeeper({
    userDataPath: app.getPath('userData'),
    defaultWidth: 1440,
    defaultHeight: 900
  });
  const { state } = windowStateKeeper;

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#040711',
    title: APP_NAME,
    icon: ICON_PATH,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  windowStateKeeper.track(mainWindow);

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links (e.g. from markdown responses) in the OS browser
  // instead of navigating the app window away from JARVIS.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  setupResponseNotifications(mainWindow);

  // Keep the app running in the tray on close, like a "proper" background
  // assistant, instead of fully quitting (macOS convention; mirrored on
  // Windows/Linux since JARVIS is meant to be quick-summonable via the
  // global shortcut and tray icon).
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// --- App lifecycle -----------------------------------------------------

if (gotLock) {
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media' || permission === 'audioCapture' || permission === 'notifications' || permission === 'clipboard-sanitized-write');
    });
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
      return permission === 'media' || permission === 'audioCapture' || permission === 'notifications' || permission === 'clipboard-sanitized-write';
    });

    createSplashWindow();

    if (!IS_DEV) {
      startServerProcess();
    }

    try {
      await waitForServer();
    } catch (err) {
      console.error('[JARVIS Desktop]', err.message);
    }

    createMainWindow();

    updater = setupAutoUpdate({
      enabled: false, // flip to true once build.publish is configured in package.json
      getMainWindow: () => mainWindow
    });

    Menu.setApplicationMenu(
      buildMenu({
        getMainWindow: () => mainWindow,
        appName: APP_NAME,
        onCheckForUpdates: (interactive) => updater.checkForUpdates(interactive)
      })
    );

    createTray({
      getMainWindow: () => mainWindow,
      showWindow: showMainWindow,
      quitApp: () => {
        isQuitting = true;
        app.quit();
      }
    });

    // Global shortcut to summon JARVIS from anywhere, Spotlight-style.
    globalShortcut.register('CommandOrControl+Shift+J', () => {
      showMainWindow();
    });

    app.on('activate', () => {
      showMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Intentionally a no-op: JARVIS lives in the tray. Explicit quit happens
    // via the tray menu, the app menu's Quit item, or Cmd/Ctrl+Q.
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    destroyTray();
    stopServerProcess();
  });
}
