import fs from 'fs';
import { getDb, upsertRun, insertCardChoices, insertAncientPicks } from './db';

interface CardEntry {
  card: { id: string; floor_added_to_deck?: number };
  was_picked: boolean;
}

interface AncientChoiceEntry {
  TextKey: string;
  was_chosen: boolean;
}

interface GainedCardEntry {
  id: string;
}

interface PlayerStats {
  card_choices?: CardEntry[];
  ancient_choice?: AncientChoiceEntry[];
  cards_gained?: GainedCardEntry[];
  [key: string]: unknown;
}

interface RoomEntry {
  model_id?: string;
  room_type?: string;
}

interface MapPoint {
  map_point_type?: string;
  player_stats?: PlayerStats[];
  rooms?: RoomEntry[];
}

interface RunFile {
  win?: boolean;
  was_abandoned?: boolean;
  ascension?: number;
  game_mode?: string;
  acts?: string[];
  build_id?: string;
  start_time?: number;
  run_time?: number;
  killed_by_encounter?: string;
  killed_by_event?: string;
  players?: Array<{ character?: string; deck?: Array<{ id: string; current_upgrade_level?: number }> }>;
  map_point_history?: MapPoint[][];
}

function extractStartTime(data: RunFile, filePath: string): number | null {
  if (typeof data.start_time === 'number' && data.start_time > 0) {
    return data.start_time;
  }
  // Fallback: STS2 names history files as <unix_epoch>.run
  const m = filePath.match(/(\d+)\.run$/);
  return m ? Number(m[1]) : null;
}

export interface ParseResult {
  filePath: string;
  character: string;
  win: boolean;
  ascension: number;
  buildId: string | null;
  floorReached: number;
  killedBy: string | null;
  totalOffers: number;
}

function formatKilledBy(raw: string): string | null {
  if (!raw || raw === 'NONE.NONE') return null;
  return raw
    .replace(/^(ENCOUNTER|EVENT)\./, '')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function parseRunFile(filePath: string, userId = 1): ParseResult | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    console.error(`[parser] Cannot read file: ${filePath}`);
    return null;
  }
  return parseRunJson(raw, filePath, userId);
}

export function parseRunJson(raw: string, filePath: string, userId: number): ParseResult | null {
  let data: RunFile;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`[parser] Invalid JSON: ${filePath}`);
    return null;
  }

  const character = data.players?.[0]?.character ?? 'UNKNOWN';
  const win = data.win === true;
  const ascension = data.ascension ?? 0;
  const gameMode = data.game_mode ?? 'standard';
  const acts = data.acts ?? [];
  const buildId = data.build_id ?? null;

  const killedBy =
    formatKilledBy(data.killed_by_encounter ?? '') ??
    formatKilledBy(data.killed_by_event ?? '');

  // Floor = total map points visited
  let floorReached = 0;
  const offerEvents: CardEntry[][] = [];
  const ancientPicks: Array<{ event_name: string; is_neow: boolean; relic_id: string }> = [];

  for (const act of data.map_point_history ?? []) {
    for (const point of act) {
      floorReached++;
      const roomModelId = point.rooms?.[0]?.model_id ?? '';

      for (const ps of point.player_stats ?? []) {
        if (ps.card_choices && ps.card_choices.length > 0) {
          offerEvents.push(ps.card_choices);
        }

        // Extract ancient relic choices (Neow + other ancient events)
        if (point.map_point_type === 'ancient' && ps.ancient_choice) {
          const chosen = ps.ancient_choice.find(c => c.was_chosen);
          if (chosen?.TextKey) {
            const rawName = roomModelId.replace(/^EVENT\./, '');
            ancientPicks.push({
              event_name: rawName || 'UNKNOWN',
              is_neow: rawName === 'NEOW',
              relic_id: chosen.TextKey,
            });
          }
        }
      }
    }
  }

  const startTime = extractStartTime(data, filePath);

  const db = getDb();
  const runId = upsertRun(
    db, userId, filePath, character, win, ascension, gameMode,
    acts, buildId, floorReached, killedBy, raw, startTime
  );

  const flatChoices: Array<{ card_id: string; was_picked: boolean; offer_index: number; upgrade_level?: number }> = [];
  offerEvents.forEach((offer, offerIndex) => {
    for (const entry of offer) {
      if (!entry.card?.id) continue;
      flatChoices.push({ card_id: entry.card.id, was_picked: entry.was_picked === true, offer_index: offerIndex });
    }
  });

  // Final deck (offer_index = -1): one row per card copy in players[0].deck,
  // preserving upgrade_level. Win rate queries use COUNT(DISTINCT run_id) so
  // multiple copies of the same card in a run are handled correctly.
  for (const card of (data.players?.[0]?.deck ?? [])) {
    if (!card.id) continue;
    flatChoices.push({
      card_id: card.id,
      was_picked: true,
      offer_index: -1,
      upgrade_level: card.current_upgrade_level ?? 0,
    });
  }

  insertCardChoices(db, runId, flatChoices);
  if (ancientPicks.length > 0) {
    insertAncientPicks(db, runId, ancientPicks);
  }

  return { filePath, character, win, ascension, buildId, floorReached, killedBy, totalOffers: offerEvents.length };
}
