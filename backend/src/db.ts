import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '../../data/sts2.db');

// Bump this whenever the schema changes — DB will be wiped and rebuilt from .run files
// Note: additive column migrations below do NOT require a wipe.
const SCHEMA_VERSION = 10;

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
    // Only wipe on major schema breaks (pre-v10). v10+ uses additive migrations.
    if (currentVersion < 9) {
      console.log(`[db] Schema version ${currentVersion} → ${SCHEMA_VERSION}, rebuilding tables...`);
      db.exec(`
        DROP TABLE IF EXISTS card_choices;
        DROP TABLE IF EXISTS ancient_picks;
        DROP TABLE IF EXISTS runs;
      `);
    } else {
      console.log(`[db] Schema version ${currentVersion} → ${SCHEMA_VERSION}`);
    }
    db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)").run(
      String(SCHEMA_VERSION)
    );
  }

  // users table is never dropped on schema migration — preserve accounts
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
      file_path      TEXT NOT NULL,
      character      TEXT,
      win            INTEGER DEFAULT 0,
      ascension      INTEGER DEFAULT 0,
      game_mode      TEXT,
      acts           TEXT,
      build_id       TEXT,
      floor_reached  INTEGER DEFAULT 0,
      killed_by      TEXT,
      start_time     INTEGER,
      parsed_at      TEXT,
      raw_json       TEXT,
      UNIQUE(user_id, file_path)
    );

    CREATE TABLE IF NOT EXISTS card_choices (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id        INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      card_id       TEXT NOT NULL,
      was_picked    INTEGER NOT NULL DEFAULT 0,
      offer_index   INTEGER NOT NULL DEFAULT 0,
      upgrade_level INTEGER NOT NULL DEFAULT 0
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

  // Additive: start_time on existing DBs created before v10
  const runCols = db.prepare('PRAGMA table_info(runs)').all() as Array<{ name: string }>;
  if (!runCols.some(c => c.name === 'start_time')) {
    console.log('[db] Adding start_time column to runs…');
    db.exec('ALTER TABLE runs ADD COLUMN start_time INTEGER');
  }
  backfillStartTimes(db);
}

/** Fill start_time from raw_json.start_time or filename epoch for existing rows. */
function backfillStartTimes(db: DatabaseSync): void {
  const rows = db.prepare(
    'SELECT id, file_path, raw_json FROM runs WHERE start_time IS NULL'
  ).all() as Array<{ id: number; file_path: string; raw_json: string | null }>;
  if (rows.length === 0) return;

  const update = db.prepare('UPDATE runs SET start_time = ? WHERE id = ?');
  let filled = 0;
  for (const row of rows) {
    let start: number | null = null;
    if (row.raw_json) {
      try {
        const data = JSON.parse(row.raw_json) as { start_time?: number };
        if (typeof data.start_time === 'number' && data.start_time > 0) {
          start = data.start_time;
        }
      } catch { /* ignore */ }
    }
    if (start == null) {
      const m = row.file_path.match(/(\d+)\.run$/);
      if (m) start = Number(m[1]);
    }
    if (start != null) {
      update.run(start, row.id);
      filled++;
    }
  }
  if (filled > 0) console.log(`[db] Backfilled start_time for ${filled} runs`);
}

export interface RunRow {
  id: number;
  user_id: number;
  file_path: string;
  character: string;
  win: number;
  ascension: number;
  game_mode: string;
  acts: string;
  build_id: string | null;
  floor_reached: number;
  killed_by: string | null;
  start_time: number | null;
  parsed_at: string;
}

export interface CardStat {
  card_id: string;
  runs_with_card: number;
  runs_won_with_card: number;
  win_rate: number;
}

export function upsertRun(
  db: DatabaseSync,
  userId: number,
  filePath: string,
  character: string,
  win: boolean,
  ascension: number,
  gameMode: string,
  acts: string[],
  buildId: string | null,
  floorReached: number,
  killedBy: string | null,
  rawJson: string,
  startTime: number | null = null
): number {
  const existing = db.prepare('SELECT id FROM runs WHERE user_id = ? AND file_path = ?').get(userId, filePath) as
    | { id: number }
    | undefined;

  if (existing) {
    db.prepare(`
      UPDATE runs SET character=?, win=?, ascension=?, game_mode=?, acts=?, build_id=?,
        floor_reached=?, killed_by=?, start_time=?, parsed_at=?, raw_json=?
      WHERE id=?
    `).run(
      character, win ? 1 : 0, ascension, gameMode,
      JSON.stringify(acts), buildId, floorReached, killedBy, startTime,
      new Date().toISOString(), rawJson, existing.id
    );
    db.prepare('DELETE FROM card_choices WHERE run_id = ?').run(existing.id);
    db.prepare('DELETE FROM ancient_picks WHERE run_id = ?').run(existing.id);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO runs (user_id, file_path, character, win, ascension, game_mode, acts, build_id,
      floor_reached, killed_by, start_time, parsed_at, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, filePath, character, win ? 1 : 0, ascension, gameMode,
    JSON.stringify(acts), buildId, floorReached, killedBy, startTime,
    new Date().toISOString(), rawJson
  );
  return Number(result.lastInsertRowid);
}

export function insertCardChoices(
  db: DatabaseSync,
  runId: number,
  choices: Array<{ card_id: string; was_picked: boolean; offer_index: number; upgrade_level?: number }>
): void {
  const stmt = db.prepare(
    'INSERT INTO card_choices (run_id, card_id, was_picked, offer_index, upgrade_level) VALUES (?, ?, ?, ?, ?)'
  );
  db.exec('BEGIN');
  try {
    for (const c of choices) {
      stmt.run(runId, c.card_id, c.was_picked ? 1 : 0, c.offer_index, c.upgrade_level ?? 0);
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

// reliability weight: asc 0 → 0.3, asc 7+ → 1.0 (linear, +0.1 per level)
const ASC_WEIGHT_EXPR = `CASE WHEN r.ascension >= 7 THEN 1.0 ELSE 0.3 + r.ascension * 0.1 END`;

export function getCardStats(
  db: DatabaseSync,
  filters: { character?: string; ascension?: number; gameMode?: string; buildId?: string; colorless?: boolean; weighted?: boolean; userId?: number } = {}
): CardStat[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.userId !== undefined) {
    conditions.push('r.user_id = ?');
    params.push(filters.userId);
  }
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

  // Weighted mode: ascension-adjusted win rate (asc 0 = 50% weight, asc 7+ = 100% weight)
  const winRateCols = filters.weighted
    ? `
      -- weighted win rate: each run's win is weighted by ascension reliability
      ROUND(
        SUM(CASE WHEN cc.offer_index = -1 AND r.win = 1 THEN (${ASC_WEIGHT_EXPR}) ELSE 0 END) * 100.0 /
        NULLIF(SUM(CASE WHEN cc.offer_index = -1 THEN (${ASC_WEIGHT_EXPR}) ELSE 0 END), 0), 1
      )                                                                                         AS weighted_win_rate,
      COUNT(DISTINCT CASE WHEN cc.offer_index = -1 THEN cc.run_id END)                        AS runs_with_card,
      COUNT(DISTINCT CASE WHEN cc.offer_index = -1 AND r.win = 1 THEN cc.run_id END)          AS runs_won_with_card`
    : `
      COUNT(DISTINCT CASE WHEN cc.offer_index = -1 THEN cc.run_id END)                        AS runs_with_card,
      COUNT(DISTINCT CASE WHEN cc.offer_index = -1 AND r.win = 1 THEN cc.run_id END)          AS runs_won_with_card`;

  const rows = db.prepare(`
    SELECT
      cc.card_id,
      ${winRateCols}
    FROM card_choices cc
    JOIN runs r ON r.id = cc.run_id
    ${where}
    ${colorlessSubquery}
    GROUP BY cc.card_id
    ORDER BY runs_with_card DESC
  `).all(...params) as (Omit<CardStat, 'win_rate'> & { weighted_win_rate?: number })[];

  return rows.map(row => ({
    ...row,
    runs_with_card: Number(row.runs_with_card),
    runs_won_with_card: Number(row.runs_won_with_card),
    win_rate: filters.weighted && row.weighted_win_rate != null
      ? Number(row.weighted_win_rate)
      : Number(row.runs_with_card) > 0
        ? Math.round((Number(row.runs_won_with_card) / Number(row.runs_with_card)) * 1000) / 10
        : 0,
  }));
}

export function getRuns(
  db: DatabaseSync,
  filters: { character?: string; buildId?: string; limit?: number; offset?: number; userId?: number } = {}
): RunRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.userId !== undefined) {
    conditions.push('user_id = ?');
    params.push(filters.userId);
  }
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
    ORDER BY COALESCE(start_time, 0) DESC, parsed_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as unknown as RunRow[];
}

export function getRunCount(db: DatabaseSync, filters: { character?: string; buildId?: string; userId?: number } = {}): number {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.userId !== undefined) {
    conditions.push('user_id = ?');
    params.push(filters.userId);
  }
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

export function getCharacters(db: DatabaseSync, userId?: number): string[] {
  if (userId !== undefined) {
    const rows = db.prepare('SELECT DISTINCT character FROM runs WHERE user_id = ? ORDER BY character').all(userId) as { character: string }[];
    return rows.map(r => r.character).filter(Boolean);
  }
  const rows = db.prepare('SELECT DISTINCT character FROM runs ORDER BY character').all() as {
    character: string;
  }[];
  return rows.map(r => r.character).filter(Boolean);
}

export function getBuildIds(db: DatabaseSync, userId?: number): string[] {
  if (userId !== undefined) {
    const rows = db.prepare(
      "SELECT DISTINCT build_id FROM runs WHERE user_id = ? AND build_id IS NOT NULL ORDER BY build_id DESC"
    ).all(userId) as { build_id: string }[];
    return rows.map(r => r.build_id);
  }
  const rows = db.prepare(
    "SELECT DISTINCT build_id FROM runs WHERE build_id IS NOT NULL ORDER BY build_id DESC"
  ).all() as { build_id: string }[];
  return rows.map(r => r.build_id);
}

export function isRunParsed(db: DatabaseSync, userId: number, filePath: string): boolean {
  const row = db.prepare('SELECT id FROM runs WHERE user_id = ? AND file_path = ?').get(userId, filePath);
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
  filters: { character?: string; buildId?: string; userId?: number } = {}
): AncientStat[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.userId !== undefined) {
    conditions.push('r.user_id = ?');
    params.push(filters.userId);
  }
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
