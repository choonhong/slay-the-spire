import { Router, Request, Response } from 'express';
import { getDb, getCardStats, getCharacters, getBuildIds } from '../db';
import { type AuthRequest } from '../middleware/auth';
import fs from 'fs';
import path from 'path';

const COMMUNITY_CARDS_PATH = path.join(__dirname, '../../../data/community_cards.json');
const CARD_TEXT_PATH = path.join(__dirname, '../../../data/card_text.json');

const router = Router();

router.get('/cards', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const { character, ascension, gameMode, buildId, colorless, weighted, scope } = req.query;

  const filters: { character?: string; ascension?: number; gameMode?: string; buildId?: string; colorless?: boolean; weighted?: boolean; userId?: number } = {};
  // scope=mine filters to current user's runs; default is global (all users)
  if (scope === 'mine' && req.userId !== undefined) filters.userId = req.userId;
  if (typeof character === 'string' && character) filters.character = character;
  if (typeof ascension === 'string' && ascension) filters.ascension = parseInt(ascension, 10);
  if (typeof gameMode === 'string' && gameMode) filters.gameMode = gameMode;
  if (typeof buildId === 'string' && buildId) filters.buildId = buildId;
  if (colorless === 'true') filters.colorless = true;
  if (weighted === 'true') filters.weighted = true;

  const stats = getCardStats(db, filters);
  res.json(stats);
});

router.get('/characters', (req: Request, res: Response) => {
  const db = getDb();
  res.json(getCharacters(db, req.query.scope === 'mine' ? req.userId : undefined));
});

router.get('/builds', (req: Request, res: Response) => {
  const db = getDb();
  res.json(getBuildIds(db, req.query.scope === 'mine' ? req.userId : undefined));
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

router.get('/relics', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const scope = req.query.scope;
  let rows: { relic_id: string }[];
  if (scope === 'mine' && req.userId !== undefined) {
    rows = db.prepare(
      "SELECT DISTINCT ap.relic_id FROM ancient_picks ap JOIN runs r ON r.id = ap.run_id WHERE r.user_id = ? AND ap.relic_id IS NOT NULL ORDER BY ap.relic_id"
    ).all(req.userId) as { relic_id: string }[];
  } else {
    rows = db.prepare(
      "SELECT DISTINCT relic_id FROM ancient_picks WHERE relic_id IS NOT NULL ORDER BY relic_id"
    ).all() as { relic_id: string }[];
  }
  res.json(rows.map(r => `RELIC.${r.relic_id}`));
});

export default router;
