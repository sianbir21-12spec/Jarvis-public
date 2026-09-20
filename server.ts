import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createExpressApp } from './server/index.js';

dotenv.config();

/**
 * This file is run two different ways:
 *   dev         -> tsx (ESM), where import.meta.url is defined
 *   production  -> bundled by esbuild to CJS (dist/server.cjs), where
 *                  import.meta is empty and __dirname already exists
 *
 * Reading import.meta.url unconditionally made the packaged build crash on
 * startup: fileURLToPath(undefined) throws before the server ever listens,
 * so the Electron window just hung on the splash screen waiting for a
 * backend that had already died.
 */
declare const __dirname: string | undefined;

const HERE: string = (() => {
  // CJS bundle: __dirname is injected by the bundler/runtime.
  if (typeof __dirname === 'string') return __dirname;
  // ESM (tsx dev): derive it from the module URL.
  // @ts-ignore -- import.meta is only valid in the ESM path
  return path.dirname(fileURLToPath(import.meta.url));
})();

async function startServer() {
  const app = createExpressApp();
  const PORT = Number(process.env.PORT) || 3000;

  // Vite middleware for development vs static build serving for production.
  // Import vite dynamically and only in dev, so production builds never
  // require the 'vite' package (a devDependency) to be present.
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // The bundle lives at <root>/dist/server.cjs and Vite emits index.html
    // into that same <root>/dist folder, so the static root is HERE itself.
    // The previous path.join(HERE, 'dist') resolved to <root>/dist/dist,
    // which does not exist -- every page load returned a 404 and the app
    // rendered a blank window.
    const candidates = [HERE, path.join(HERE, 'dist'), path.join(HERE, '..', 'dist')];
    const distPath = candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || HERE;

    console.log(`[JARVIS System Core] Serving static assets from ${distPath}`);

    app.use(express.static(distPath));

    // SPA fallback -- but never swallow unmatched /api/* requests, which
    // should return a JSON 404 instead of the HTML shell.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Loopback-only: this process can drive real mouse/keyboard/browser
  // control via /api/agent/run, so it must never be reachable from other
  // devices on the network. 0.0.0.0 would accept connections from anyone
  // on the same LAN (or the internet, if ever port-forwarded).
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[JARVIS System Core] Online on http://127.0.0.1:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[JARVIS Boot Failure]:', err);
  process.exit(1);
});
