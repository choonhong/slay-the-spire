import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '../../data/sts2.db');

// Bump this whenever the schema changes — DB will be wiped and rebuilt from .run files
const SCHEMA_VERSION = 7;

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new DatabaseSync(DB_PATH);
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA foreign_keys = ON');
    ensureSchema(_db);
  }
  return _db;
}

function ensureSchema(db: DatabaseSync): void {
  // Create version table if missing
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
    | { value: string }
    | undefined;
  const currentVersion = row ? parseInt(row.value, 10) : 0;

  if (currentVersion !== SCHEMA_VERSION) {
    console.log(`[db] Schema version ${currentVersion} → ${SCHEMA_VERSION}, rebuilding tables...`);
    db.exec(`
      DROP TABLE IF EXISTS card_choices;
      DROP TABLE IF EXISTS ancient_picks;
      DROP TABLE IF EXISTS runs;
    `);
    db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)").run(
      String(SCHEMA_VERSION)
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path      TEXT UNIQUE NOT NULL,
      character      TEXT,
      win            INTEGER DEFAULT 0,
      ascension      INTEGER DEFAULT 0,
      game_mode      TEXT,
      acts           TEXT,
      build_id       TEXT,
      floor_reached  INTEGER DEFAULT 0,
      killed_by      TEXT,
      parsed_at      TEXT,
      raw_json       TEXT
    );

    CREATE TABLE IF NOT EXISTS card_choices (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      card_id     TEXT NOT NULL,
      was_picked  INTEGER NOT NULL DEFAULT 0,
      offer_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_card_choices_run_id ON card_choices(run_id);
    CREATE INDEX IF NOT EXISTS idx_card_choices_card_id ON card_choices(card_id);

    CREATE TABLE IF NOT EXISTS ancient_picks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      event_name  TEXT NOT NULL,
      is_neow     INTEGER NOT NULL DEFAULT 0,
      relic_id    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ancient_picks_run_id ON ancient_picks(run_id);
    CREATE INDEX IF NOT EXISTS idx_ancient_picks_relic_id ON ancient_picks(relic_id);
  `);
}

export interface RunRow {
  id: number;
  file_path: string;
  character: string;
  win: number;
  ascension: number;
  game_mode: string;
  acts: string;
  build_id: string | null;
  floor_reached: number;
  killed_by: string | null;
  parsed_at: string;
}

export interface CardStat {
  card_id: string;
  times_offered: number;
  times_picked: number;
  pick_rate: number;
  runs_with_card: number;
  runs_won_with_card: number;
  win_rate: number;
}

export function upsertRun(
  db: DatabaseSync,
  filePath: string,
  character: string,
  win: boolean,
  ascension: number,
  gameMode: string,
  acts: string[],
  buildId: string | null,
  floorReached: number,
  killedBy: string | null,
  rawJson: string
): number {
  const existing = db.prepare('SELECT id FROM runs WHERE file_path = ?').get(filePath) as
    | { id: number }
    | undefined;

  if (existing) {
    db.prepare(`
      UPDATE runs SET character=?, win=?, ascension=?, game_mode=?, acts=?, build_id=?,
        floor_reached=?, killed_by=?, parsed_at=?, raw_json=?
      WHERE file_path=?
    `).run(
      character, win ? 1 : 0, ascension, gameMode,
      JSON.stringify(acts), buildId, floorReached, killedBy,
      new Date().toISOString(), rawJson, filePath
    );
    db.prepare('DELETE FROM card_choices WHERE run_id = ?').run(existing.id);
    db.prepare('DELETE FROM ancient_picks WHERE run_id = ?').run(existing.id);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO runs (file_path, character, win, ascension, game_mode, acts, build_id,
      floor_reached, killed_by, parsed_at, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    filePath, character, win ? 1 : 0, ascension, gameMode,
    JSON.stringify(acts), buildId, floorReached, killedBy,
    new Date().toISOString(), rawJson
  );
  return Number(result.lastInsertRowid);
}

export function insertCardChoices(
  db: DatabaseSync,
  runId: number,
  choices: Array<{ card_id: string; was_picked: boolean; offer_index: number }>
): void {
  const stmt = db.prepare(
    'INSERT INTO card_choices (run_id, card_id, was_picked, offer_index) VALUES (?, ?, ?, ?)'
  );
  db.exec('BEGIN');
  try {
    for (const c of choices) {
      stmt.run(runId, c.card_id, c.was_picked ? 1 : 0, c.offer_index);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getColorlessCardIds(db: DatabaseSync): string[] {
  // Cards offered in runs from 2+ different characters are colorless/neutral
  const rows = db.prepare(`
    SELECT cc.card_id
    FROM card_choices cc
    JOIN runs r ON r.id = cc.run_id
    GROUP BY cc.card_id
    HAVING COUNT(DISTINCT r.character) >= 2
  `).all() as { card_id: string }[];
  return rows.map(r => r.card_id);
}

export function getCardStats(
  db: DatabaseSync,
  filters: { character?: string; ascension?: number; gameMode?: string; buildId?: string; colorless?: boolean } = {}
): CardStat[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.character) {
    conditions.push('r.character = ?');
    params.push(filters.character);
  }
  if (filters.ascension !== undefined) {
    conditions.push('r.ascension = ?');
    params.push(filters.ascension);
  }
  if (filters.gameMode) {
    conditions.push('r.game_mode = ?');
    params.push(filters.gameMode);
  }
  if (filters.buildId) {
    conditions.push('r.build_id = ?');
    params.push(filters.buildId);
  }

  const colorlessSubquery = filters.colorless
    ? `AND cc.card_id IN (
        SELECT card_id FROM card_choices cc2
        JOIN runs r2 ON r2.id = cc2.run_id
        GROUP BY cc2.card_id
        HAVING COUNT(DISTINCT r2.character) >= 2
      )`
    : '';

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      cc.card_id,
      -- pick rate counts only cards that appeared on a choice screen (offer_index >= 0)
      COUNT(CASE WHEN cc.offer_index >= 0 THEN 1 END)                                          AS times_offered,
      SUM(CASE WHEN cc.offer_index >= 0 THEN cc.was_picked ELSE 0 END)                        AS times_picked,
      ROUND(
        SUM(CASE WHEN cc.offer_index >= 0 THEN cc.was_picked ELSE 0 END) * 100.0 /
        NULLIF(COUNT(CASE WHEN cc.offer_index >= 0 THEN 1 END), 0), 1
      )                                                                                         AS pick_rate,
      -- win rate counts runs where card was in the final deck (offer_index = -1)
      COUNT(DISTINCT CASE WHEN cc.offer_index = -1 THEN cc.run_id END)                        AS runs_with_card,
      COUNT(DISTINCT CASE WHEN cc.offer_index = -1 AND r.win = 1 THEN cc.run_id END)          AS runs_won_with_card
    FROM card_choices cc
    JOIN runs r ON r.id = cc.run_id
    ${where}
    ${colorlessSubquery}
    GROUP BY cc.card_id
    ORDER BY times_offered DESC
  `).all(...params) as Omit<CardStat, 'win_rate'>[];

  return rows.map(row => ({
    ...row,
    times_offered: Number(row.times_offered),
    times_picked: Number(row.times_picked),
    pick_rate: Number(row.pick_rate),
    runs_with_card: Number(row.runs_with_card),
    runs_won_with_card: Number(row.runs_won_with_card),
    win_rate:
      Number(row.runs_with_card) > 0
        ? Math.round((Number(row.runs_won_with_card) / Number(row.runs_with_card)) * 1000) / 10
        : 0,
  }));
}

export function getRuns(
  db: DatabaseSync,
  filters: { character?: string; buildId?: string; limit?: number; offset?: number } = {}
): RunRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.character) {
    conditions.push('character = ?');
    params.push(filters.character);
  }
  if (filters.buildId) {
    conditions.push('build_id = ?');
    params.push(filters.buildId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  return db.prepare(`
    SELECT * FROM runs ${where}
    ORDER BY parsed_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as unknown as RunRow[];
}

export function getRunCount(db: DatabaseSync, filters: { character?: string; buildId?: string } = {}): number {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.character) {
    conditions.push('character = ?');
    params.push(filters.character);
  }
  if (filters.buildId) {
    conditions.push('build_id = ?');
    params.push(filters.buildId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const row = db.prepare(`SELECT COUNT(*) as count FROM runs ${where}`).get(...params) as { count: number };
  return Number(row.count);
}

export function getCharacters(db: DatabaseSync): string[] {
  const rows = db.prepare('SELECT DISTINCT character FROM runs ORDER BY character').all() as {
    character: string;
  }[];
  return rows.map(r => r.character).filter(Boolean);
}

export function getBuildIds(db: DatabaseSync): string[] {
  const rows = db.prepare(
    "SELECT DISTINCT build_id FROM runs WHERE build_id IS NOT NULL ORDER BY build_id DESC"
  ).all() as { build_id: string }[];
  return rows.map(r => r.build_id);
}

export function isRunParsed(db: DatabaseSync, filePath: string): boolean {
  const row = db.prepare('SELECT id FROM runs WHERE file_path = ?').get(filePath);
  return !!row;
}

export function insertAncientPicks(
  db: DatabaseSync,
  runId: number,
  picks: Array<{ event_name: string; is_neow: boolean; relic_id: string }>
): void {
  const stmt = db.prepare(
    'INSERT INTO ancient_picks (run_id, event_name, is_neow, relic_id) VALUES (?, ?, ?, ?)'
  );
  db.exec('BEGIN');
  try {
    for (const p of picks) {
      stmt.run(runId, p.event_name, p.is_neow ? 1 : 0, p.relic_id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export interface AncientStat {
  event_name: string;
  is_neow: number;
  relic_id: string;
  times_picked: number;
  wins: number;
  win_rate: number;
}

export function getAncientStats(
  db: DatabaseSync,
  filters: { character?: string; buildId?: string } = {}
): AncientStat[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.character) {
    conditions.push('r.character = ?');
    params.push(filters.character);
  }
  if (filters.buildId) {
    conditions.push('r.build_id = ?');
    params.push(filters.buildId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      ap.event_name,
      ap.is_neow,
      ap.relic_id,
      COUNT(DISTINCT ap.run_id) AS times_picked,
      SUM(r.win) AS wins,
      ROUND(SUM(r.win) * 100.0 / COUNT(DISTINCT ap.run_id), 1) AS win_rate
    FROM ancient_picks ap
    JOIN runs r ON r.id = ap.run_id
    ${where}
    GROUP BY ap.event_name, ap.relic_id
    ORDER BY ap.is_neow DESC, win_rate DESC, times_picked DESC
  `).all(...params) as unknown as AncientStat[];

  return rows.map(r => ({
    ...r,
    is_neow: Number(r.is_neow),
    times_picked: Number(r.times_picked),
    wins: Number(r.wins),
    win_rate: Number(r.win_rate),
  }));
}
