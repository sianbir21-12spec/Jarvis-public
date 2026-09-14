// Computer-use control layer.
//
// Screenshots go through Electron's built-in `desktopCapturer` (no extra
// native dependency). Mouse/keyboard control goes through `@nut-tree-fork/nut-js`,
// a maintained native automation library — it must be installed separately
// (`npm install @nut-tree-fork/nut-js`) since it ships prebuilt native
// bindings per-platform that can't be vendored here.
//
// Everything in this module is inert until `setEnabled(true)` has been
// called, which main.cjs only does in response to an explicit, user-confirmed
// IPC request from the renderer (see the Settings panel confirmation flow).

const { desktopCapturer, screen } = require('electron');

let enabled = false;
let nut = null; // lazily required so the app doesn't crash on start if the optional native dep isn't installed yet

function loadNut() {
  if (nut) return nut;
  try {
    // eslint-disable-next-line global-require
    nut = require('@nut-tree-fork/nut-js');
    // Keep automation speed sane — fast enough to be useful, slow enough
    // not to fling the mouse across the screen in one unreadable jump.
    nut.mouse.config.mouseSpeed = 1500;
  } catch (err) {
    throw new Error(
      'Computer control requires the "@nut-tree-fork/nut-js" package, which is not installed. ' +
        'Run "npm install @nut-tree-fork/nut-js" and restart JARVIS. (' +
        (err && err.message ? err.message : String(err)) +
        ')'
    );
  }
  return nut;
}

function setEnabled(next) {
  enabled = !!next;
  return enabled;
}

function isEnabled() {
  return enabled;
}

function assertEnabled() {
  if (!enabled) {
    throw new Error('Computer control is disabled. Enable it in Settings first.');
  }
}

function getScreenSize() {
  const display = screen.getPrimaryDisplay();
  return {
    width: display.size.width,
    height: display.size.height,
    scaleFactor: display.scaleFactor || 1
  };
}

// Returns a downscaled screenshot (max 1280px wide) as a base64 PNG, plus
// the scale factor needed to convert coordinates given against that image
// back into real, physical screen coordinates.
async function screenshot(maxWidth = 1280) {
  assertEnabled();
  const display = screen.getPrimaryDisplay();
  const physicalWidth = Math.round(display.size.width * (display.scaleFactor || 1));
  const physicalHeight = Math.round(display.size.height * (display.scaleFactor || 1));

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: physicalWidth, height: physicalHeight }
  });

  if (!sources.length) {
    throw new Error('No screen sources available to capture.');
  }

  // Prefer the primary display's source when there are multiple monitors.
  const source = sources[0];
  const image = source.thumbnail;
  const nativeSize = image.getSize();

  let outputImage = image;
  let scale = 1;
  if (nativeSize.width > maxWidth) {
    scale = maxWidth / nativeSize.width;
    outputImage = image.resize({ width: maxWidth, height: Math.round(nativeSize.height * scale) });
  }

  const outSize = outputImage.getSize();

  return {
    base64: outputImage.toPNG().toString('base64'),
    imageWidth: outSize.width,
    imageHeight: outSize.height,
    // Multiply model-given coordinates (in image space) by this to get
    // real screen coordinates (in logical/display-point space, matching
    // what mouse.setPosition expects).
    toScreenScaleX: display.size.width / outSize.width,
    toScreenScaleY: display.size.height / outSize.height
  };
}

async function moveMouse(x, y) {
  assertEnabled();
  const { mouse, straightTo, Point } = loadNut();
  await mouse.move(straightTo(new Point(x, y)));
}

async function click(x, y, button = 'left', doubleClick = false) {
  assertEnabled();
  const { mouse, straightTo, Point, Button } = loadNut();
  await mouse.move(straightTo(new Point(x, y)));
  const btn = button === 'right' ? Button.RIGHT : button === 'middle' ? Button.MIDDLE : Button.LEFT;
  if (doubleClick) {
    await mouse.doubleClick(btn);
  } else {
    await mouse.click(btn);
  }
}

async function scroll(deltaX = 0, deltaY = 0) {
  assertEnabled();
  const { mouse } = loadNut();
  if (deltaY) await mouse.scrollDown(deltaY > 0 ? deltaY : 0);
  if (deltaY < 0) await mouse.scrollUp(-deltaY);
  if (deltaX > 0) await mouse.scrollRight(deltaX);
  if (deltaX < 0) await mouse.scrollLeft(-deltaX);
}

async function typeText(text) {
  assertEnabled();
  const { keyboard } = loadNut();
  await keyboard.type(text);
}

// combo like "control+c", "alt+tab", "enter", "escape"
async function pressKey(combo) {
  assertEnabled();
  const { keyboard, Key } = loadNut();
  const parts = String(combo)
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const keyMap = {
    control: Key.LeftControl,
    ctrl: Key.LeftControl,
    cmd: Key.LeftSuper,
    command: Key.LeftSuper,
    super: Key.LeftSuper,
    alt: Key.LeftAlt,
    option: Key.LeftAlt,
    shift: Key.LeftShift,
    enter: Key.Enter,
    return: Key.Enter,
    escape: Key.Escape,
    esc: Key.Escape,
    tab: Key.Tab,
    space: Key.Space,
    backspace: Key.Backspace,
    delete: Key.Delete,
    up: Key.Up,
    down: Key.Down,
    left: Key.Left,
    right: Key.Right,
    home: Key.Home,
    end: Key.End
  };

  const resolved = parts.map((p) => {
    if (keyMap[p]) return keyMap[p];
    if (p.length === 1 && Key[p.toUpperCase()]) return Key[p.toUpperCase()];
    if (Key[p.charAt(0).toUpperCase() + p.slice(1)]) return Key[p.charAt(0).toUpperCase() + p.slice(1)];
    throw new Error(`Unrecognized key: "${p}"`);
  });

  if (resolved.length === 1) {
    await keyboard.pressKey(resolved[0]);
    await keyboard.releaseKey(resolved[0]);
    return;
  }

  // Chord: press modifiers down, tap the last key, release in reverse order.
  const modifiers = resolved.slice(0, -1);
  const finalKey = resolved[resolved.length - 1];
  for (const mod of modifiers) await keyboard.pressKey(mod);
  await keyboard.pressKey(finalKey);
  await keyboard.releaseKey(finalKey);
  for (const mod of [...modifiers].reverse()) await keyboard.releaseKey(mod);
}

module.exports = {
  setEnabled,
  isEnabled,
  getScreenSize,
  screenshot,
  moveMouse,
  click,
  scroll,
  typeText,
  pressKey
};
