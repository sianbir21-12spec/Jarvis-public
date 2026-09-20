# JARVIS — Windows build & what changed

## 1. Build the .exe

On a **Windows 10/11 x64 machine** with [Node.js 20+](https://nodejs.org) installed:

```
double-click build-windows.bat
```

Or from a Command Prompt in this folder:

```bat
npm install
npm run build:win
```

You get two files in `release\`:

| File | What it is |
|---|---|
| `JARVIS-0.1.0-win-x64.exe` | NSIS installer — lets you choose the install folder, adds Start Menu + desktop shortcuts |
| `JARVIS-0.1.0-portable.exe` | Single self-contained .exe — no install, just run it |

**The build must run on Windows.** Not a preference — the dependency tree in this
project is Windows-native: `@nut-tree-fork/libnut-win32` (mouse/keyboard),
`@img/sharp-win32-x64` (screenshots), `@tailwindcss/oxide-win32-x64-msvc` and
`@rollup/rollup-win32-x64-msvc` (build toolchain) all ship `.node`/`.dll`
binaries that only load on Windows. Cross-building from Linux or macOS fails.

First build takes a while — electron-builder downloads the Electron runtime and
NSIS toolchain (~200 MB), so you need internet access for that first run.

---

## 2. New: API keys are configured inside the app

Open **Settings (gear icon) → AI GATEWAY & KEYS**. You can set:

- **OmniRoute API Key** — masked once saved; a **Test** button does a live
  `/v1/models` call and reports how many models the gateway offers
- **Base URL**, **Chat Model**, **Agent Model**, **OmniRoute STT Model**
- **Gemini API Key** (voice transcription fallback) — also with a **Test** button
- **Gemini STT Model**

Values are saved by the backend to `%APPDATA%\jarvis-desktop\config.json`
(permissions tightened to owner-only). Each field shows where its current value
came from: `set in app`, `from .env`, or `default`.

Resolution order is **app setting → environment variable → built-in default**,
so an existing `.env` keeps working and clearing a field falls back to it.

The renderer never receives a full key — only a mask like `sk-a…f19c` plus a
"configured" flag. Keys are sent to the backend once, when you save.

Changing the model no longer needs a restart. `AGENT_MODEL` used to be read into
a `const` at module load, so edits were ignored until the backend was killed;
it's now resolved per request.

---

## 3. Bugs fixed

**Packaged app hung on the splash screen.** `server.ts` computed its directory
from `import.meta.url`, but the production bundle is CommonJS
(`esbuild --format=cjs`), where `import.meta` is empty. `fileURLToPath(undefined)`
threw before the server ever called `listen()`, so Electron waited forever for a
backend that had already crashed. It now uses `__dirname` when bundled and falls
back to `import.meta.url` under `tsx` in dev.

**Blank window even when the server started.** Static files were served from
`path.join(__dirname, 'dist')`, but the bundle *is* `dist/server.cjs` — that
resolved to `dist/dist`, which doesn't exist. Every request 404'd. The static
root is now detected by looking for the folder that actually contains
`index.html`.

**Unmatched `/api/*` routes returned the HTML shell** instead of a JSON 404, so
a typo'd endpoint surfaced as a JSON parse error in the UI. The SPA fallback now
skips `/api/`.

**Installer was enormous.** `build.files` listed `node_modules/**/*`, which
forced every devDependency into the package — including the 368 MB Electron
distribution, TypeScript and Vite. electron-builder bundles production
dependencies on its own, so that entry is removed.

`.env.example` now documents the in-app settings path.

Typecheck (`npx tsc --noEmit`) passes clean, and the server bundle was
boot-tested: it starts, serves static assets, persists config, masks secrets,
rejects a malformed base URL, and returns a JSON 404 for unknown API routes.

---

## 4. Two things to action

**Rotate your API keys.** The `Ultron.zip` you shared contained a real `.env`
with live OmniRoute and Gemini keys. Anyone who receives that archive has them.
They are not in git history (`.gitignore` covers `.env*`), but the zip itself
carried them. Generate new keys and enter them via the Settings panel instead —
then you never need a `.env` again. I have removed `.env` from the package below.

**`jarvis-extension.7z` could not be opened** — no 7-Zip tooling here and the
sandbox has no network access to fetch one. I built the credential inputs
against the desktop app's own config surface. If the extension has specific
fields or behaviour you want mirrored, re-upload it as a `.zip` and I'll match it.
