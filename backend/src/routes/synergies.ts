import { Router, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { getDb } from '../db';

const router = Router();

export interface SynergyPair {
  card_a: string;
  card_b: string;
  runs_together: number;
  wins_together: number;
  win_rate_together: number;
  // Individual win rates for comparison
  win_rate_a: number;
  win_rate_b: number;
  // How much better they do together vs alone
  synergy_lift: number;
}

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { character, buildId, minRuns } = req.query;

  const conditions: string[] = [
    "a.offer_index = -1",   // final deck rows only
    "b.offer_index = -1",
    "a.card_id NOT LIKE '%STRIKE%'",
    "a.card_id NOT LIKE '%DEFEND%'",
    "b.card_id NOT LIKE '%STRIKE%'",
    "b.card_id NOT LIKE '%DEFEND%'",
    "a.card_id < b.card_id",
  ];
  const params: (string | number)[] = [];

  if (typeof character === 'string' && character) {
    conditions.push('r.character = ?');
    params.push(character);
  }
  if (typeof buildId === 'string' && buildId) {
    conditions.push('r.build_id = ?');
    params.push(buildId);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const minR = typeof minRuns === 'string' ? parseInt(minRuns, 10) : 3;

  const pairs = db.prepare(`
    SELECT
      a.card_id                                                        AS card_a,
      b.card_id                                                        AS card_b,
      COUNT(DISTINCT r.id)                                             AS runs_together,
      SUM(r.win)                                                       AS wins_together,
      ROUND(SUM(r.win) * 100.0 / COUNT(DISTINCT r.id), 1)             AS win_rate_together
    FROM card_choices a
    JOIN card_choices b ON b.run_id = a.run_id
    JOIN runs r         ON r.id = a.run_id
    ${where}
    GROUP BY a.card_id, b.card_id
    HAVING COUNT(DISTINCT r.id) >= ?
    ORDER BY win_rate_together DESC, runs_together DESC
    LIMIT 100
  `).all(...params, minR) as {
    card_a: string; card_b: string;
    runs_together: number; wins_together: number; win_rate_together: number;
  }[];

  // Fetch individual win rates for lift calculation
  const individualRates = getIndividualWinRates(db, character as string, buildId as string);

  const result: SynergyPair[] = pairs.map(p => {
    const wrA = individualRates.get(p.card_a) ?? 0;
    const wrB = individualRates.get(p.card_b) ?? 0;
    const baseline = (wrA + wrB) / 2;
    return {
      ...p,
      runs_together: Number(p.runs_together),
      wins_together: Number(p.wins_together),
      win_rate_together: Number(p.win_rate_together),
      win_rate_a: wrA,
      win_rate_b: wrB,
      synergy_lift: Math.round((Number(p.win_rate_together) - baseline) * 10) / 10,
    };
  });

  res.json(result);
});

function getIndividualWinRates(
  db: DatabaseSync,
  character?: string,
  buildId?: string
): Map<string, number> {
  const conditions = [
    "cc.offer_index = -1",   // final deck rows only
    "cc.card_id NOT LIKE '%STRIKE%'",
    "cc.card_id NOT LIKE '%DEFEND%'",
  ];
  const params: (string | number)[] = [];
  if (character) { conditions.push('r.character = ?'); params.push(character); }
  if (buildId)   { conditions.push('r.build_id = ?');  params.push(buildId); }

  const rows = db.prepare(`
    SELECT
      cc.card_id,
      COUNT(DISTINCT CASE WHEN r.win = 1 THEN cc.run_id END) * 100.0 /
        NULLIF(COUNT(DISTINCT cc.run_id), 0) AS win_rate
    FROM card_choices cc
    JOIN runs r ON r.id = cc.run_id
    WHERE ${conditions.join(' AND ')}
    GROUP BY cc.card_id
  `).all(...params) as { card_id: string; win_rate: number }[];

  return new Map(rows.map(r => [r.card_id, Math.round(Number(r.win_rate) * 10) / 10]));
}

export default router;
