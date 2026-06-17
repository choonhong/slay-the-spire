import { Router, Request, Response } from 'express';
import { getDb, getCardStats, getCharacters, getBuildIds } from '../db';

const router = Router();

router.get('/cards', (req: Request, res: Response) => {
  const db = getDb();
  const { character, ascension, gameMode, buildId, colorless } = req.query;

  const filters: { character?: string; ascension?: number; gameMode?: string; buildId?: string; colorless?: boolean } = {};
  if (typeof character === 'string' && character) filters.character = character;
  if (typeof ascension === 'string' && ascension) filters.ascension = parseInt(ascension, 10);
  if (typeof gameMode === 'string' && gameMode) filters.gameMode = gameMode;
  if (typeof buildId === 'string' && buildId) filters.buildId = buildId;
  if (colorless === 'true') filters.colorless = true;

  const stats = getCardStats(db, filters);
  res.json(stats);
});

router.get('/characters', (_req: Request, res: Response) => {
  const db = getDb();
  res.json(getCharacters(db));
});

router.get('/builds', (_req: Request, res: Response) => {
  const db = getDb();
  res.json(getBuildIds(db));
});

export default router;
