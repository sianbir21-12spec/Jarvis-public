import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('[JARVIS Backend Error]:', err.message || err);

  // Avoid leaking raw stacks or API keys
  let userFriendlyMessage = 'JARVIS encountered an unexpected internal system error.';
  const raw = (err.message || '').toLowerCase();

  if (raw.includes('unauthorized') || raw.includes('401') || raw.includes('invalid api key')) {
    userFriendlyMessage = 'OmniRoute authentication failed. Please check backend API key credentials.';
  } else if (raw.includes('enotfound') || raw.includes('econnrefused') || raw.includes('fetch failed')) {
    userFriendlyMessage = 'JARVIS cannot reach the AI gateway.';
  } else if (raw.includes('timeout')) {
    userFriendlyMessage = 'AI Gateway request timed out. Connection interrupted.';
  } else if (raw.includes('model') && (raw.includes('not found') || raw.includes('unavailable'))) {
    userFriendlyMessage = 'Requested model is currently unavailable on OmniRoute gateway.';
  } else if (err.status && err.status >= 400 && err.status < 500) {
    userFriendlyMessage = err.message || 'Invalid request parameters sent to JARVIS.';
  }

  const statusCode = err.status || err.statusCode || 500;

  if (res.headersSent) {
    return next(err);
  }

  res.status(statusCode).json({
    error: userFriendlyMessage,
    code: err.code || 'JARVIS_GATEWAY_ERROR',
    timestamp: Date.now()
  });
}
