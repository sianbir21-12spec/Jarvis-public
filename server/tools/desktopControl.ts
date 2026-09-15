// server/tools/desktopControl.ts
//
// Native OS control for Windows: mouse, keyboard, screen capture, window
// management, and app launching. Runs inside the plain Node backend process
// (server.ts / dist/server.cjs) -- NOT inside Electron's sandboxed renderer --
// so it has normal OS-level access without needing IPC to the main process.
//
// Requires (added to package.json):
//   @nut-tree-fork/nut-js      - mouse/keyboard/screen automation
//   node-window-manager        - window enumeration/focus/move
//
// Run `npm install` after pulling this in, then on first run Windows
// SmartScreen/Defender may prompt once for the native nut-js binary --
// that's expected for any input-simulation tool.

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// nut-js is CommonJS; import lazily so the rest of the server still boots
// even if the dependency hasn't been installed yet (agent tools will just
// report a clear error instead of crashing the whole app).
let nut: any = null;
async function getNut() {
  if (!nut) {
    nut = await import('@nut-tree-fork/nut-js');
    // mouseSpeed controls how long nut-js spends animating the cursor to
    // its target (it interpolates movement rather than jumping instantly,
    // so this is pure latency on every single click/move). Push it well
    // past "human-fast" since nothing here needs to look natural -- only
    // to actually land where intended. Tune down via env var if some
    // picky app is missing clicks because the move+click happens too fast
    // for it to register the intermediate mouse-over state.
    nut.mouse.config.mouseSpeed = Number(process.env.AGENT_MOUSE_SPEED) || 3000;
    nut.keyboard.config.autoDelayMs = Number(process.env.AGENT_KEY_DELAY_MS) || 5;
  }
  return nut;
}

let windowManager: any = null;
async function getWindowManager() {
  if (!windowManager) {
    const mod = await import('node-window-manager');
    windowManager = mod.windowManager;
  }
  return windowManager;
}

export interface ScreenshotResult {
  base64: string; // raw base64 (no data: prefix)
  width: number;
  height: number;
}

/** Captures the primary screen as a PNG, downscaled so it's cheap to send to a model. */
export async function captureScreen(maxWidth = Number(process.env.AGENT_SCREENSHOT_WIDTH) || 1024): Promise<ScreenshotResult> {
  const { screen } = await getNut();
  const nutImage = await screen.grab();
  const sharp = (await import('sharp')).default;

  const raw = nutImage.data as Buffer;
  const { width, height } = nutImage;

  let pipeline = sharp(raw, {
    raw: { width, height, channels: nutImage.channels || 4 }
  });

  const scale = width > maxWidth ? maxWidth / width : 1;
  const outWidth = Math.round(width * scale);
  const outHeight = Math.round(height * scale);

  if (scale < 1) {
    pipeline = pipeline.resize(outWidth, outHeight);
  }

  const quality = Number(process.env.AGENT_SCREENSHOT_QUALITY) || 60;
  const pngBuffer = await pipeline.jpeg({ quality }).toBuffer();

  return {
    base64: pngBuffer.toString('base64'),
    width: outWidth,
    height: outHeight
  };
}

export async function getScreenSize(): Promise<{ width: number; height: number }> {
  const { screen } = await getNut();
  const width = await screen.width();
  const height = await screen.height();
  return { width, height };
}

export async function moveMouse(x: number, y: number) {
  const { mouse, straightTo, Point } = await getNut();
  await mouse.move(straightTo(new Point(x, y)));
}

type MouseButton = 'left' | 'right' | 'middle';

export async function click(x: number, y: number, button: MouseButton = 'left', double = false) {
  const { mouse, straightTo, Point, Button } = await getNut();
  await mouse.move(straightTo(new Point(x, y)));
  const btn = button === 'right' ? Button.RIGHT : button === 'middle' ? Button.MIDDLE : Button.LEFT;
  if (double) {
    await mouse.doubleClick(btn);
  } else {
    await mouse.click(btn);
  }
}

export async function drag(fromX: number, fromY: number, toX: number, toY: number) {
  const { mouse, straightTo, Point } = await getNut();
  await mouse.move(straightTo(new Point(fromX, fromY)));
  await mouse.pressButton((await getNut()).Button.LEFT);
  await mouse.move(straightTo(new Point(toX, toY)));
  await mouse.releaseButton((await getNut()).Button.LEFT);
}

export async function scroll(deltaX: number, deltaY: number) {
  const { mouse } = await getNut();
  if (deltaY !== 0) await mouse.scrollDown(deltaY > 0 ? deltaY : 0);
  if (deltaY < 0) await mouse.scrollUp(Math.abs(deltaY));
  if (deltaX > 0) await mouse.scrollRight(deltaX);
  if (deltaX < 0) await mouse.scrollLeft(Math.abs(deltaX));
}

export async function typeText(text: string) {
  const { keyboard } = await getNut();
  await keyboard.type(text);
}

const KEY_MAP: Record<string, string> = {
  enter: 'Enter', return: 'Enter', tab: 'Tab', esc: 'Escape', escape: 'Escape',
  backspace: 'Backspace', delete: 'Delete', space: 'Space', up: 'Up', down: 'Down',
  left: 'Left', right: 'Right', home: 'Home', end: 'End', pageup: 'PageUp',
  pagedown: 'PageDown', f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5',
  f6: 'F6', f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
  win: 'LeftSuper', windows: 'LeftSuper', control: 'LeftControl', ctrl: 'LeftControl',
  alt: 'LeftAlt', shift: 'LeftShift'
};

function resolveKey(nutKey: any, name: string) {
  const normalized = name.trim().toLowerCase();
  const mapped = KEY_MAP[normalized];
  const lookupName = mapped || (normalized.length === 1 ? normalized.toUpperCase() : name);
  const key = nutKey[lookupName] ?? nutKey[name] ?? nutKey[normalized.toUpperCase()];
  if (key === undefined) throw new Error(`Unknown key: "${name}"`);
  return key;
}

export async function pressKey(name: string) {
  const { keyboard, Key } = await getNut();
  const key = resolveKey(Key, name);
  await keyboard.pressKey(key);
  await keyboard.releaseKey(key);
}

export async function hotkey(keys: string[]) {
  const { keyboard, Key } = await getNut();
  const resolved = keys.map((k) => resolveKey(Key, k));
  for (const k of resolved) await keyboard.pressKey(k);
  for (const k of [...resolved].reverse()) await keyboard.releaseKey(k);
}

export async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(ms, 15000))));
}

// --- Windows & apps ---------------------------------------------------------

export async function listWindows(): Promise<Array<{ id: number; title: string; processId: number }>> {
  const wm = await getWindowManager();
  const windows = wm.getWindows();
  return windows
    .map((w: any) => ({ id: w.id, title: w.getTitle(), processId: w.processId }))
    .filter((w: any) => w.title && w.title.trim().length > 0);
}

export async function focusWindow(titleSubstring: string): Promise<boolean> {
  const wm = await getWindowManager();
  const windows = wm.getWindows();
  const match = windows.find((w: any) =>
    w.getTitle().toLowerCase().includes(titleSubstring.toLowerCase())
  );
  if (!match) return false;
  match.restore();
  match.bringToTop();
  return true;
}

function shellQuote(target: string): string {
  return target.replace(/"/g, '\\"');
}

async function startViaShell(target: string): Promise<void> {
  await execAsync(`start "" "${shellQuote(target)}"`, { shell: 'cmd.exe' } as any);
}

// Recursively looks for a Start Menu shortcut (.lnk) whose filename matches
// `query` (case-insensitive substring, e.g. "discord" matches "Discord.lnk").
// This is needed because most modern apps (Discord, Slack, Spotify, etc.)
// are NOT on PATH and don't register a bare command name -- only a Start
// Menu shortcut exists, which is exactly what a human would click.
// Caches resolved app-name -> path lookups so repeat launches of the same
// app skip the Start Menu filesystem walk entirely.
const appPathCache = new Map<string, string | null>();

/** Clears the Start Menu shortcut cache, e.g. after installing a new app. */
export function clearAppPathCache(): void {
  appPathCache.clear();
}

function findStartMenuShortcut(query: string, maxDepth = 4): string | null {
  const needle = query.toLowerCase();
  if (appPathCache.has(needle)) return appPathCache.get(needle)!;

  const roots = [
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ].filter(Boolean);

  let bestExact: string | null = null;
  let bestPartial: string | null = null;

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || (bestExact && depth > 0)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) {
        const base = path.basename(entry.name, '.lnk').toLowerCase();
        if (base === needle && !bestExact) {
          bestExact = full;
        } else if (base.includes(needle) && !bestPartial) {
          bestPartial = full;
        }
      }
    }
  };

  for (const root of roots) walk(root, 0);
  const result = bestExact || bestPartial;
  appPathCache.set(needle, result);
  return result;
}

// A handful of well-known apps that install to a predictable per-user path
// but don't create a PATH entry or an easily-found Start Menu shortcut name
// match (e.g. Discord's shortcut launches an updater, but the folder itself
// is reliable). Extend this list as needed.
function findKnownAppPath(query: string): string | null {
  const localAppData = process.env.LOCALAPPDATA || '';
  const needle = query.toLowerCase();
  const knownDirs: Record<string, string> = {
    discord: path.join(localAppData, 'Discord', 'Update.exe')
  };
  const dirPath = knownDirs[needle];
  if (dirPath && fs.existsSync(dirPath)) return dirPath;
  return null;
}

// Bare commands Windows always resolves correctly on PATH -- safe to pass
// straight to `start` without any lookup.
const KNOWN_BUILTINS = new Set([
  'notepad', 'calc', 'mspaint', 'explorer', 'cmd', 'powershell', 'control',
  'taskmgr', 'write', 'charmap', 'winword', 'excel', 'powerpnt', 'code', 'chrome', 'msedge'
]);

/** Launches an app/executable/URL/file the same way Win+R or double-click would. */
export async function launchApp(target: string): Promise<void> {
  const trimmed = target.trim();
  const looksLikeUrlOrPath =
    /^https?:\/\//i.test(trimmed) ||
    /^[a-zA-Z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith('\\\\') ||
    trimmed.includes('\\') ||
    trimmed.includes('/');

  // URLs, absolute paths, and known PATH-resolvable builtins -- same
  // resolution `start` and Explorer already handle correctly.
  if (looksLikeUrlOrPath || KNOWN_BUILTINS.has(trimmed.toLowerCase())) {
    await startViaShell(trimmed);
    return;
  }

  // Bare app name (e.g. "discord", "spotify"): resolve it ourselves first
  // instead of handing it to `start`, which will pop Windows' own
  // "Windows cannot find 'x'" dialog if the name isn't literally on PATH --
  // most consumer apps aren't.
  const known = findKnownAppPath(trimmed);
  if (known) {
    if (trimmed.toLowerCase() === 'discord') {
      await execAsync(`"${known}" --processStart Discord.exe`);
    } else {
      await startViaShell(known);
    }
    return;
  }

  const shortcut = findStartMenuShortcut(trimmed);
  if (shortcut) {
    await startViaShell(shortcut);
    return;
  }

  // Last resort: check if it's actually on PATH after all (e.g. a CLI tool).
  try {
    await execAsync(`where "${shellQuote(trimmed)}"`, { shell: 'cmd.exe' } as any);
    await startViaShell(trimmed);
    return;
  } catch {
    // not on PATH either
  }

  throw new Error(
    `Could not find an application, shortcut, or path matching "${target}". Try the exact Start Menu name, or a full file path/URL.`
  );
}

// Blocks the handful of commands that are almost never intended and are
// catastrophic if a model hallucinates or misreads a task ("clean up my
// disk" -> format). This is NOT a sandbox -- desktop_run_command still runs
// arbitrary PowerShell with your full user permissions. It only stops the
// small set of single-command catastrophes that are cheap to detect.
export const DESTRUCTIVE_PATTERNS = [
  /\bformat\s+[a-z]:/i,
  /remove-item\s+.*-recurse.*[\\/](windows|users|program files)\b/i,
  /remove-item\s+.*-recurse.*\s+[a-z]:\\?\s*$/i, // "-Recurse C:\" or "-Recurse C:"
  /\brd\s+\/s\s+\/q\s+[a-z]:\\?\s*$/i,
  /\bdel\s+\/[sf]\s+\/[sf]\s+[a-z]:\\?\s*$/i,
  /shutdown\s+\/s|shutdown\s+\/r/i,
  /diskpart/i,
  /reg\s+delete\s+hklm/i
];

export async function runShellCommand(command: string, timeoutMs = 20000): Promise<{ stdout: string; stderr: string }> {
  if (DESTRUCTIVE_PATTERNS.some((p) => p.test(command))) {
    throw new Error(
      `Refused to run this command -- it matches a pattern for destructive/irreversible operations (disk format, mass delete, shutdown, or registry deletion). If this was genuinely intended, run it manually instead.`
    );
  }
  const { stdout, stderr } = await execAsync(command, {
    shell: 'powershell.exe',
    timeout: timeoutMs,
    encoding: 'utf8'
  });
  return { stdout: stdout.slice(0, 8000), stderr: stderr.slice(0, 4000) };
}

