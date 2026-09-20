import { Router, Request, Response, NextFunction } from 'express';
import { listMemories, addMemory, updateMemory, deleteMemory, clearMemories } from '../memory/memoryStore.js';

export const memoryRouter = Router();

/**
 * GET /api/memory
 * Returns all stored memory entries, newest first.
 */
memoryRouter.get('/memory', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ entries: listMemories() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/memory
 * Body: { text: string, category?: string }
 * Adds a new memory entry, tagged as user-authored (vs. ones the agent
 * saves itself via the memory_remember tool).
 */
memoryRouter.post('/memory', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, category } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw { status: 400, message: 'text is required.' };
    }
    const entry = addMemory(text, typeof category === 'string' ? category : 'general', 'user');
    res.json({ ok: true, entry });
  } catch (err: any) {
    if (err?.status) return next(err);
    next({ status: 400, message: err?.message || 'Failed to save memory.' });
  }
});

/**
 * PUT /api/memory/:id
 * Body: { text?: string, category?: string }
 */
memoryRouter.put('/memory/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, category } = req.body || {};
    const entry = updateMemory(req.params.id, { text, category });
    res.json({ ok: true, entry });
  } catch (err: any) {
    next({ status: 404, message: err?.message || 'Memory not found.' });
  }
});

/**
 * DELETE /api/memory/:id
 */
memoryRouter.delete('/memory/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const ok = deleteMemory(req.params.id);
    if (!ok) throw { status: 404, message: 'Memory not found.' };
    res.json({ ok: true });
  } catch (err: any) {
    next(err?.status ? err : { status: 404, message: 'Memory not found.' });
  }
});

/**
 * DELETE /api/memory
 * Clears all stored memory. Used by the "Clear all" action in Settings.
 */
memoryRouter.delete('/memory', (_req: Request, res: Response, next: NextFunction) => {
  try {
    clearMemories();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
