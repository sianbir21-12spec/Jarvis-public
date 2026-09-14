import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createExpressApp } from './server/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
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
