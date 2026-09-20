import { Router, Request, Response } from 'express';
import { runAgent, warmGatewayConnection } from '../agent/agentLoop.js';
import { isComputerControlEnabled } from '../state/computerControlState.js';

export const agentRouter = Router();

const activeSessions = new Map<string, AbortController>();
// One pending destructive-action confirmation per session at a time (the
// agent loop is strictly sequential, so there's never more than one).
const pendingConfirmations = new Map<string, (approved: boolean) => void>();

/**
 * POST /api/agent/warmup
 * Fire-and-forget: opens the TCP/TLS connection to the OmniRoute gateway
 * ahead of time (called when the Agent panel/`/agent` opens, before the
 * user has typed a task) so that handshake latency isn't paid on the
 * real first step. Best-effort -- failures here are silent, since the
 * real request will surface any actual problem anyway.
 */
agentRouter.post('/agent/warmup', (_req: Request, res: Response) => {
  warmGatewayConnection().catch(() => {});
  res.json({ ok: true });
});

/**
 * POST /api/agent/run
 * Body: { task: string, sessionId: string }
 * Streams AgentEvent objects as SSE (`data: {...}\n\n`) while the agent
 * autonomously drives the desktop/browser to complete the task.
 */
agentRouter.post('/agent/run', async (req: Request, res: Response) => {
  const { task, sessionId } = req.body || {};

  if (!isComputerControlEnabled()) {
    return res.status(403).json({
      error: 'Computer control is not enabled. Turn it on in Settings first (requires typed confirmation).'
    });
  }

  if (!task || typeof task !== 'string' || !task.trim()) {
    return res.status(400).json({ error: 'task is required.' });
  }
  const id = typeof sessionId === 'string' && sessionId ? sessionId : `session_${Date.now()}`;

  const abortController = new AbortController();
  activeSessions.set(id, abortController);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  send({ type: 'status', message: `Session ${id} started.` });

  // Pauses the loop until the frontend POSTs an approve/deny for this
  // session, or the session aborts/disconnects (in which case it resolves
  // false rather than leaving the agent loop's await hanging forever).
  const onConfirmRequired = (): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      pendingConfirmations.set(id, resolve);
      const onAbort = () => {
        if (pendingConfirmations.get(id) === resolve) {
          pendingConfirmations.delete(id);
          resolve(false);
        }
      };
      abortController.signal.addEventListener('abort', onAbort, { once: true });
    });
  };

  // IMPORTANT: listen on the *response*, not the request. req.on('close')
  // fires as soon as the request body finishes being read (which
  // express.json() already did before this handler ran), which happens
  // almost instantly and has nothing to do with the client disconnecting --
  // that caused every run to self-abort within milliseconds. res.on('close')
  // only fires when the underlying connection actually closes.
  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
    activeSessions.delete(id);
  });

  try {
    await runAgent({
      task: task.trim(),
      signal: abortController.signal,
      onEvent: send,
      onConfirmRequired
    });
  } catch (err: any) {
    console.error(`[JARVIS Agent] Session ${id} crashed:`, err);
    send({ type: 'error', message: err?.message || 'Agent crashed unexpectedly.' });
  } finally {
    activeSessions.delete(id);
    pendingConfirmations.delete(id);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

/**
 * POST /api/agent/stop
 * Body: { sessionId: string }
 * Kill switch -- aborts a running agent session even under full autonomy.
 */
agentRouter.post('/agent/stop', (req: Request, res: Response) => {
  const { sessionId } = req.body || {};
  const controller = activeSessions.get(sessionId);
  if (controller) {
    controller.abort();
    activeSessions.delete(sessionId);
    return res.json({ stopped: true });
  }
  return res.json({ stopped: false, message: 'No active session with that id.' });
});

/**
 * POST /api/agent/confirm
 * Body: { sessionId: string, approved: boolean }
 * Resolves a pending `confirm_required` pause (destructive tool call)
 * that the agent loop is currently awaiting for this session.
 */
agentRouter.post('/agent/confirm', (req: Request, res: Response) => {
  const { sessionId, approved } = req.body || {};
  const resolve = pendingConfirmations.get(sessionId);
  if (!resolve) {
    return res.json({ ok: false, message: 'No pending confirmation for that session.' });
  }
  pendingConfirmations.delete(sessionId);
  resolve(!!approved);
  return res.json({ ok: true });
});
