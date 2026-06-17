import { Router, Request, Response } from 'express';
import { getDb, getAncientStats } from '../db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { character, buildId } = req.query;

  const stats = getAncientStats(db, {
    character: typeof character === 'string' ? character : undefined,
    buildId: typeof buildId === 'string' ? buildId : undefined,
  });

  res.json(stats);
});

export default router;
