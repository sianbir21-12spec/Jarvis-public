import { Router, Request, Response, NextFunction } from 'express';
import { getUsageSummary, clearUsage } from '../state/usage.js';

export const usageRouter = Router();

/**
 * GET /api/usage/summary?days=14
 * Returns messages/day, tool-call counts, and chat latency stats for the
 * Dashboard panel.
 */
usageRouter.get('/usage/summary', (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    res.json(getUsageSummary(days));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/usage
 * Clears the local usage log. Used by the Dashboard's "Clear history" action.
 */
usageRouter.delete('/usage', (_req: Request, res: Response, next: NextFunction) => {
  try {
    clearUsage();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
