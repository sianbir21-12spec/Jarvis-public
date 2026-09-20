import { Router, Request, Response, NextFunction } from 'express';
import { getConfig, getPublicConfig, updateConfig, RuntimeConfig } from '../runtimeConfig.js';

export const settingsRouter = Router();

/**
 * GET /api/settings/config
 * Returns the effective configuration with secrets masked.
 */
settingsRouter.get('/settings/config', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getPublicConfig());
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/config
 * Merges a partial update. Omitted keys are left untouched, which lets the UI
 * save non-secret fields without having to re-send (or even know) the API key.
 * Sending an empty string for a key clears it and falls back to the env var.
 */
settingsRouter.post('/settings/config', (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw { status: 400, message: 'Expected a JSON object of configuration values.' };
    }

    const baseUrl = body.OMNIROUTE_BASE_URL;
    if (typeof baseUrl === 'string' && baseUrl.trim() !== '') {
      try {
        const parsed = new URL(baseUrl.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('bad protocol');
        }
      } catch {
        throw { status: 400, message: 'OmniRoute base URL must be a valid http(s) URL.' };
      }
    }

    updateConfig(body as Partial<Record<keyof RuntimeConfig, unknown>>);
    res.json({ ok: true, config: getPublicConfig() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/test
 * Body: { target: 'omniroute' | 'gemini' }
 * Performs a minimal live request so the user gets a clear pass/fail in the UI
 * instead of discovering a bad key mid-conversation.
 */
settingsRouter.post('/settings/test', async (req: Request, res: Response, next: NextFunction) => {
  const target = String(req.body?.target || 'omniroute');

  try {
    if (target === 'gemini') {
      const key = getConfig('GEMINI_API_KEY');
      if (!key) {
        res.status(400).json({ ok: false, error: 'No Gemini API key is configured.' });
        return;
      }

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
      );
      if (!r.ok) {
        const detail = await r.text().catch(() => r.statusText);
        res.status(200).json({ ok: false, error: `Gemini rejected the key (${r.status}): ${detail.slice(0, 200)}` });
        return;
      }

      const data: any = await r.json();
      const count = Array.isArray(data?.models) ? data.models.length : 0;
      res.json({ ok: true, message: `Gemini key is valid. ${count} models available.` });
      return;
    }

    const key = getConfig('OMNIROUTE_API_KEY');
    if (!key) {
      res.status(400).json({ ok: false, error: 'No OmniRoute API key is configured.' });
      return;
    }

    const base = getConfig('OMNIROUTE_BASE_URL').replace(/\/+$/, '');
    const r = await fetch(`${base}/v1/models`, {
      headers: { Authorization: `Bearer ${key}` }
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => r.statusText);
      res.status(200).json({ ok: false, error: `OmniRoute returned ${r.status}: ${detail.slice(0, 200)}` });
      return;
    }

    const data: any = await r.json();
    const models: string[] = Array.isArray(data?.data)
      ? data.data.map((m: any) => String(m?.id ?? '')).filter(Boolean)
      : [];

    res.json({
      ok: true,
      message: `Connected to OmniRoute. ${models.length} models available.`,
      models: models.slice(0, 200)
    });
  } catch (err: any) {
    res.status(200).json({ ok: false, error: err?.message || 'Connection failed.' });
  }
});
