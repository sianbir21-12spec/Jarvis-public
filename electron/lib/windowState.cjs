const fs = require('fs');
const path = require('path');
const { screen } = require('electron');

/**
 * Minimal, dependency-free window-state persistence. Saves position/size/
 * maximized state to a JSON file in userData and restores it on next launch,
 * clamping to whatever displays are currently connected so the window can
 * never open off-screen (e.g. after unplugging a monitor).
 */
function createWindowStateKeeper({ userDataPath, file = 'window-state.json', defaultWidth = 1440, defaultHeight = 900 }) {
  const statePath = path.join(userDataPath, file);

  function isVisibleOnAnyDisplay(bounds) {
    const displays = screen.getAllDisplays();
    return displays.some((display) => {
      const area = display.workArea;
      return (
        bounds.x >= area.x &&
        bounds.y >= area.y &&
        bounds.x + bounds.width <= area.x + area.width &&
        bounds.y + bounds.height <= area.y + area.height
      );
    });
  }

  function load() {
    try {
      const raw = fs.readFileSync(statePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.width === 'number' &&
        typeof parsed.height === 'number' &&
        isVisibleOnAnyDisplay(parsed)
      ) {
        return parsed;
      }
    } catch {
      // No saved state yet, or it's invalid/off-screen — fall through to defaults.
    }
    return { width: defaultWidth, height: defaultHeight, isMaximized: false };
  }

  const state = load();

  function track(win) {
    let saveTimeout = null;
    const save = () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (win.isDestroyed()) return;
        const isMaximized = win.isMaximized();
        const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
        try {
          fs.mkdirSync(path.dirname(statePath), { recursive: true });
          fs.writeFileSync(statePath, JSON.stringify({ ...bounds, isMaximized }));
        } catch {
          // Non-fatal: window state just won't persist this session.
        }
      }, 250);
    };

    win.on('resize', save);
    win.on('move', save);
    win.on('close', save);
  }

  return { state, track };
}

module.exports = { createWindowStateKeeper };
