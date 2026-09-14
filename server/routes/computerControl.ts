import { Router, Request, Response } from 'express';
import { setComputerControlEnabled, getComputerControlState } from '../state/computerControlState.js';

export const computerControlRouter = Router();

computerControlRouter.get('/computer-control/status', (_req: Request, res: Response) => {
  res.json(getComputerControlState());
});

computerControlRouter.post('/computer-control/enable', (req: Request, res: Response) => {
  const { confirm } = req.body || {};
  // Requires the UI to have already collected the user's typed confirmation
  // (see Settings.tsx) and forward it here -- this isn't cryptographic
  // security, it's a deliberate speed bump so nothing can flip this on
  // silently via a stray fetch().
  if (confirm !== 'I UNDERSTAND') {
    return res.status(400).json({ error: 'Missing or incorrect confirmation.' });
  }
  const enabled = setComputerControlEnabled(true);
  res.json({ enabled });
});

computerControlRouter.post('/computer-control/disable', (_req: Request, res: Response) => {
  const enabled = setComputerControlEnabled(false);
  res.json({ enabled });
});
