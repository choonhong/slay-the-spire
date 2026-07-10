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

function bracketBlock(text: string, keyPattern: RegExp): string {
  const keyIdx = text.search(keyPattern);
  if (keyIdx < 0) return '';
  const start = text.indexOf('[', keyIdx);
  if (start < 0) return '';
  let depth = 0, end = start;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  return text.slice(start, end + 1);
}

function parseSaveFile(filePath: string) {
  const raw = fs.readFileSync(filePath);
  const text = raw.toString('latin1');

  // ── Deck: bracket-aware extraction, then parse each card object ──────────
  const deckBlock = bracketBlock(text, /"deck"\s*:\s*\[/);
  const deck: string[] = [];
  const upgrades: string[] = [];  // card IDs that have current_upgrade_level >= 1

  // Walk card objects inside the deck block
  let brace = -1, braceDepth = 0;
  for (let i = 0; i < deckBlock.length; i++) {
    if (deckBlock[i] === '{') {
      if (braceDepth === 0) brace = i;
      braceDepth++;
    } else if (deckBlock[i] === '}') {
      braceDepth--;
      if (braceDepth === 0 && brace >= 0) {
        const obj = deckBlock.slice(brace, i + 1);
        const idM  = obj.match(/"id"\s*:\s*"(CARD\.[^"]+)"/);
        const lvlM = obj.match(/"current_upgrade_level"\s*:\s*(\d+)/);
        if (idM) {
          deck.push(idM[1]);
          if (lvlM && parseInt(lvlM[1]) >= 1) upgrades.push(idM[1]);
        }
        brace = -1;
      }
    }
  }

  // ── Relics: bracket-aware extraction ─────────────────────────────────────
  const relicBlock = bracketBlock(text, /"relics"\s*:\s*\[/);
  const relicIds = [...relicBlock.matchAll(/"id"\s*:\s*"(RELIC\.[^"]+)"/g)].map(m => m[1]);

  // ── Floor ─────────────────────────────────────────────────────────────────
  // Best proxy: highest floor_added_to_deck value across all deck cards
  const deckFloors = [...text.matchAll(/"floor_added_to_deck"\s*:\s*(\d+)/g)].map(m => parseInt(m[1]));
  let floor = deckFloors.length > 0 ? Math.max(...deckFloors) : 0;

  // Fallback: estimate from encounter counters
  if (!floor) {
    const normalVisited = parseInt(text.match(/"normal_encounters_visited"\s*:\s*(\d+)/)?.[1] ?? '0');
    const eliteVisited  = parseInt(text.match(/"elite_encounters_visited"\s*:\s*(\d+)/)?.[1] ?? '0');
    const eventsVisited = parseInt(text.match(/"events_visited"\s*:\s*(\d+)/)?.[1] ?? '0');
    const bossVisited   = parseInt(text.match(/"boss_encounters_visited"\s*:\s*(\d+)/)?.[1] ?? '0');
    floor = Math.max(1, normalVisited + eliteVisited + eventsVisited + bossVisited * 2);
  }

  const character = detectCharacter(deck);

  // ── Act index & upcoming boss ─────────────────────────────────────────────
  const actIndex = parseInt(text.match(/"current_act_index"\s*:\s*(\d+)/)?.[1] ?? '0');
  const allBossIds = [...text.matchAll(/"boss_id"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
  const currentBoss = allBossIds[actIndex] ?? null;

  return { character, floor, deck, relics: relicIds, upgrades, actIndex, currentBoss };
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
