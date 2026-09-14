import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes/chat.js';
import { agentRouter } from './routes/agent.js';
import { computerControlRouter } from './routes/computerControl.js';
import { terminalRouter } from './routes/terminal.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createExpressApp() {
  const app = express();

  // Security and parsing middlewares.
  //
  // origin: '*' previously meant ANY webpage open in ANY browser tab on this
  // machine could fetch() this server cross-origin and read the response --
  // including /api/agent/run, which drives real mouse/keyboard/browser
  // control. Restricting to the app's own origin closes that off; it does
  // not affect the Electron app itself (which isn't subject to CORS) or
  // direct same-origin use at http://localhost:3000.
  const allowedOrigins = [`http://localhost:${process.env.PORT || 3000}`, `http://127.0.0.1:${process.env.PORT || 3000}`];
  app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Mount API endpoints
  app.use('/api', chatRouter);
  app.use('/api', agentRouter);
  app.use('/api', computerControlRouter);
  app.use('/api', terminalRouter);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
