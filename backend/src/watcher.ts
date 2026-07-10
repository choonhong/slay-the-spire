import chokidar from 'chokidar';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { parseRunFile } from './parser';
import { getDb, isRunParsed, getRunCount } from './db';
import type { DatabaseSync } from 'node:sqlite';
import { loadConfig } from './config';

export function getSavesPath(): string {
  const cfg = loadConfig();
  if (cfg.savesPath) return cfg.savesPath;

  // Default Mac path
  const defaultPath = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'SlayTheSpire2'
  );
  return defaultPath;
}

let watcher: ReturnType<typeof chokidar.watch> | null = null;

export async function startWatcher(): Promise<void> {
  const savesPath = getSavesPath();

  if (!fs.existsSync(savesPath)) {
    console.log(`[watcher] Saves path does not exist yet: ${savesPath}`);
    console.log('[watcher] Will retry in 30s...');
    setTimeout(startWatcher, 30_000);
    return;
  }

  console.log(`[watcher] Watching: ${savesPath}`);

  // Parse all existing run files on startup
  await parseExistingRuns(savesPath);

  watcher = chokidar.watch(`${savesPath}/**/*.run`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
  });

  watcher.on('add', (filePath) => {
    console.log(`[watcher] New run: ${path.basename(filePath)}`);
    const result = parseRunFile(filePath);
    if (result) {
      console.log(
        `[watcher] Parsed: ${result.character} | win=${result.win} | offers=${result.totalOffers}`
      );
    }
  });

  watcher.on('change', (filePath) => {
    console.log(`[watcher] Updated run: ${path.basename(filePath)}`);
    parseRunFile(filePath);
  });

  watcher.on('error', (err) => {
    console.error('[watcher] Error:', err);
  });
}

export function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

async function parseExistingRuns(savesPath: string): Promise<void> {
  const db: DatabaseSync = getDb();
  const before = getRunCount(db);

  // Find all .run files
  const runFiles = findRunFiles(savesPath);
  console.log(`[watcher] Found ${runFiles.length} .run files, parsing new ones...`);

  let parsed = 0;
  let skipped = 0;

  for (const filePath of runFiles) {
    if (isRunParsed(db, filePath)) {
      skipped++;
      continue;
    }
    const result = parseRunFile(filePath);
    if (result) parsed++;
  }

  const after = getRunCount(db);
  console.log(`[watcher] Startup complete: ${parsed} new, ${skipped} cached, ${after} total runs in DB`);

  // Backfill: repair runs that have raw_json but no card_choices (parser failure)
  backfillMissingChoices(db);
}

function backfillMissingChoices(db: DatabaseSync): void {
  const { insertCardChoices } = require('./db');

  const orphaned = (db.prepare(`
    SELECT r.id, r.raw_json
    FROM runs r
    LEFT JOIN card_choices cc ON cc.run_id = r.id
    WHERE cc.id IS NULL AND r.raw_json IS NOT NULL
  `) as { all: () => Array<{ id: number; raw_json: string }> }).all();

  if (orphaned.length === 0) return;
  console.log(`[watcher] Backfilling card_choices for ${orphaned.length} run(s) missing data...`);

  for (const row of orphaned) {
    try {
      const data = JSON.parse(row.raw_json);
      const offerEvents: Array<Array<{ card: { id: string }; was_picked: boolean }>> = [];
      for (const act of data.map_point_history ?? []) {
        for (const point of act) {
          for (const ps of point.player_stats ?? []) {
            if (ps.card_choices?.length > 0) offerEvents.push(ps.card_choices);
          }
        }
      }
      const choices: Array<{ card_id: string; was_picked: boolean; offer_index: number; upgrade_level?: number }> = [];
      offerEvents.forEach((offer, offerIndex) => {
        for (const entry of offer) {
          if (!entry.card?.id) continue;
          choices.push({ card_id: entry.card.id, was_picked: entry.was_picked === true, offer_index: offerIndex });
        }
      });
      for (const card of (data.players?.[0]?.deck ?? [])) {
        if (!card.id) continue;
        choices.push({ card_id: card.id, was_picked: true, offer_index: -1, upgrade_level: card.current_upgrade_level ?? 0 });
      }
      insertCardChoices(db, row.id, choices);
      console.log(`[watcher] Backfilled run ${row.id}: ${choices.length} choices`);
    } catch (e) {
      console.error(`[watcher] Backfill failed for run ${row.id}:`, e);
    }
  }
}

function findRunFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRunFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.run')) {
      results.push(fullPath);
    }
  }
  return results;
}
