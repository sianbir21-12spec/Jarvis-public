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

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

// Screenshots handed to the model are downscaled (see captureScreen), so the
// coordinates it reads off them are in the *screenshot's* pixel space, not
// the screen's. nut-js expects real screen pixels. Without converting, every
// click on a display wider than AGENT_SCREENSHOT_WIDTH lands at the wrong
// place -- e.g. on a 1920px-wide screen with a 1024px screenshot, at ~53% of
// the intended position, which silently breaks essentially every task.
//
// captureScreen records the factor it used; toScreenCoords applies it.
// Defaults to 1 so a click issued before any screenshot (or when no
// downscaling happened) is passed through untouched.
let lastCaptureScale = 1;

export function getLastCaptureScale(): number {
  return lastCaptureScale;
}

/** Maps a point from the most recent screenshot's pixel space to screen pixels. */
export function toScreenCoords(x: number, y: number): { x: number; y: number } {
  if (!lastCaptureScale || lastCaptureScale === 1) return { x: Math.round(x), y: Math.round(y) };
  return { x: Math.round(x / lastCaptureScale), y: Math.round(y / lastCaptureScale) };
}

// On Linux/CI/containers there may be no attached display at all (no
// X server / Wayland compositor). nut-js's screen.grab() throws deep
// inside a native binding in that case, which previously surfaced as an
// opaque, hard-to-diagnose stack trace on the very first desktop_ call.
// Detect it up front so callers (desktop.tools.ts) can report a clear,
// actionable error instead, and the agent loop can steer itself toward
// browser/terminal tools rather than retrying the same failing action.
let headlessCheckDone = false;
let headlessCheckResult = false;

export async function isHeadlessEnvironment(): Promise<boolean> {
  if (headlessCheckDone) return headlessCheckResult;
  headlessCheckDone = true;
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    headlessCheckResult = true;
    return true;
  }
  try {
    const { screen } = await getNut();
    await screen.width();
    headlessCheckResult = false;
  } catch {
    headlessCheckResult = true;
  }
  return headlessCheckResult;
}

/** Captures the primary screen as a PNG, downscaled so it's cheap to send to a model. */
export async function captureScreen(maxWidth = Number(process.env.AGENT_SCREENSHOT_WIDTH) || 1024): Promise<ScreenshotResult> {
  if (await isHeadlessEnvironment()) {
    throw new Error(
      'No display available on this machine (headless environment -- no DISPLAY/WAYLAND_DISPLAY, or screen capture failed). ' +
      'Desktop control (mouse/keyboard/screenshot) is unavailable here. Use browser_* tools for web tasks or terminal_run for CLI tasks instead.'
    );
  }
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
  const jpegBuffer = await pipeline.jpeg({ quality }).toBuffer();

  // Remember how much this frame was shrunk so click/move/drag can undo it.
  lastCaptureScale = scale;

  return {
    base64: jpegBuffer.toString('base64'),
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
  const p = toScreenCoords(x, y);
  await mouse.move(straightTo(new Point(p.x, p.y)));
}

type MouseButton = 'left' | 'right' | 'middle';

export async function click(x: number, y: number, button: MouseButton = 'left', double = false) {
  const { mouse, straightTo, Point, Button } = await getNut();
  const p = toScreenCoords(x, y);
  await mouse.move(straightTo(new Point(p.x, p.y)));
  const btn = button === 'right' ? Button.RIGHT : button === 'middle' ? Button.MIDDLE : Button.LEFT;
  if (double) {
    await mouse.doubleClick(btn);
  } else {
    await mouse.click(btn);
  }
}

export async function drag(fromX: number, fromY: number, toX: number, toY: number) {
  const { mouse, straightTo, Point, Button } = await getNut();
  const from = toScreenCoords(fromX, fromY);
  const to = toScreenCoords(toX, toY);
  await mouse.move(straightTo(new Point(from.x, from.y)));
  await mouse.pressButton(Button.LEFT);
  await mouse.move(straightTo(new Point(to.x, to.y)));
  await mouse.releaseButton(Button.LEFT);
}

export async function scroll(deltaX: number, deltaY: number) {
  const { mouse } = await getNut();
  // Previously a negative deltaY issued a pointless scrollDown(0) before
  // scrolling up; only one direction should ever fire per axis.
  if (deltaY > 0) await mouse.scrollDown(deltaY);
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

type WindowAction = 'minimize' | 'maximize' | 'restore' | 'close';

/**
 * Finds a window by title substring and applies minimize/maximize/restore/
 * close. Returns false (never throws) if no matching window is found, so
 * callers can report "no matching window" instead of a crash -- consistent
 * with focusWindow's existing contract above.
 */
export async function setWindowState(titleSubstring: string, action: WindowAction): Promise<boolean> {
  const wm = await getWindowManager();
  const windows = wm.getWindows();
  const match = windows.find((w: any) =>
    w.getTitle().toLowerCase().includes(titleSubstring.toLowerCase())
  );
  if (!match) return false;
  switch (action) {
    case 'minimize':
      match.minimize();
      break;
    case 'maximize':
      match.maximize();
      break;
    case 'restore':
      match.restore();
      break;
    case 'close':
      // node-window-manager has no generic close(); ask the OS to close the
      // window's owning process gracefully via taskkill (no /F -- lets the
      // app prompt to save unsaved work rather than being force-killed).
      await execAsync(`taskkill /PID ${match.processId}`).catch(() => {
        // Fall back to force-close only if the graceful request failed
        // (e.g. the process ignored WM_CLOSE) -- still not silent: the
        // caller sees whatever taskkill's final error, if any, reports.
      });
      break;
  }
  return true;
}

// --- Clipboard ---------------------------------------------------------

export async function readClipboard(): Promise<string> {
  const { clipboard } = await getNut();
  return await clipboard.getContent();
}

export async function writeClipboard(text: string): Promise<void> {
  const { clipboard } = await getNut();
  await clipboard.setContent(text);
}

export async function getCursorPosition(): Promise<{ x: number; y: number }> {
  const { mouse } = await getNut();
  const pos = await mouse.getPosition();
  return { x: pos.x, y: pos.y };
}

// --- System info ---------------------------------------------------------

export function getSystemInfo() {
  // Node's own `os` module -- no new dependency. Deliberately excludes
  // anything identity-sensitive (usernames, network MACs/IPs, machine
  // IDs); this is meant for "what OS/resources am I running on", not a
  // fingerprinting surface.
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    cpuModel: os.cpus()[0]?.model || 'unknown',
    cpuCount: os.cpus().length,
    totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
    freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
    uptimeSeconds: Math.round(os.uptime())
  };
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

// BLOCK tier: catastrophic/irreversible commands, plus credential
// extraction and persistence primitives (per the permission-engine spec --
// these are not something a user should be able to approve past through
// the agent, since an LLM agent approving its own persistence mechanism
// defeats the point of asking). This is NOT a sandbox -- desktop_run_command
// still runs arbitrary PowerShell with your full user permissions. It only
// stops the specific, cheap-to-detect patterns below.
export const BLOCKED_PATTERNS = [
  // Catastrophic / irreversible
  /\bformat\s+[a-z]:/i,
  /remove-item\s+.*-recurse.*[\\/](windows|users|program files)\b/i,
  /remove-item\s+.*-recurse.*\s+[a-z]:\\?\s*$/i, // "-Recurse C:\" or "-Recurse C:"
  /\brd\s+\/s\s+\/q\s+[a-z]:\\?\s*$/i,
  /\bdel\s+\/[sf]\s+\/[sf]\s+[a-z]:\\?\s*$/i,
  /shutdown\s+\/s|shutdown\s+\/r/i,
  /diskpart/i,
  /reg\s+delete\s+hklm/i,
  // Credential extraction
  /mimikatz|sekurlsa|lsass\.exe|procdump.*lsass/i,
  /login\s*data['"]?\s*$/i, // Chrome/Edge saved-password DB
  /\.ssh[\\/]id_rsa|\.aws[\\/]credentials/i,
  /Get-Content.*(\.ssh|\.aws|credential)/i,
  // Persistence / privilege escalation
  /reg\s+add\s+.*\\run\b/i, // HKCU/HKLM ...\Run registry key
  /schtasks\s+\/create|new-scheduledtask/i,
  /net\s+user\s+.*\/add|net\s+localgroup\s+administrators\s+.*\/add/i,
  /Add-MpPreference\s+-ExclusionPath|Set-MpPreference\s+-DisableRealtimeMonitoring/i
];

/** @deprecated use BLOCKED_PATTERNS -- kept so nothing importing the old name breaks. */
export const DESTRUCTIVE_PATTERNS = BLOCKED_PATTERNS;

// ASK tier: recoverable but risky enough to want a human in the loop.
// Previously these ran completely unchecked -- this is new coverage, not a
// relaxation of anything.
export const ASK_PATTERNS = [
  /\bremove-item\b|\bdel\s+|\berase\s+/i,
  /\btaskkill\b|stop-process/i,
  /git\s+reset\s+--hard|git\s+clean\s+-f/i,
  /npm\s+uninstall\s+-g|pip\s+uninstall/i,
  /docker\s+(rm|rmi|system\s+prune)/i,
  /set-executionpolicy/i,
  /stop-service|restart-service/i
];

export async function runShellCommand(command: string, timeoutMs = 20000): Promise<{ stdout: string; stderr: string }> {
  if (BLOCKED_PATTERNS.some((p) => p.test(command))) {
    throw new Error(
      `Refused to run this command -- it matches a pattern for destructive/irreversible operations, credential extraction, or persistence (tier: BLOCK). This cannot be approved past; if genuinely intended, run it manually instead.`
    );
  }
  const { stdout, stderr } = await execAsync(command, {
    shell: 'powershell.exe',
    timeout: timeoutMs,
    encoding: 'utf8'
  });
  return { stdout: stdout.slice(0, 8000), stderr: stderr.slice(0, 4000) };
}
