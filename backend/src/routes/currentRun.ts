import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getSavesPath } from '../watcher';

const router = Router();

// Character detection from card ID prefixes
const CARD_CHAR_MAP: Record<string, string> = {
  ironclad:    'CHARACTER.IRONCLAD',
  silent:      'CHARACTER.SILENT',
  defect:      'CHARACTER.DEFECT',
  watcher:     'CHARACTER.WATCHER',
  regent:      'CHARACTER.REGENT',
  necrobinder: 'CHARACTER.NECROBINDER',
};

function detectCharacter(cardIds: string[]): string | null {
  for (const id of cardIds) {
    const lower = id.toLowerCase();
    for (const [key, charId] of Object.entries(CARD_CHAR_MAP)) {
      if (lower.includes(key)) return charId;
    }
  }
  return null;
}

function findCurrentRunSave(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === 'current_run.save') return full;
    if (entry.isDirectory()) {
      const found = findCurrentRunSave(full);
      if (found) return found;
    }
  }
  return null;
}

function parseSaveFile(filePath: string) {
  const raw = fs.readFileSync(filePath);
  const text = raw.toString('latin1');

  // ── Deck: extract only IDs that appear inside the "deck" array block ─────
  // Find the start of the deck array and extract cards up to the closing ]
  const deckArrayMatch = text.match(/"deck"\s*:\s*\[([\s\S]*?)\]/);
  const deckBlock = deckArrayMatch?.[1] ?? '';
  const deck = [...deckBlock.matchAll(/"id"\s*:\s*"(CARD\.[^"]+)"/g)].map(m => m[1]);

  // ── Relics ────────────────────────────────────────────────────────────────
  const relicIds = [...new Set(text.match(/RELIC\.[A-Z0-9_]+/g) ?? [])];

  // ── Floor ─────────────────────────────────────────────────────────────────
  const floorMatch = text.match(/"floor(?:_num)?"\s*[=:]\s*(\d+)/);
  let floor = floorMatch ? parseInt(floorMatch[1]) : 0;

  // Fallback: estimate from encounter counters
  if (!floor || floor > 60) {
    const normalVisited = parseInt(text.match(/"normal_encounters_visited"\s*:\s*(\d+)/)?.[1] ?? '0');
    const eliteVisited  = parseInt(text.match(/"elite_encounters_visited"\s*:\s*(\d+)/)?.[1] ?? '0');
    const eventsVisited = parseInt(text.match(/"events_visited"\s*:\s*(\d+)/)?.[1] ?? '0');
    const bossVisited   = parseInt(text.match(/"boss_encounters_visited"\s*:\s*(\d+)/)?.[1] ?? '0');
    floor = Math.max(1, normalVisited + eliteVisited + eventsVisited + bossVisited * 2);
  }

  const character = detectCharacter(deck);

  return { character, floor, deck, relics: relicIds };
}

router.get('/', (_req: Request, res: Response) => {
  const savesPath = getSavesPath();
  const saveFile  = findCurrentRunSave(savesPath);

  if (!saveFile) {
    return res.status(404).json({ error: 'No active run found. Start a run in-game first.' });
  }

  try {
    const data = parseSaveFile(saveFile);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse save file', detail: String(err) });
  }
});

export default router;
