import { Router, Response } from 'express';
import { getDb, getAncientStats } from '../db';
import { type AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const { character, buildId, scope } = req.query;

  const stats = getAncientStats(db, {
    character: typeof character === 'string' ? character : undefined,
    buildId: typeof buildId === 'string' ? buildId : undefined,
    userId: scope === 'mine' ? req.userId : undefined,
  });

  res.json(stats);
});

export default router;
