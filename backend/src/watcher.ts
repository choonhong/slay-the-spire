import chokidar from 'chokidar';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { parseRunFile } from './parser';
import { getDb, isRunParsed, getRunCount } from './db';
import type { DatabaseSync } from 'node:sqlite';
import { loadConfig, saveConfig } from './config';

export function getSavesPath(): string {
  const cfg = loadConfig();
  if (cfg.savesPath) return cfg.savesPath;
  if (process.env.STS2_SAVES_PATH) return process.env.STS2_SAVES_PATH;

  // Default Mac path — recursive search finds profile*/saves/current_run.save and history/*.run
  return path.join(os.homedir(), 'Library', 'Application Support', 'SlayTheSpire2');
}

/** Same key shape as POST /upload/runs so watcher + manual upload share UNIQUE(user_id, file_path). */
export function runStorageKey(userId: number, diskPath: string): string {
  return `user:${userId}:${path.basename(diskPath)}`;
}

/** User that receives auto-imported runs (config only — set via auth / Settings). */
export function getWatcherUserId(): number | null {
  const cfg = loadConfig();
  return cfg.watcherUserId ?? null;
}

/**
 * Bind the local disk watcher to the signed-in UUID user.
 * Restarts the watcher when the owner changes.
 */
export function claimWatcherUser(userId: number): void {
  const cfg = loadConfig();
  if (cfg.watcherUserId === userId) return;
  saveConfig({ ...cfg, watcherUserId: userId });
  console.log(`[watcher] Claimed by user_id=${userId}`);
  stopWatcher();
  void startWatcher();
}

let watcher: ReturnType<typeof chokidar.watch> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function isRunAlreadyImported(db: DatabaseSync, userId: number, diskPath: string): boolean {
  return isRunParsed(db, userId, runStorageKey(userId, diskPath));
}

/** Remove absolute-path watcher dupes that already exist as user:<id>:<filename>. */
export function cleanupDuplicateDiskImports(userId?: number): number {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, user_id, file_path FROM runs
    WHERE file_path LIKE '/%'
      AND (? IS NULL OR user_id = ?)
  `).all(userId ?? null, userId ?? null) as Array<{ id: number; user_id: number; file_path: string }>;

  let deleted = 0;
  const del = db.prepare('DELETE FROM runs WHERE id = ?');
  for (const row of rows) {
    const key = runStorageKey(row.user_id, row.file_path);
    if (isRunParsed(db, row.user_id, key)) {
      del.run(row.id);
      deleted++;
    }
  }
  if (deleted > 0) {
    console.log(`[watcher] Removed ${deleted} duplicate disk import(s)`);
  }
  return deleted;
}

export async function startWatcher(): Promise<void> {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (watcher) {
    await watcher.close();
    watcher = null;
  }

  // Drop absolute-path dupes for every user (legacy watcher keys vs upload keys)
  cleanupDuplicateDiskImports();

  const savesPath = getSavesPath();
  const userId = getWatcherUserId();

  if (userId == null) {
    console.log('[watcher] No claimed user yet — will retry in 15s (open the app once to bind your UUID)');
    retryTimer = setTimeout(() => { void startWatcher(); }, 15_000);
    return;
  }

  if (!fs.existsSync(savesPath)) {
    console.log(`[watcher] Saves path does not exist yet: ${savesPath}`);
    console.log('[watcher] Will retry in 30s...');
    retryTimer = setTimeout(() => { void startWatcher(); }, 30_000);
    return;
  }

  console.log(`[watcher] Watching: ${savesPath} (user_id=${userId})`);

  await parseExistingRuns(savesPath, userId);

  watcher = chokidar.watch(`${savesPath}/**/*.run`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
  });

  watcher.on('add', (filePath) => {
    importRunFromDisk(filePath, userId);
  });

  watcher.on('change', (filePath) => {
    // Only import if not already present (uploads / prior watch)
    importRunFromDisk(filePath, userId);
  });

  watcher.on('error', (err) => {
    console.error('[watcher] Error:', err);
  });
}

function importRunFromDisk(filePath: string, userId: number): void {
  const db = getDb();
  if (isRunAlreadyImported(db, userId, filePath)) return;
  const key = runStorageKey(userId, filePath);
  console.log(`[watcher] New run: ${path.basename(filePath)}`);
  const result = parseRunFile(filePath, userId, key);
  if (result) {
    console.log(
      `[watcher] Parsed: ${result.character} | win=${result.win} | offers=${result.totalOffers}`
    );
  }
}

export function stopWatcher(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}

async function parseExistingRuns(savesPath: string, userId: number): Promise<void> {
  const db: DatabaseSync = getDb();
  const before = getRunCount(db, { userId });

  const runFiles = findRunFiles(savesPath);
  console.log(`[watcher] Found ${runFiles.length} .run files, parsing new ones...`);

  let parsed = 0;
  let skipped = 0;

  for (const filePath of runFiles) {
    if (isRunAlreadyImported(db, userId, filePath)) {
      skipped++;
      continue;
    }
    const result = parseRunFile(filePath, userId, runStorageKey(userId, filePath));
    if (result) parsed++;
  }

  const after = getRunCount(db, { userId });
  console.log(
    `[watcher] Startup complete: ${parsed} new, ${skipped} cached, ${after} total runs for user (was ${before})`
  );
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

/** Recursively find current_run.save under the saves root. */
export function findCurrentRunSavePath(dir: string = getSavesPath()): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === 'current_run.save') return full;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findCurrentRunSavePath(path.join(dir, entry.name));
      if (found) return found;
    }
  }
  return null;
}
