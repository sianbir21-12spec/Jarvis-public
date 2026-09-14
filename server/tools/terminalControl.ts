// server/tools/terminalControl.ts
//
// A real, persistent shell -- like the integrated terminal in VS Code or
// Claude Code -- as opposed to desktopControl's `runShellCommand`, which
// spawns a fresh one-shot process per call and has no memory of `cd`,
// environment changes, or anything else between commands.
//
// One PowerShell child process per session. Output is captured continuously
// (not just per-command) so long-running processes (dev servers, watchers,
// `ping`, etc.) can be streamed live to the UI and to the agent.
//
// Command completion is detected with a sentinel marker: after sending the
// user's command we also send `Write-Host` with a unique GUID token, and
// watch the output stream for that token to know a command has finished
// and to recover its exit code. This is the standard trick for turning a
// plain interactive shell into something request/response-shaped without
// needing a native pty dependency.

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { randomUUID } from 'crypto';

export interface TerminalChunk {
  sessionId: string;
  data: string;
  stream: 'stdout' | 'stderr';
}

interface PendingRun {
  marker: string;
  buffer: string;
  resolve: (result: { output: string; exitCode: number | null }) => void;
}

interface Session {
  id: string;
  proc: ChildProcessWithoutNullStreams;
  cwd: string;
  listeners: Set<(chunk: TerminalChunk) => void>;
  pending: PendingRun | null;
  scrollback: string[]; // last N lines, so a UI opening late (or a fresh
  // agent turn) can catch up instead of seeing a blank pane.
  createdAt: number;
}

const MAX_SCROLLBACK_LINES = 500;
const sessions = new Map<string, Session>();

function pushScrollback(session: Session, text: string) {
  const lines = text.split('\n');
  session.scrollback.push(...lines);
  if (session.scrollback.length > MAX_SCROLLBACK_LINES) {
    session.scrollback.splice(0, session.scrollback.length - MAX_SCROLLBACK_LINES);
  }
}

function broadcast(session: Session, chunk: TerminalChunk) {
  for (const listener of session.listeners) listener(chunk);
}

function attachStream(
  session: Session,
  stream: 'stdout' | 'stderr',
  source: NodeJS.ReadableStream
) {
  source.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8');
    pushScrollback(session, text);
    broadcast(session, { sessionId: session.id, data: text, stream });

    if (session.pending) {
      session.pending.buffer += text;
      const idx = session.pending.buffer.indexOf(session.pending.marker);
      if (idx !== -1) {
        // Everything before the marker is the command's real output.
        const output = session.pending.buffer.slice(0, idx);
        const after = session.pending.buffer.slice(idx + session.pending.marker.length);
        const exitMatch = after.match(/EXIT:(-?\d+)/);
        const exitCode = exitMatch ? Number(exitMatch[1]) : null;
        const resolve = session.pending.resolve;
        session.pending = null;
        resolve({ output: output.trim(), exitCode });
      }
    }
  });
}

export function createSession(cwd?: string): Session {
  const id = randomUUID();
  const proc = spawn(
    'powershell.exe',
    ['-NoLogo', '-NoExit', '-Command', '-'],
    {
      cwd: cwd || process.env.USERPROFILE || process.cwd(),
      windowsHide: true
    }
  );

  const session: Session = {
    id,
    proc,
    cwd: cwd || process.env.USERPROFILE || process.cwd(),
    listeners: new Set(),
    pending: null,
    scrollback: [],
    createdAt: Date.now()
  };

  attachStream(session, 'stdout', proc.stdout);
  attachStream(session, 'stderr', proc.stderr);

  proc.on('exit', (code) => {
    broadcast(session, {
      sessionId: id,
      data: `\n[process exited with code ${code}]\n`,
      stream: 'stdout'
    });
    sessions.delete(id);
  });

  sessions.set(id, session);
  return session;
}

export function listSessions() {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    cwd: s.cwd,
    createdAt: s.createdAt,
    alive: !s.proc.killed
  }));
}

export function getScrollback(sessionId: string): string {
  const session = sessions.get(sessionId);
  return session ? session.scrollback.join('\n') : '';
}

export function subscribe(sessionId: string, listener: (chunk: TerminalChunk) => void): () => void {
  const session = sessions.get(sessionId);
  if (!session) return () => {};
  session.listeners.add(listener);
  return () => session.listeners.delete(listener);
}

/**
 * Runs a command in the given session and resolves once it completes,
 * returning everything it printed plus its exit code. Rejects if another
 * command is already running in that session (the shell is single-threaded
 * -- interleaving would corrupt the sentinel matching) or the session is
 * unknown.
 */
export function runCommand(sessionId: string, command: string, timeoutMs = 30000): Promise<{ output: string; exitCode: number | null }> {
  const session = sessions.get(sessionId);
  if (!session) return Promise.reject(new Error(`No terminal session ${sessionId}.`));
  if (session.pending) return Promise.reject(new Error('A command is already running in this terminal. Wait for it to finish or start another session.'));

  const marker = `__JARVIS_DONE_${randomUUID()}__`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (session.pending) {
        session.pending = null;
        reject(new Error(`Command timed out after ${timeoutMs}ms (it may still be running in the background -- check the terminal).`));
      }
    }, timeoutMs);

    session.pending = {
      marker,
      buffer: '',
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      }
    };

    // $LASTEXITCODE reflects native exe exit codes; $? reflects the last
    // PowerShell statement's success. We print $LASTEXITCODE, falling back
    // to 0/1 via $? when it's null (e.g. after a cmdlet, not an exe).
    session.proc.stdin.write(
      `${command}\nWrite-Host "${marker}EXIT:$(if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 })"\n`
    );
  });
}

export function killSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.proc.kill();
  sessions.delete(sessionId);
  return true;
}

export function sendRawInput(sessionId: string, text: string): boolean {
  // For interactive prompts the sentinel-based runCommand can't handle
  // (e.g. a program asking "Continue? [y/n]") -- writes raw keystrokes
  // without waiting for a completion marker.
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.proc.stdin.write(text);
  return true;
}
