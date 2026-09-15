import { Router, Request, Response } from 'express';
import { isComputerControlEnabled } from '../state/computerControlState.js';
import {
  createSession,
  killSession,
  listSessions,
  getScrollback,
  subscribe,
  runCommand,
  sendRawInput
} from '../tools/terminalControl.js';

export const terminalRouter = Router();

function requireEnabled(req: Request, res: Response): boolean {
  if (!isComputerControlEnabled()) {
    res.status(403).json({ error: 'Computer control is not enabled. Turn it on in Settings first.' });
    return false;
  }
  return true;
}

/** POST /api/terminal/start -> { sessionId } */
terminalRouter.post('/terminal/start', (req: Request, res: Response) => {
  if (!requireEnabled(req, res)) return;
  const { cwd } = req.body || {};
  const session = createSession(typeof cwd === 'string' ? cwd : undefined);
  res.json({ sessionId: session.id, cwd: session.cwd });
});

/** GET /api/terminal/list */
terminalRouter.get('/terminal/list', (_req: Request, res: Response) => {
  res.json({ sessions: listSessions() });
});

/**
 * GET /api/terminal/stream/:id
 * SSE stream of live output for a session. Sends any existing scrollback
 * immediately so a UI opening mid-session isn't blank.
 */
terminalRouter.get('/terminal/stream/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const backlog = getScrollback(id);
  if (backlog) {
    res.write(`data: ${JSON.stringify({ sessionId: id, data: backlog, stream: 'stdout' })}\n\n`);
  }

  const unsubscribe = subscribe(id, (chunk) => {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  });

  req.on('close', () => unsubscribe());
});

/** POST /api/terminal/run -> { output, exitCode }. Waits for completion. */
terminalRouter.post('/terminal/run', async (req: Request, res: Response) => {
  if (!requireEnabled(req, res)) return;
  const { sessionId, command } = req.body || {};
  if (!sessionId || typeof command !== 'string') {
    return res.status(400).json({ error: 'sessionId and command are required.' });
  }
  try {
    const result = await runCommand(sessionId, command);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Command failed.' });
  }
});

/** POST /api/terminal/input -- raw keystrokes for interactive prompts. */
terminalRouter.post('/terminal/input', (req: Request, res: Response) => {
  if (!requireEnabled(req, res)) return;
  const { sessionId, text } = req.body || {};
  const ok = sendRawInput(sessionId, String(text ?? ''));
  res.json({ ok });
});

/** POST /api/terminal/kill */
terminalRouter.post('/terminal/kill', (req: Request, res: Response) => {
  const { sessionId } = req.body || {};
  const ok = killSession(sessionId);
  res.json({ ok });
});
