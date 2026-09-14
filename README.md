# JARVIS - Futuristic Autonomous AI Assistant & Command Center

JARVIS is a production-grade, standalone web application that replicates the interface and capabilities of a high-tech personal AI assistant. It integrates real-time Server-Sent Events (SSE) response streaming, bi-directional voice recognition and vocal synthesis, client-side conversation persistence, a modular command system, and safe browser webpage context grounding.

> **⚠️ Before you install:** JARVIS includes an opt-in **Agent Mode** that lets
> the AI autonomously control your mouse, keyboard, screen, and a real Chrome
> browser, including running PowerShell commands, with no per-step
> confirmation once you start a task. It is off by default and requires a
> typed confirmation to enable. Read the [Agent Mode](#agent-mode-desktop--browser-control)
> section before turning it on. Your API keys and conversation content are
> sent to the OmniRoute gateway (and to Google's Gemini API if you configure
> voice fallback) — see [Privacy](#privacy--data-handling).

---

## 1. Requirements

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **NPM**: v9.0.0 or higher
- **Modern Web Browser**: Google Chrome, Microsoft Edge, or Safari (required for Web Speech API speech-to-text and speech-synthesis features)
- **OmniRoute Gateway Access**: Configured with the `SIAN` model endpoint.

---

## 2. Installation

Clone the repository and install all dependencies:

```bash
git clone https://github.com/your-repo/jarvis-web.git
cd jarvis-web
npm install
```

---

## 3. Environment Configuration

JARVIS utilizes a secure full-stack architecture where secrets remain on the backend and are **never** leaked or exposed to client JavaScript.

### Using `.env` File (Recommended)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set the following variables in `.env`:

```env
# Server Port
PORT=3000

# OmniRoute AI Gateway
OMNIROUTE_BASE_URL=https://omnirouuter.zeabur.app
OMNIROUTE_API_KEY=YOUR_OMNIROUTE_API_KEY
OMNIROUTE_MODEL=SIAN
```

### Windows PowerShell Environment Configuration

Alternatively, set environment variables directly in Windows PowerShell before running:

```powershell
$env:PORT="3000"
$env:OMNIROUTE_BASE_URL="https://omnirouuter.zeabur.app"
$env:OMNIROUTE_API_KEY="YOUR_OMNIROUTE_API_KEY"
$env:OMNIROUTE_MODEL="SIAN"

npm run dev
```

### Linux / macOS Bash Environment Configuration

```bash
export PORT=3000
export OMNIROUTE_BASE_URL="https://omnirouuter.zeabur.app"
export OMNIROUTE_API_KEY="YOUR_OMNIROUTE_API_KEY"
export OMNIROUTE_MODEL="SIAN"

npm run dev
```

---

## 4. OmniRoute Configuration

JARVIS connects to the OpenAI-compatible chat completions endpoint hosted on OmniRoute:

- **Endpoint**: `https://omnirouuter.zeabur.app/v1/chat/completions`
- **Model**: `SIAN`
- **Authentication**: `Authorization: Bearer ${OMNIROUTE_API_KEY}`
- **Format**: Standard OpenAI chat completions payload (`messages`, `model`, `stream: true`, `temperature`, `max_tokens`).
- **Streaming**: Upstream Server-Sent Events (SSE) `data: {"choices": [{"delta": {"content": "..."}}]}` are parsed and piped directly to the React interface.

---

## 5. Development

Start both the backend server and Vite frontend in a single unified command:

```bash
npm run dev
```

The application will be accessible at:
```
http://localhost:3000
```

During development, Vite middleware is automatically mounted into the Express server, providing instant TypeScript execution and fast updates.

---

## 6. Production Build & Execution

To compile and bundle for production deployment:

```bash
# 1. Compile frontend and bundle backend
npm run build

# 2. Launch production server
npm start
```

The build command compiles Vite assets to `/dist` and bundles `server.ts` into a self-contained CommonJS binary at `dist/server.cjs` via `esbuild`. Express serves the optimized static assets and handles API requests on port 3000.

---

## 7. Desktop App (Electron)

JARVIS runs as a real native desktop application on Windows, macOS, and Linux — not just a browser tab in a frame. It wraps the exact same Express backend + React frontend, so there's zero code duplication between web and desktop.

**What makes it a proper native app, not just a wrapped webpage:**

| Feature | Details |
|---|---|
| **Custom app icon** | A generated JARVIS arc-reactor icon in `build-resources/` (`.icns` for macOS, `.ico` for Windows, `.png` for Linux), used for the dock/taskbar, window, tray, and installers. |
| **Native menu bar** | Real File / Edit / JARVIS / View / Window / Help menus with keyboard shortcuts (`⌘N` new protocol, `⌘,` settings, `⌘⇧V` voice input, `⌘⇧S` summarize, `⌘⇧E` code explainer, `⌘B` toggle sidebar) — not Electron's default dev menu. |
| **Splash screen** | A branded loading screen shows immediately while the local backend boots, so there's never a blank white flash on launch. |
| **Window state persistence** | Size, position, and maximized state are remembered between launches (and safely reset if you unplug a monitor the window was on). |
| **System tray icon** | JARVIS keeps running in the tray/menu bar when closed, with a quick-access menu (Show, New Protocol, Quit). Closing the window doesn't quit the app — it minimizes to tray, like a proper background assistant. |
| **Global shortcut** | `⌘⇧J` / `Ctrl+Shift+J` summons JARVIS from anywhere on the system, Spotlight-style. |
| **Native notifications** | If a response finishes while the window is unfocused, you get a native OS notification; clicking it refocuses JARVIS. |
| **Single-instance lock** | Launching JARVIS again (e.g. double-clicking the dock icon) focuses the existing window instead of spawning a duplicate app + backend server. |
| **Auto-update scaffolding** | `electron-updater` is wired in (`electron/lib/updater.cjs`) and disabled by default. Flip `enabled: true` in `electron/main.cjs` and add a `build.publish` target (GitHub Releases, S3, etc.) in `package.json` to turn on real update checks. |
| **External links open in your OS browser**, never inside the app window. |

### Run in development

```bash
npm run electron:dev
```

This starts the backend (`tsx server.ts`) and, once it responds on `http://localhost:3000`, launches the Electron window pointed at it. Edits to the frontend/backend hot-reload the same way `npm run dev` does in the browser.

### Build an installable desktop app

```bash
npm run electron:build
```

This runs `npm run build` (Vite + esbuild bundle) and then packages it with `electron-builder`, embedding the custom icon and native menu/tray. On launch, the packaged app spawns the bundled `dist/server.cjs` as a local backend process and loads it in the native window. Installers/binaries are written to `release/`:

- **macOS** → `.dmg` (with a custom `.icns` app icon)
- **Windows** → NSIS installer (with a custom `.ico`, desktop + Start Menu shortcuts, user-choosable install directory)
- **Linux** → `.AppImage` (with a custom `.png` icon)

To just produce an unpacked app folder (useful for quick testing without building an installer):

```bash
npm run electron:pack
```

Make sure `.env` is configured (see Section 3) before building — the packaged app reads the same environment variables at runtime.

### Icon source

The app icon artwork lives at `build-resources/` — `icon.icns`, `icon.ico`, `icon.png` (packaging-time, used by electron-builder) and `electron/icons/` — `app-icon.png`, `tray-icon*.png`, `tray-iconTemplate*.png` (runtime, used by the window and tray at launch). Regenerate them from new artwork by replacing these files at the same sizes (16–1024px) and formats.

---

## 8. Voice Permissions & Interaction

JARVIS features browser-native voice control via the **Web Speech API**:
- **Speech-to-Text**: Powered by `window.SpeechRecognition` (or `webkitSpeechRecognition`).
- **Text-to-Speech**: Powered by `window.speechSynthesis`.

### How to use Voice:
1. Click the **Microphone icon** on the input bar or click the central **JARVIS Arc Reactor Core**.
2. When prompted by your browser, select **Allow** for microphone access.
3. Speak your prompt or command (e.g., *"Summarize quantum computing breakthroughs"*).
4. Speech is transcribed in real-time. Once you finish speaking, JARVIS automatically dispatches the prompt to the neural gateway.
5. If **Voice: ON** or **Auto-Speak** is enabled in Settings, JARVIS synthesizes and vocalizes the response back to you.

---

## 9. Command System

JARVIS features a modular command parser that detects both slash commands and natural language phrases:

| Command | Triggers | Description |
|---|---|---|
| `/summarize` | *"Summarize this"*, *"TLDR"* | Generates a structured executive summary of the conversation or attached context. |
| `/explain` | *"Explain this"*, *"Break this down"* | Provides foundational explanations with intuitive analogies. |
| `/code` | *"Write code for this"*, *"Generate code"* | Synthesizes clean, robust, well-typed code blocks. |
| `/translate` | *"Translate this"* | Converts text or context to requested languages. |
| `/analyze` | *"Analyze this page"*, *"Analyze document"* | Analyzes imported webpage context and provides critical insights. |
| `/speak` | *"Read this aloud"*, *"Speak this"* | Vocalizes the latest assistant response using speech synthesis. |
| `/voice` | *"Voice on"*, *"Voice off"* | Toggles speech synthesis vocalization mode. |
| `/clear` | *"Clear chat"*, *"Wipe history"* | Purges the active protocol's messages. |
| `/new` | *"New conversation"*, *"Reset session"* | Initializes a fresh conversation protocol. |
| `/context` | *"Add context"*, *"Import webpage"* | Opens the safe webpage and text context importer. |

---

## 10. Webpage Context System

Because JARVIS runs safely as a browser web application and **not** an invasive Chrome extension, it implements safe context grounding:
- **Public URL Fetch**: The backend fetches public URLs with strict SSRF guards (blocking private IP ranges, loopback, and local networks) and cleans HTML to plain text.
- **Direct Paste**: Users can paste documentation, articles, or select text snippets.
- The context object `{ url, title, text, selection }` is injected as contextual grounding into the prompt sent to the OmniRoute `SIAN` model.

---

## 11. Security Architecture

- **Zero Client Token Exposure**: `OMNIROUTE_API_KEY` is loaded solely on the Express backend via `process.env`. The client NEVER receives or stores the API key in `localStorage` or DOM.
- **SSRF Hardening**: URL context retrieval validates schemes and rejects loopback (`127.0.0.1`, `localhost`) and private subnets (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`).
- **Safe HTML Sanitization**: Webpage text is stripped of dangerous `<script>`, `<style>`, and `<object>` tags before tokenization.
- **Loopback-only server**: the local Express server binds to `127.0.0.1` only (not `0.0.0.0`), so it's never reachable from other devices on your network.
- **Agent Mode is the one deliberate exception to "no arbitrary OS command execution."** When explicitly enabled (see below), the agent can run PowerShell commands and control input devices with full autonomy. A denylist blocks a handful of single-command catastrophes (disk format, mass delete of a drive root, shutdown, registry deletion) but this is **not a sandbox** — treat Agent Mode as running with your full user permissions, because it is.

---

## Privacy & Data Handling

- Chat messages, any attached file content, and (when Agent Mode is active) screenshots of your screen are sent to whatever endpoint `OMNIROUTE_BASE_URL` points at, using your `OMNIROUTE_API_KEY`. What that gateway operator does with that data is governed by their policy, not this project's.
- If you configure `GEMINI_API_KEY` for Electron voice transcription, audio is sent to Google's Generative Language API for speech-to-text.
- Conversation history is stored client-side (browser/Electron local storage) only — this project has no server-side database or account system.
- No telemetry or analytics are built into this app. Any usage data collection is entirely a property of the OmniRoute/Gemini endpoints you configure, not of this codebase.
- If you fork or redistribute this project, you are responsible for your own privacy policy reflecting whatever backend you point it at.

---

## 12. Project Architecture

```
jarvis-web/
│
├── package.json
├── vite.config.ts
├── tsconfig.json
├── README.md
├── .gitignore
├── .env.example
├── server.ts
│
├── build-resources/
│   ├── icon.icns
│   ├── icon.ico
│   └── icon.png
│
├── electron/
│   ├── main.cjs
│   ├── preload.cjs
│   ├── splash.html
│   ├── icons/
│   │   ├── app-icon.png
│   │   ├── tray-icon.png
│   │   └── tray-iconTemplate.png
│   └── lib/
│       ├── windowState.cjs
│       ├── menu.cjs
│       ├── tray.cjs
│       ├── updater.cjs
│       └── notifications.cjs
│
├── server/
│   ├── index.ts
│   ├── omniroute.ts
│   ├── routes/
│   │   └── chat.ts
│   └── middleware/
│       └── errorHandler.ts
│
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── types.ts
    ├── index.css
    │
    ├── components/
    │   ├── Chat.tsx
    │   ├── Message.tsx
    │   ├── InputBar.tsx
    │   ├── JarvisCore.tsx
    │   ├── Sidebar.tsx
    │   ├── Settings.tsx
    │   ├── VoiceButton.tsx
    │   ├── StatusIndicator.tsx
    │   └── WebpageContextModal.tsx
    │
    ├── services/
    │   ├── api.ts
    │   ├── voice.ts
    │   └── storage.ts
    │
    ├── commands/
    │   ├── commandParser.ts
    │   └── commandRegistry.ts
    │
    └── styles/
        ├── global.css
        ├── chat.css
        ├── sidebar.css
        └── jarvis.css
```

## Agent Mode (desktop & browser control)

JARVIS can autonomously control the mouse, keyboard, screen, and a real Chrome
browser to complete tasks end-to-end (Windows only). Click **Agent Mode** in
the top bar, describe a task in plain English, and hit Run.

**One-time setup after `npm install`:**

1. `npm install` — pulls in `@nut-tree-fork/nut-js` (input/screen automation),
   `node-window-manager` (window focus/listing), `playwright` (browser
   control), and `sharp` (screenshot resizing). The first two ship native
   binaries; npm downloads the right prebuilt one for Windows automatically.
2. If Google Chrome isn't already installed on the machine, run
   `npx playwright install chrome` once so Playwright has a Chrome build to
   drive. If Chrome is already installed, Playwright reuses it directly.
3. Windows may show a one-time Defender/SmartScreen prompt the first time the
   native input-simulation binary runs — this is expected for any
   mouse/keyboard automation tool, allow it.

**How it works:** the model (via your OmniRoute gateway) is given a set of
tools (`desktop_click`, `desktop_type`, `browser_navigate`,
`browser_click_selector`, etc. — see `server/tools/toolDefinitions.ts`). It
takes a screenshot, decides on an action, JARVIS executes it against the real
OS/browser, screenshots again, and repeats until the task is done. It runs
with full autonomy — no per-step confirmation dialogs — so only give it tasks
you're comfortable letting it carry out unsupervised. Use the **Stop** button
in the Agent Mode panel as a kill switch at any time.

**Model requirement:** the OmniRoute model behind `OMNIROUTE_MODEL` must
support OpenAI-style function/tool calling *and* image inputs in messages
(vision), since the loop sends screenshots as `image_url` content and reads
back `tool_calls`. If your default model doesn't support both, set
`OMNIROUTE_MODEL` in `.env` to one on your gateway that does.
