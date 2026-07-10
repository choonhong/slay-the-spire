import { Router, Request, Response } from 'express';
import { getDb, getCardStats, getCharacters, getBuildIds } from '../db';
import fs from 'fs';
import path from 'path';

const COMMUNITY_CARDS_PATH = path.join(__dirname, '../../../data/community_cards.json');
const CARD_TEXT_PATH = path.join(__dirname, '../../../data/card_text.json');

const router = Router();

router.get('/cards', (req: Request, res: Response) => {
  const db = getDb();
  const { character, ascension, gameMode, buildId, colorless, weighted } = req.query;

  const filters: { character?: string; ascension?: number; gameMode?: string; buildId?: string; colorless?: boolean; weighted?: boolean } = {};
  if (typeof character === 'string' && character) filters.character = character;
  if (typeof ascension === 'string' && ascension) filters.ascension = parseInt(ascension, 10);
  if (typeof gameMode === 'string' && gameMode) filters.gameMode = gameMode;
  if (typeof buildId === 'string' && buildId) filters.buildId = buildId;
  if (colorless === 'true') filters.colorless = true;
  if (weighted === 'true') filters.weighted = true;

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

router.get('/community-cards', (_req: Request, res: Response) => {
  try {
    const data = fs.readFileSync(COMMUNITY_CARDS_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch {
    res.json([]);
  }
});

router.get('/card-text', (_req: Request, res: Response) => {
  try {
    const data = fs.readFileSync(CARD_TEXT_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch {
    res.json([]);
  }
});

router.get('/relics', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(
    "SELECT DISTINCT relic_id FROM ancient_picks WHERE relic_id IS NOT NULL ORDER BY relic_id"
  ).all() as { relic_id: string }[];
  res.json(rows.map(r => `RELIC.${r.relic_id}`));
});

export default router;
