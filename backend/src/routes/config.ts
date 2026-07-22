import { Router, Response } from 'express';
import { type AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', (_req: AuthRequest, res: Response) => {
  res.json({ ok: true });
});

export default router;
