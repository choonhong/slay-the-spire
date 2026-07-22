import type { DatabaseSync } from 'node:sqlite';

export interface PaceBucket {
  avg: number;
  n: number;
}

export interface CombatPace {
  monster: PaceBucket;
  elite: PaceBucket;
  boss: PaceBucket;
  runs: number;
}

interface RoomEntry {
  room_type?: string;
  turns_taken?: number;
}

interface MapPoint {
  map_point_type?: string;
  rooms?: RoomEntry[];
}

function emptyBucket(): PaceBucket {
  return { avg: 0, n: 0 };
}

function avg(vals: number[]): PaceBucket {
  if (vals.length === 0) return emptyBucket();
  const sum = vals.reduce((a, b) => a + b, 0);
  return { avg: Math.round((sum / vals.length) * 10) / 10, n: vals.length };
}

/** Collect fight clear times from a single run's raw_json. */
export function turnsFromRawJson(raw: string): { type: 'monster' | 'elite' | 'boss'; turns: number }[] {
  let data: { map_point_history?: MapPoint[][] };
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const out: { type: 'monster' | 'elite' | 'boss'; turns: number }[] = [];
  for (const act of data.map_point_history ?? []) {
    for (const point of act ?? []) {
      for (const room of point.rooms ?? []) {
        const type = room.room_type ?? point.map_point_type;
        const turns = room.turns_taken;
        if (type !== 'monster' && type !== 'elite' && type !== 'boss') continue;
        if (typeof turns !== 'number' || turns <= 0) continue;
        out.push({ type, turns });
      }
    }
  }
  return out;
}

/**
 * Average turns to clear monster / elite / boss fights from imported runs.
 * Lower ≈ stronger damage. Optional character + user filters.
 */
export function getCombatPace(
  db: DatabaseSync,
  opts: { character?: string; userId?: number } = {},
): CombatPace {
  const conditions: string[] = ['raw_json IS NOT NULL'];
  const params: (string | number)[] = [];
  if (opts.character) {
    conditions.push('character = ?');
    params.push(opts.character);
  }
  if (opts.userId !== undefined) {
    conditions.push('user_id = ?');
    params.push(opts.userId);
  }

  const rows = db.prepare(
    `SELECT raw_json FROM runs WHERE ${conditions.join(' AND ')}`,
  ).all(...params) as { raw_json: string }[];

  const buckets: Record<'monster' | 'elite' | 'boss', number[]> = {
    monster: [],
    elite: [],
    boss: [],
  };

  for (const row of rows) {
    for (const fight of turnsFromRawJson(row.raw_json)) {
      buckets[fight.type].push(fight.turns);
    }
  }

  return {
    monster: avg(buckets.monster),
    elite: avg(buckets.elite),
    boss: avg(buckets.boss),
    runs: rows.length,
  };
}
