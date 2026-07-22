import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { recommend } from '../recommend';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  const {
    deck = [],
    offered = [],
    character = '',
    floor = 0,
    relics = [],
    offeredUpgrades,
    deckUpgrades,
    currentBoss,
  } = req.body as {
    deck?: string[];
    offered?: string[];
    character?: string;
    floor?: number;
    relics?: string[];
    offeredUpgrades?: boolean[];
    deckUpgrades?: string[];
    currentBoss?: string;
  };

  if (!Array.isArray(offered) || offered.length === 0) {
    res.status(400).json({ error: 'offered cards required' });
    return;
  }

  try {
    const db = getDb();
    const scores = recommend(db, {
      deck,
      offered,
      character,
      floor,
      relics,
      offeredUpgrades,
      deckUpgrades,
      currentBoss,
    });
    res.json(scores);
  } catch (err) {
    console.error('[recommend]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
