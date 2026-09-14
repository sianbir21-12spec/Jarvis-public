# JARVIS Desktop v0.1.0

First public release.

## Highlights

- Streaming chat UI with voice input/output, conversation history, and file attachments
- Slash-command system (`/explain-code`, `/context`, `/search`, etc.)
- Webpage context import for grounding answers in a page you're viewing
- **Agent Mode (opt-in)**: autonomous desktop, browser, and terminal control —
  the AI can take screenshots, click, type, run shell commands, and drive a
  real Chrome browser to complete multi-step tasks. **Disabled by default**
  and requires a typed confirmation in Settings to enable. See the
  [Agent Mode](README.md#agent-mode-desktop--browser-control) section of the
  README before turning it on.
- Electron desktop app for Windows (NSIS installer) and macOS (DMG)

## ⚠️ Please read before enabling Agent Mode

This is early software. Agent Mode runs with full autonomy (no per-step
confirmation) once you start a task, including a PowerShell terminal tool. A
denylist blocks the most catastrophic single commands (disk format, mass
delete, shutdown, registry deletion) but this is **not a sandbox** — it acts
with your full user permissions. Only enable it if you're comfortable
supervising what it does, and use the Stop button / global kill switch if
anything looks wrong.

## Setup

See [README.md](README.md) for full instructions. Short version:

```bash
npm install
cp .env.example .env   # fill in your OmniRoute API key
npm run electron:dev   # development
# or
npm run electron:build # produces an installer in /release
```

If you're using a prebuilt installer from this release's Assets instead of
building from source, you'll still need to supply your own `.env` (OmniRoute
API key) on first run — no keys are bundled with the app.

## Known limitations

- Windows-focused; Agent Mode's desktop control (window management, app
  launching) has not been tested on macOS/Linux
- Agent Mode requires an OmniRoute model that supports both tool/function
  calling and vision (image inputs) — check your gateway's model catalog
- No auto-update wiring yet beyond the `electron-updater` dependency being
  present

## Full Changelog

_First release — no prior tag to diff against._
