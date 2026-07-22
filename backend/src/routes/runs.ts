import { Router, Request, Response } from 'express';
import fs from 'fs';
import { getDb, getRuns, getRunCount } from '../db';
import { type AuthRequest } from '../middleware/auth';

type RunRecord = { file_path: string; win: number; character: string; ascension: number; raw_json: string | null; user_id: number };

const router = Router();

// ── List runs ──────────────────────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { character, buildId, limit, offset, scope } = req.query;

  const filters: { character?: string; buildId?: string; limit?: number; offset?: number; userId?: number } = {};
  // Default scope is mine — users see their own runs
  if (scope !== 'global') filters.userId = req.userId;
  if (typeof character === 'string' && character) filters.character = character;
  if (typeof buildId === 'string' && buildId) filters.buildId = buildId;
  if (typeof limit === 'string') filters.limit = parseInt(limit, 10);
  if (typeof offset === 'string') filters.offset = parseInt(offset, 10);

  const runs = getRuns(db, filters);
  const total = getRunCount(db, { character: filters.character, buildId: filters.buildId, userId: filters.userId });

  res.json({ runs, total });
});

// ── Run details (rule-based insights) ─────────────────────────────────────

router.get('/:id/details', (req: Request, res: Response) => {
  const db = getDb();
  const runRow = db.prepare('SELECT * FROM runs WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as RunRecord | undefined;

  if (!runRow) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  const raw = getRawJson(runRow);
  if (!raw) {
    res.status(500).json({ error: 'Could not read run data' });
    return;
  }

  const data = JSON.parse(raw) as RunFile;
  res.json(extractRunDetails(data, runRow.file_path));
});

export default router;

// ── Helpers ────────────────────────────────────────────────────────────────

function getRawJson(runRow: RunRecord): string | null {
  if (runRow.raw_json) return runRow.raw_json;
  // Fallback: read from filesystem (pre-v5 rows)
  try {
    return fs.readFileSync(runRow.file_path, 'utf-8');
  } catch {
    return null;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface CardEntry {
  card: { id: string };
  was_picked: boolean;
}

interface PlayerStats {
  card_choices?: CardEntry[];
  damage_taken?: number;
  current_hp?: number;
  max_hp?: number;
  relics?: Array<{ id: string } | string>;
}

interface MapPoint {
  map_point_type?: string;
  player_stats?: PlayerStats[];
}

interface RunFile {
  win?: boolean;
  ascension?: number;
  game_mode?: string;
  build_id?: string;
  killed_by_encounter?: string;
  killed_by_event?: string;
  acts?: string[];
  players?: Array<{
    character?: string;
    deck?: Array<{ id: string }>;
    relics?: Array<{ id: string } | string>;
  }>;
  map_point_history?: MapPoint[][];
}

export interface ActStats {
  act: string;
  floors: number;
  damage: number;
  elite_count: number;
  elite_damage: number;
  rest_count: number;
}

export interface RunDetails {
  win: boolean;
  character: string;
  ascension: number;
  floor_reached: number;
  killed_by: string | null;
  total_damage_taken: number;
  damage_per_act: { act: string; damage: number }[];
  act_stats: ActStats[];
  card_offers: number;
  cards_picked: number;
  final_deck_size: number;
  final_deck: { id: string; upgraded: boolean }[];
  relics: string[];
  acts: string[];
  build_id: string | null;
  insights: string[];
}

// ── Extraction ─────────────────────────────────────────────────────────────

const CHARACTER_NAMES = ['IRONCLAD', 'SILENT', 'DEFECT', 'WATCHER', 'NECROBINDER', 'REGENT'];

function formatId(raw: string, prefix: string): string {
  const stripped = raw.replace(new RegExp(`^${prefix}\\.`), '');
  const parts = stripped.split('_');
  const filtered = (prefix === 'CARD' && (parts[0] === 'STRIKE' || parts[0] === 'DEFEND'))
    ? parts.filter(p => !CHARACTER_NAMES.includes(p))
    : parts;
  return filtered
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function extractRunDetails(data: RunFile, _filePath: string): RunDetails {
  const win = data.win === true;
  const character = formatId(data.players?.[0]?.character ?? 'UNKNOWN', 'CHARACTER');
  const ascension = data.ascension ?? 0;
  const acts = (data.acts ?? []).map(a => formatId(a, 'ACT'));

  const killedByRaw = data.killed_by_encounter ?? 'NONE.NONE';
  const killedByEvent = data.killed_by_event ?? 'NONE.NONE';
  const killed_by =
    killedByRaw !== 'NONE.NONE' ? formatId(killedByRaw, 'ENCOUNTER') :
    killedByEvent !== 'NONE.NONE' ? formatId(killedByEvent, 'EVENT') :
    null;

  let totalDamage = 0;
  let cardOffers = 0;
  let cardsPicked = 0;
  let floorReached = 0;
  const damagePerAct: { act: string; damage: number }[] = [];
  const actStats: ActStats[] = [];

  const actNames = data.acts ?? [];
  for (let i = 0; i < (data.map_point_history ?? []).length; i++) {
    const act = (data.map_point_history ?? [])[i];
    const actLabel = actNames[i]
      ? `Act ${i + 1} (${formatId(actNames[i], 'ACT')})`
      : `Act ${i + 1}`;
    let actDamage = 0;
    let eliteCount = 0;
    let eliteDamage = 0;
    let restCount = 0;
    let actFloors = 0;

    for (const point of act) {
      floorReached++;
      actFloors++;
      const type = point.map_point_type ?? '';
      const isElite = type === 'elite';
      const isRest = type === 'rest';

      for (const ps of point.player_stats ?? []) {
        const dmg = ps.damage_taken ?? 0;
        actDamage += dmg;
        if (isElite) eliteDamage += dmg;
        for (const cc of ps.card_choices ?? []) {
          cardOffers++;
          if (cc.was_picked) cardsPicked++;
        }
      }
      if (isElite) eliteCount++;
      if (isRest) restCount++;
    }

    totalDamage += actDamage;
    damagePerAct.push({ act: actLabel, damage: actDamage });
    actStats.push({
      act: actLabel,
      floors: actFloors,
      damage: actDamage,
      elite_count: eliteCount,
      elite_damage: eliteDamage,
      rest_count: restCount,
    });
  }

  const player = data.players?.[0];
  const finalDeckSize = player?.deck?.length ?? 0;
  const finalDeck: { id: string; upgraded: boolean }[] = (player?.deck ?? []).map((c: { id?: string; current_upgrade_level?: number }) => {
    const raw = c.id ?? '';
    const id = raw.startsWith('CARD.') ? raw : `CARD.${raw}`;
    return { id, upgraded: (c.current_upgrade_level ?? 0) >= 1 };
  });
  const relics = (player?.relics ?? []).map(r =>
    formatId(typeof r === 'string' ? r : r.id, 'RELIC')
  );

  const insights = buildInsights({
    win, killed_by, floorReached, totalDamage,
    actStats, cardOffers, cardsPicked, finalDeckSize,
    finalDeck: finalDeck.map(c => c.id), relics, ascension, acts,
  });

  return {
    win, character, ascension, floor_reached: floorReached,
    killed_by, total_damage_taken: totalDamage,
    damage_per_act: damagePerAct,
    act_stats: actStats,
    card_offers: cardOffers, cards_picked: cardsPicked,
    final_deck_size: finalDeckSize, final_deck: finalDeck, relics, acts,
    build_id: data.build_id ?? null,
    insights,
  };
}

function buildInsights(p: {
  win: boolean;
  killed_by: string | null;
  floorReached: number;
  totalDamage: number;
  actStats: ActStats[];
  cardOffers: number;
  cardsPicked: number;
  finalDeckSize: number;
  finalDeck: string[];
  relics: string[];
  ascension: number;
  acts: string[];
}): string[] {
  const list: string[] = [];

  if (p.win) {
    list.push(`Won on floor ${p.floorReached} after ${p.acts.length} act${p.acts.length !== 1 ? 's' : ''}.`);
  } else {
    const where = p.killed_by ? `to ${p.killed_by}` : 'on floor ' + p.floorReached;
    list.push(`Died ${where} (floor ${p.floorReached}).`);
  }

  // Last act granular damage insight
  const lastAct = p.actStats[p.actStats.length - 1];
  if (lastAct && lastAct.floors > 0) {
    const dmgPerFloor = Math.round(lastAct.damage / lastAct.floors);
    list.push(`${lastAct.act}: took ${lastAct.damage} damage (${dmgPerFloor}/floor).`);

    if (lastAct.elite_count > 0) {
      const dmgPerElite = Math.round(lastAct.elite_damage / lastAct.elite_count);
      list.push(`Visited ${lastAct.elite_count} elite${lastAct.elite_count !== 1 ? 's' : ''} on ${lastAct.act} — took ${lastAct.elite_damage} damage total (avg ${dmgPerElite}/elite).`);
    } else {
      list.push(`Skipped all elites in ${lastAct.act}.`);
    }

    if (lastAct.rest_count > 0)
      list.push(`Used ${lastAct.rest_count} rest site${lastAct.rest_count !== 1 ? 's' : ''} in ${lastAct.act}.`);
    else
      list.push(`No rest sites used in ${lastAct.act}.`);
  }


  return list;
}

