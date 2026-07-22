import fs from 'fs';
import path from 'path';
import type { DatabaseSync } from 'node:sqlite';

// ─── Data file paths ──────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '../../data');

interface CardText {
  id: string;
  name: string;
  description: string;
  upgrade_description?: string;
  cost: string;
  type: string;
  rarity: string;
  color: string;
  keywords: string[];
}

interface CharacterContext {
  archetypes: string[];
  win_conditions: string[];
  good_keywords: string[];
  key_synergy_cards: string[];
  best_cards?: string[];
  tier_list_s?: string[];
  tier_list_d?: string[];
  avoid_cards: string[];
  critical_rules?: string[];
  meta_builds?: Record<string, { tier?: string; description?: string; core: string[] }>;
  starter_deck: string[];
}

interface ActPrinciple {
  summary: string;
  cost_weights: Record<string, number>;
  rarity_matters: boolean;
}

type TierLetter = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
interface TierList { S: string[]; A: string[]; B: string[]; C: string[]; D: string[]; F: string[] }

interface MechanicSynergy {
  enablers?: string[];
  enabler_filter?: {
    cost?: string;
    type?: string;
    keyword?: string;
    /** True = card adds cards into hand (generation). */
    generates_cards?: boolean;
  };
  filter: {
    id?: string;
    cost?: string;
    type?: string;
    keyword?: string;
    generates_cards?: boolean;
  };
  bonus: number;
  scale_with_count?: boolean;
  max_bonus?: number;
  reason: string;
}

interface RelicSynergy {
  relic_id?: string;
  filter: {
    cost?: string;
    type?: string;
    keyword?: string;
    card_id?: string;
    /** True = card grants numeric Block on play (not Powers / "unblocked" text). */
    gains_block?: boolean;
  };
  bonus: number;
  reason: string;
}

/** Fresnel Lens / Nimble-style: Skills & Attacks that Gain N Block when played. */
function cardGainsNumericBlock(ct: CardText | undefined): boolean {
  if (!ct || ct.type === 'Power') return false;
  const desc = (ct.description ?? '').toLowerCase().replace(/unblocked/g, '');
  return /gain\s+\d+\s+block/.test(desc);
}

/** Poison enabler (Apply N Poison) vs payoff (Outbreak, Mirage, Accelerant). */
function cardAppliesPoison(ct: CardText | undefined): boolean {
  if (!ct) return false;
  return /apply\s+\d+\s+poison/i.test(ct.description ?? '');
}

/** Puts new cards into hand (Splash, Blade Dance, Discovery, …) — another Afterimage Block each. */
function cardGeneratesHandCards(ct: CardText | undefined): boolean {
  if (!ct) return false;
  const desc = (ct.description ?? '').toLowerCase();
  return /add .+ into your hand|add .+ to your hand|shivs? into your hand/.test(desc);
}

interface BossContext {
  act: number;
  name: string;
  summary: string;
  preferred_card_keywords?: string[];
  boost_aoe?: boolean;
  boost_poison?: boolean;
  boost_keywords?: string[];
  tip: string;
}

interface DebuffCap {
  detect_keyword: string;
  max_useful_turns: number;
  relic_turns: Record<string, number>;
  penalty_per_excess_turn: number;
  reason: string;
}

interface GameContext {
  characters: Record<string, CharacterContext>;
  keyword_synergies: Record<string, string[]>;
  mechanic_synergies?: Record<string, MechanicSynergy | string>;
  relic_synergies?: Record<string, RelicSynergy>;
  boss_context?: Record<string, BossContext>;
  debuff_caps?: Record<string, DebuffCap>;
  non_stackable_cards?: string[];
  universal_trap_cards: string[];
  /** Colorless / cross-character S-tier picks (e.g. Splash). */
  universal_s_tier_cards?: string[];
  act_principles: Record<string, ActPrinciple>;
  baalorlord_tiers?: Record<string, TierList>;
}

// ─── Public types ─────────────────────────────────────────────────────────────
export interface RecommendRequest {
  deck: string[];              // card IDs currently in deck
  offered: string[];           // 1–3 card IDs being offered
  offeredUpgrades?: boolean[]; // parallel array: true if that offered card is the upgraded version
  deckUpgrades?: string[];     // card IDs in deck that are upgraded
  character: string;           // CHARACTER.REGENT etc.
  floor: number;               // 0 = unknown
  relics?: string[];           // relic IDs currently held
  currentBoss?: string;        // ENCOUNTER.KAISER_CRAB_BOSS etc.
}

export interface ScoreFactors {
  strength: number;    // 0–30  card baseline power
  synergy: number;     // 0–25  fit with current deck
  deck_needs: number;  // 0–40  fills a gap in the deck
  win_con: number;     // 0–20  advances/completes a win condition
  act_context?: number; // removed — kept optional for backward compat
  rarity: number;      // 0–10  inherent ceiling
}

export interface CardScore {
  card_id: string;
  name: string;
  score: number;
  factors: ScoreFactors;
  reasons: string[];
  recommendation: 'strong' | 'consider' | 'skip';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadJson<T>(filename: string): T | null {
  try {
    const p = path.join(DATA_DIR, filename);
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function actFromFloor(floor: number): number {
  if (floor <= 0) return 1;
  if (floor <= 17) return 1;
  if (floor <= 34) return 2;
  return 3;
}

// ─── Cards excluded from synergy (starter deck + Basic rarity + curses) ──────
function loadStarterExcludeIds(): Set<string> {
  const ids = new Set<string>();
  for (const c of loadJson<CardText[]>('card_text.json') ?? []) {
    if (c.rarity === 'Basic' || c.color === 'curse') ids.add(c.id);
  }
  const ctx = loadJson<{ characters?: Record<string, { starter_deck?: string[] }> }>('game_context.json');
  for (const ch of Object.values(ctx?.characters ?? {})) {
    for (const id of ch.starter_deck ?? []) ids.add(id);
  }
  return ids;
}

const BASIC_CARDS = loadStarterExcludeIds();

// ─── DB queries ──────────────────────────────────────────────────────────────
interface WinRateRow { card_id: string; win_rate: number; runs: number }

function getWinRates(db: DatabaseSync, character?: string): Map<string, WinRateRow> {
  const conditions = ['cc.offer_index = -1'];
  const params: (string | number)[] = [];
  if (character) { conditions.push('r.character = ?'); params.push(character); }

  const rows = db.prepare(`
    SELECT
      cc.card_id,
      COUNT(DISTINCT cc.run_id) AS runs,
      COUNT(DISTINCT CASE WHEN r.win = 1 THEN cc.run_id END) * 100.0 /
        NULLIF(COUNT(DISTINCT cc.run_id), 0) AS win_rate
    FROM card_choices cc
    JOIN runs r ON r.id = cc.run_id
    WHERE ${conditions.join(' AND ')}
    GROUP BY cc.card_id
  `).all(...params) as { card_id: string; runs: number; win_rate: number }[];

  return new Map(rows.map(r => [r.card_id, {
    card_id: r.card_id,
    win_rate: Math.round(Number(r.win_rate) * 10) / 10,
    runs: Number(r.runs),
  }]));
}

function getUpgradedWinRate(
  db: DatabaseSync,
  cardId: string,
  character: string,
): { win_rate: number; runs: number } | null {
  const row = db.prepare(`
    SELECT
      COUNT(DISTINCT r.id) AS runs,
      ROUND(
        COUNT(DISTINCT CASE WHEN r.win = 1 THEN r.id END) * 100.0
        / NULLIF(COUNT(DISTINCT r.id), 0), 1
      ) AS win_rate
    FROM card_choices cc
    JOIN runs r ON r.id = cc.run_id
    WHERE cc.card_id = ? AND cc.offer_index = -1 AND cc.upgrade_level >= 1
      AND r.character = ?
  `).get(cardId, character) as { runs: number; win_rate: number } | null;
  if (!row || Number(row.runs) < 2) return null;
  return { runs: Number(row.runs), win_rate: Math.round(Number(row.win_rate) * 10) / 10 };
}

function getDuplicateWinRate(
  db: DatabaseSync,
  cardId: string,
  character: string,
  minCopies = 2,
): { win_rate: number; runs: number } | null {
  const rows = db.prepare(`
    SELECT
      COUNT(DISTINCT r.id) AS runs,
      ROUND(SUM(r.win) * 100.0 / COUNT(DISTINCT r.id), 1) AS win_rate
    FROM (
      SELECT cc.run_id
      FROM card_choices cc
      JOIN runs r ON r.id = cc.run_id
      WHERE cc.card_id = ? AND cc.offer_index = -1 AND r.character = ?
      GROUP BY cc.run_id
      HAVING COUNT(*) >= ?
    ) sub
    JOIN runs r ON r.id = sub.run_id
  `).get(cardId, character, minCopies) as { runs: number; win_rate: number } | null;
  if (!rows || Number(rows.runs) < 3) return null;
  return { runs: Number(rows.runs), win_rate: Math.round(Number(rows.win_rate) * 10) / 10 };
}

interface SynergyRow { card_a: string; card_b: string; win_rate_together: number; runs_together: number }

function getSynergiesForDeck(
  db: DatabaseSync,
  deck: string[],
  character?: string,
): Map<string, SynergyRow[]> {
  // Strip basic starter cards — their "synergy" with everything is noise
  const filteredDeck = deck.filter(id => !BASIC_CARDS.has(id));
  if (filteredDeck.length === 0) return new Map();

  const placeholders = filteredDeck.map(() => '?').join(',');
  const basicPlaceholders = [...BASIC_CARDS].map(() => '?').join(',');
  const conditions = [
    'a.offer_index = -1',
    'b.offer_index = -1',
    `a.card_id NOT IN (${basicPlaceholders})`,
    `b.card_id NOT IN (${basicPlaceholders})`,
    `(a.card_id IN (${placeholders}) OR b.card_id IN (${placeholders}))`,
  ];
  const params: (string | number)[] = [
    ...BASIC_CARDS, ...BASIC_CARDS,
    ...filteredDeck, ...filteredDeck,
  ];

  if (character) { conditions.push('r.character = ?'); params.push(character); }

  const rows = db.prepare(`
    SELECT
      a.card_id AS card_a,
      b.card_id AS card_b,
      COUNT(DISTINCT r.id) AS runs_together,
      ROUND(
        COUNT(DISTINCT CASE WHEN r.win = 1 THEN r.id END) * 100.0
        / NULLIF(COUNT(DISTINCT r.id), 0), 1
      ) AS win_rate_together
    FROM card_choices a
    JOIN card_choices b ON b.run_id = a.run_id AND a.card_id < b.card_id
    JOIN runs r ON r.id = a.run_id
    WHERE ${conditions.join(' AND ')}
    GROUP BY a.card_id, b.card_id
    HAVING COUNT(DISTINCT r.id) >= 3
  `).all(...params) as unknown as SynergyRow[];

  // Index by each card
  const map = new Map<string, SynergyRow[]>();
  for (const row of rows) {
    for (const side of [row.card_a, row.card_b]) {
      if (!map.has(side)) map.set(side, []);
      map.get(side)!.push(row);
    }
  }
  return map;
}

// ─── Baalorlord tier lookup ───────────────────────────────────────────────────
function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/ +/g, ' ').trim();
}

const BAALORD_TIER_DELTA: Record<TierLetter, number> = { S: 8, A: 4, B: 0, C: -2, D: -6, F: -10 };

function getBaalorlordTier(
  cardId: string,
  character: string,
  ctx: GameContext,
  cardTextMap: Map<string, CardText>,
): TierLetter | null {
  const tiers = ctx.baalorlord_tiers;
  if (!tiers) return null;

  const cardName = cardTextMap.get(cardId)?.name;
  if (!cardName) return null;
  const target = normName(cardName);

  const searchIn = (list: TierList): TierLetter | null => {
    for (const tier of ['S', 'A', 'B', 'C', 'D', 'F'] as TierLetter[]) {
      if ((list[tier] ?? []).some(n => normName(n) === target)) return tier;
    }
    return null;
  };

  // Character-specific list takes priority (may include colorless cards rated for that char)
  const charResult = tiers[character] ? searchIn(tiers[character]) : null;
  if (charResult) return charResult;

  // Fall back to colorless list
  return tiers['colorless'] ? searchIn(tiers['colorless']) : null;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
function scoreCard(
  cardId: string,
  deck: string[],
  character: string,
  floor: number,
  relics: string[],
  isUpgraded: boolean,
  deckUpgrades: string[],
  winRates: Map<string, WinRateRow>,
  allWinRates: Map<string, WinRateRow>,
  synergyMap: Map<string, SynergyRow[]>,
  cardTextMap: Map<string, CardText>,
  ctx: GameContext,
  db: DatabaseSync,
  currentBoss?: string,
): CardScore {
  const act = actFromFloor(floor);
  const charCtx = ctx.characters[character];
  const actCtx = ctx.act_principles[String(act)];
  const ct = cardTextMap.get(cardId);
  const reasons: string[] = [];

  // ── Factor 1: Card Strength (0–30) ─────────────────────────────────────────
  let strength = 0;

  // Source A: our per-character win rate
  // If the offered card is upgraded, prefer the upgraded win rate
  // Always surface a win-rate line (even with 0–1 runs); strength still needs ≥2 runs.
  const wrRow = winRates.get(cardId) ?? allWinRates.get(cardId);
  if (isUpgraded) {
    const upgWr = getUpgradedWinRate(db, cardId, character);
    const baseWr = wrRow && wrRow.runs >= 1 ? wrRow : null;
    // Use max(upgraded wr, base wr) — take the stronger signal
    if (upgWr && baseWr) {
      if (upgWr.win_rate >= baseWr.win_rate) {
        if (upgWr.runs >= 2) strength = clamp((upgWr.win_rate / 100) * 30, 0, 30);
        reasons.push(`${upgWr.win_rate.toFixed(0)}% win rate upgraded (${upgWr.runs} runs)`);
      } else {
        if (baseWr.runs >= 2) strength = clamp((baseWr.win_rate / 100) * 30, 0, 30);
        reasons.push(`${baseWr.win_rate.toFixed(0)}% win rate in ${baseWr.runs} runs (base › upgraded)`);
      }
    } else if (upgWr) {
      if (upgWr.runs >= 2) strength = clamp((upgWr.win_rate / 100) * 30, 0, 30);
      reasons.push(`${upgWr.win_rate.toFixed(0)}% win rate upgraded (${upgWr.runs} runs)`);
    } else if (baseWr) {
      if (baseWr.runs >= 2) strength = clamp((baseWr.win_rate / 100) * 30, 0, 30);
      reasons.push(`${baseWr.win_rate.toFixed(0)}% win rate in ${baseWr.runs} runs (no upgraded data yet)`);
    } else {
      reasons.push('No win rate data yet');
    }
  } else if (wrRow && wrRow.runs >= 1) {
    if (wrRow.runs >= 2) strength = clamp((wrRow.win_rate / 100) * 30, 0, 30);
    reasons.push(`${wrRow.win_rate.toFixed(0)}% win rate in ${wrRow.runs} runs`);
  } else {
    reasons.push('No win rate data yet');
  }

  // Trap card hard-cap
  if (ctx.universal_trap_cards.includes(cardId)) {
    strength = 0;
    reasons.push('⚠ Trap card — generally harmful');
  }

  // Character / universal S-tier boost
  const isCharSTier = charCtx?.tier_list_s?.includes(cardId) ?? false;
  const isUniversalSTier = ctx.universal_s_tier_cards?.includes(cardId) ?? false;
  const isSTier = isCharSTier || isUniversalSTier;
  if (isSTier) {
    strength = Math.min(30, strength + 6);
  }
  // D-tier penalty
  if (charCtx?.tier_list_d?.includes(cardId)) {
    strength = Math.max(0, strength - 10);
  }
  // best_cards bonus
  if (charCtx?.best_cards?.includes(cardId) && !isSTier) {
    strength = Math.min(30, strength + 3);
  }

  // Source D: Baalorlord's pro tier list (independent signal)
  const baalordTier = getBaalorlordTier(cardId, character, ctx, cardTextMap);
  if (baalordTier !== null) {
    strength = clamp(strength + BAALORD_TIER_DELTA[baalordTier], 0, 30);
  }

  // Consolidate tier signals into one reason line
  {
    const charName = character.replace('CHARACTER.', '');
    const parts: string[] = [];
    if (isSTier) parts.push('S-tier pick');
    else if (charCtx?.tier_list_d?.includes(cardId)) parts.push('↓ D-tier for this character');
    if (baalordTier === 'S') parts.push(`Baalorlord S (${charName})`);
    else if (baalordTier === 'A') parts.push('Baalorlord A-tier');
    else if (baalordTier === 'B') parts.push('Baalorlord B-tier');
    else if (baalordTier === 'C') parts.push('Baalorlord C-tier');
    else if (baalordTier === 'D') parts.push('⚠ Baalorlord D-tier');
    else if (baalordTier === 'F') parts.push('⚠ Baalorlord F-tier — avoid');
    if (parts.length > 0) reasons.push(parts.join(' · '));
  }

  strength = Math.round(strength);

  // ── Factor 2: Deck Synergy (0–25) ─────────────────────────────────────────
  let synergy = 0;
  const deckSet = new Set(deck);

  // DB synergy pairs — exclude basic starter cards from both sides
  const pairs = synergyMap.get(cardId) ?? [];
  const relevantPairs = pairs
    .filter(p => {
      if (BASIC_CARDS.has(p.card_a) || BASIC_CARDS.has(p.card_b)) return false;
      // Only show synergy when the PARTNER card (not the offered card itself) is in deck
      const partner = p.card_a === cardId ? p.card_b : p.card_a;
      return deckSet.has(partner);
    })
    .sort((a, b) => b.win_rate_together - a.win_rate_together)
    .slice(0, 3);

  for (const p of relevantPairs) {
    const partner = p.card_a === cardId ? p.card_b : p.card_a;
    const lift = clamp(p.win_rate_together / 100, 0, 1);
    synergy += lift * 8;
    const partnerCt = cardTextMap.get(partner);
    if (partnerCt) reasons.push(`Pairs with ${partnerCt.name} (${p.win_rate_together}% wr together)`);
  }

  // Duplicate card — diminishing returns penalty, partially offset by win rate data
  // Afterimage / Footwork stack (+Block / +Dex per copy) — don't punish 2nd copy
  const alreadyInDeck = deck.filter(id => id === cardId).length;
  if (alreadyInDeck >= 1 && cardId !== 'CARD.AFTERIMAGE' && cardId !== 'CARD.FOOTWORK') {
    // Penalty scales with how many copies already exist
    const BASE_PENALTY = alreadyInDeck === 1 ? 10   // 2nd copy
                       : alreadyInDeck === 2 ? 18   // 3rd copy
                       : 23;                        // 4th+ copy
    const copyLabel = alreadyInDeck === 1 ? '2nd' : alreadyInDeck === 2 ? '3rd' : `${alreadyInDeck + 1}th`;

    // Check if this card's effect is non-stackable (e.g. Weak doesn't stack)
    const nonStackable = ctx.non_stackable_cards?.includes(cardId) ?? false;
    const extraPenalty = nonStackable ? 10 : 0;

    const dupStats = getDuplicateWinRate(db, cardId, character, alreadyInDeck + 1);
    if (dupStats) {
      // ≤60%: full penalty | 60-75%: partial relief | 75-85%: penalty wiped | >85%: bonus
      const wr = dupStats.win_rate;
      let netPenalty: number;
      let tag: string;
      if (!nonStackable && wr >= 85) {
        netPenalty = -clamp(((wr - 85) / 15) * 8, 0, 8); // becomes a +0 to +8 boost
        tag = '↑↑ ';
      } else if (!nonStackable && wr >= 75) {
        netPenalty = 0; // penalty fully cancelled
        tag = '↑ ';
      } else if (!nonStackable && wr >= 60) {
        const relief = clamp(((wr - 60) / 15) * BASE_PENALTY, 0, BASE_PENALTY);
        netPenalty = BASE_PENALTY - relief;
        tag = '↑ ';
      } else {
        netPenalty = BASE_PENALTY + extraPenalty;
        tag = '↓ ';
      }
      synergy -= netPenalty;
      const stackNote = nonStackable ? ' (effect non-stackable)' : '';
      reasons.push(`${tag}${copyLabel} copy — ${wr}% wr with ${alreadyInDeck + 1}+ copies (${dupStats.runs} runs)${stackNote}`);
    } else {
      synergy -= BASE_PENALTY + extraPenalty;
      const stackNote = nonStackable ? ', effect non-stackable' : ', no multi-copy data';
      reasons.push(`↓ ${copyLabel} copy — diminishing returns${stackNote}`);
    }
  }

  // Context keyword synergies
  const cardKeywords = ct?.keywords ?? [];
  const deckCardNames = deck.map(id => cardTextMap.get(id)?.name ?? '');
  for (const kw of cardKeywords) {
    const synergyCards = ctx.keyword_synergies[kw] ?? [];
    const matches = synergyCards.filter(sc => deckCardNames.some(n => n.toLowerCase().includes(sc.toLowerCase())));
    if (matches.length > 0) {
      synergy += matches.length * 3;
      reasons.push(`${kw} keyword synergises with ${matches.slice(0, 2).join(', ')} in deck`);
    }
  }

  // Mechanic synergies (e.g. Feral + 0-cost attacks)
  const mechSynergies = ctx.mechanic_synergies ?? {};
  for (const [, ms] of Object.entries(mechSynergies)) {
    if (typeof ms !== 'object' || ms === null) continue;
    const { enablers, enabler_filter, filter, bonus, scale_with_count, max_bonus, penalty_if_below, reason } = ms as {
      enablers?: string[];
      enabler_filter?: {
        cost?: string;
        type?: string;
        keyword?: string;
        generates_cards?: boolean;
      };
      filter: {
        id?: string;
        cost?: string;
        type?: string;
        keyword?: string;
        generates_cards?: boolean;
      };
      bonus: number;
      scale_with_count?: boolean;
      max_bonus?: number;
      penalty_if_below?: number;
      reason: string;
    };
    const idMatch   = filter.id   === undefined || cardId === filter.id;
    const costMatch = filter.cost === undefined || ct?.cost === filter.cost;
    const typeMatch = filter.type === undefined || ct?.type?.toLowerCase() === filter.type.toLowerCase();
    const kwMatch   = filter.keyword === undefined
      || (ct?.keywords ?? []).some(k => k.toLowerCase() === filter.keyword!.toLowerCase())
      || (ct?.description ?? '').toLowerCase().includes(filter.keyword.toLowerCase());
    const genMatch  = filter.generates_cards === undefined || filter.generates_cards === cardGeneratesHandCards(ct);
    if (!idMatch || !costMatch || !typeMatch || !kwMatch || !genMatch) continue;

    let enablerCount = 0;
    if (enabler_filter) {
      // Dynamic: count deck cards matching the filter properties
      enablerCount = deck.filter(id => {
        const dct = cardTextMap.get(id);
        const costOk    = enabler_filter.cost    === undefined || dct?.cost === enabler_filter.cost;
        const typeOk    = enabler_filter.type    === undefined || dct?.type?.toLowerCase() === enabler_filter.type.toLowerCase();
        const keywordOk = enabler_filter.keyword === undefined || (dct?.keywords ?? []).includes(enabler_filter.keyword) || dct?.description?.toLowerCase().includes(enabler_filter.keyword.toLowerCase());
        const genOk     = enabler_filter.generates_cards === undefined || enabler_filter.generates_cards === cardGeneratesHandCards(dct);
        return costOk && typeOk && keywordOk && genOk;
      }).length;
    } else if (enablers) {
      enablerCount = enablers.filter(e => deckSet.has(e)).length;
    }

    // Penalty mode: apply negative bonus when enabler count is below threshold
    if (penalty_if_below !== undefined && enablerCount < penalty_if_below) {
      synergy += -Math.abs(bonus);
      reasons.push(`↓ ${reason} (only ${enablerCount} in deck)`);
      continue;
    }

    if (enablerCount === 0) continue;
    const scaledBonus = scale_with_count
      ? clamp(bonus * enablerCount, 0, max_bonus ?? bonus * 4)
      : bonus;
    synergy += scaledBonus;
    reasons.push(scale_with_count ? `${reason} (×${enablerCount})` : reason);
  }

  // Relic synergies from game_context (applied outside the ±25 synergy clamp)
  let relicBonus = 0;
  const relicSet = new Set(relics);
  const relicSynergies = ctx.relic_synergies ?? {};
  for (const [key, rs] of Object.entries(relicSynergies)) {
    if (typeof rs !== 'object' || rs === null) continue;
    // Support optional relic_id override (for multi-rule relics)
    const effectiveRelicId = (rs as { relic_id?: string }).relic_id ?? key;
    if (!relicSet.has(effectiveRelicId)) continue;
    const { filter, bonus: rBonus, reason: rReason } = rs as RelicSynergy;
    const costMatch   = filter.cost    === undefined || ct?.cost === filter.cost;
    const typeMatch   = filter.type    === undefined || ct?.type?.toLowerCase() === filter.type.toLowerCase();
    const kwMatch     = filter.keyword === undefined || (ct?.keywords ?? []).some(k => k.toLowerCase() === filter.keyword!.toLowerCase())
                          || (ct?.description ?? '').toLowerCase().includes((filter.keyword ?? '').toLowerCase());
    const cardMatch   = filter.card_id === undefined || cardId === filter.card_id;
    const blockMatch  = filter.gains_block === undefined || filter.gains_block === cardGainsNumericBlock(ct);
    if (costMatch && typeMatch && kwMatch && cardMatch && blockMatch) {
      relicBonus += rBonus;
      reasons.push(rReason);
    }
  }

  // Debuff saturation penalty — tracks total debuff turns, not just source count
  if (ct && ctx.debuff_caps) {
    const cardDesc = ct.description.toLowerCase();
    for (const [, cap] of Object.entries(ctx.debuff_caps)) {
      if (typeof cap !== 'object' || cap === null) continue;
      // Does this offered card apply this debuff?
      if (!cardDesc.includes(cap.detect_keyword)) continue;

      // Helper: extract how many turns a description applies (e.g. "Apply 2 Weak" → 2)
      const extractTurns = (desc: string, kw: string): number => {
        const m = desc.match(new RegExp(`apply\\s+(\\d+)\\s+${kw}`, 'i'));
        return m ? parseInt(m[1]) : 1;
      };

      // Sum turns from existing deck cards that apply this debuff
      const deckTurns = deck.reduce((sum, id) => {
        const dct = cardTextMap.get(id);
        if (!dct || !dct.description.toLowerCase().includes(cap.detect_keyword)) return sum;
        // Use upgraded description if the card is upgraded in deck
        const desc = deckUpgrades.includes(id) && dct.upgrade_description
          ? dct.upgrade_description
          : dct.description;
        return sum + extractTurns(desc, cap.detect_keyword);
      }, 0);

      // Sum turns from relics
      const relicTurns = Object.entries(cap.relic_turns ?? {})
        .reduce((sum, [rid, t]) => sum + (relics.includes(rid) ? t : 0), 0);

      // How many turns would the offered card add?
      const offeredTurns = extractTurns(
        isUpgraded && ct.upgrade_description ? ct.upgrade_description : ct.description,
        cap.detect_keyword
      );

      const totalTurns = deckTurns + relicTurns;
      const afterTurns = totalTurns + offeredTurns;

      if (afterTurns > cap.max_useful_turns) {
        const excessTurns = afterTurns - cap.max_useful_turns;
        const penalty = Math.min(excessTurns * cap.penalty_per_excess_turn, 20);
        synergy -= penalty;
        reasons.push(cap.reason.startsWith('↓') ? cap.reason : `↓ ${cap.reason}`);
      }
    }
  }

  // Archetype match
  const deckHasPoison = deck.some(id => {
    const c = cardTextMap.get(id);
    if (!c) return false;
    return /poison/i.test(`${c.description ?? ''} ${(c.keywords ?? []).join(' ')}`);
  });
  if (charCtx) {
    const cardText = `${ct?.name ?? ''} ${ct?.description ?? ''} ${cardKeywords.join(' ')}`.toLowerCase();
    const cardMentionsPoison = cardText.includes('poison');
    const archetypeHits = charCtx.archetypes.filter(a => {
      // Don't credit Poison archetype when the deck has no Poison yet
      if (a.toLowerCase() === 'poison' && !deckHasPoison) return false;
      return cardText.includes(a.toLowerCase());
    });
    if (archetypeHits.length > 0) {
      synergy += archetypeHits.length * 2;
    }
    if (charCtx.key_synergy_cards.includes(cardId)) {
      synergy += 5;
      reasons.push('Key win-condition card for this character');
    }
    // Good keywords bonus — fires when card description mentions a priority keyword
    if (charCtx.good_keywords) {
      const goodKwHits = charCtx.good_keywords.filter(k => {
        if (k.toLowerCase() === 'poison' && !deckHasPoison) return false;
        return cardText.includes(k.toLowerCase());
      });
      if (goodKwHits.length > 0) {
        const kwBonus = Math.min(goodKwHits.length * 3, 6);
        synergy += kwBonus;
        reasons.push(`Synergises with ${goodKwHits.slice(0, 2).join('/')} engine for this character`);
      }
    }

    // Act 1: Innate 0-cost damage solves early damage turns (Backstab)
    const earlyDmg = parseInt(cardText.match(/deal (\d+) damage/)?.[1] ?? '0', 10);
    const earlyCost = parseInt(ct?.cost ?? '1');
    const isInnateCard = cardKeywords.some(k => k.toLowerCase() === 'innate');
    if (act === 1 && isInnateCard && earlyCost === 0 && earlyDmg >= 8) {
      synergy += 10;
      reasons.push('Act 1 Innate opener — free damage when the deck needs it');
    }

    // Payoffs only — enablers (Apply N Poison) start the engine
    if (cardMentionsPoison && !deckHasPoison && !cardAppliesPoison(ct)) {
      synergy -= 3;
    }
  }

  synergy = Math.round(clamp(synergy, -20, 25));
  // Relic bonuses sit outside the deck-synergy clamp so strong relic picks aren't muted
  synergy = Math.round(clamp(synergy + relicBonus, -20, 40));

  // ── Factor 3: Deck Needs (0–40) ────────────────────────────────────────────
  let deckNeeds = 10; // neutral baseline

  const deckTexts = deck.map(id => cardTextMap.get(id)).filter(Boolean) as CardText[];
  const avgCost = deckTexts.length > 0
    ? deckTexts.reduce((s, c) => s + (parseInt(c.cost) || 0), 0) / deckTexts.length
    : 1.5;
  const cardCost = parseInt(ct?.cost ?? '1');
  const attackCount = deckTexts.filter(c => c.type === 'Attack').length;
  const skillCount = deckTexts.filter(c => c.type === 'Skill').length;
  const powerCount = deckTexts.filter(c => c.type === 'Power').length;
  const deckSize = deck.length;

  // Cost curve: reward if card helps bring avg cost down
  if (!isNaN(cardCost) && avgCost > 2.0 && cardCost <= 1) {
    deckNeeds += 5;
    reasons.push('Deck is expensive — cheap card improves curve');
  }

  // Afterimage: must-take — 1 energy Power that turns every card into Block (stacks)
  if (cardId === 'CARD.AFTERIMAGE') {
    if (alreadyInDeck === 0) {
      strength = Math.min(30, strength + 10);
      synergy += 12;
      deckNeeds += 28;
      reasons.push('Must-take Power — 1 energy for Block on every card played');
    } else if (alreadyInDeck === 1) {
      strength = Math.min(30, strength + 6);
      synergy += 10;
      deckNeeds += 22;
      reasons.push('2nd Afterimage still stacks — +1 Block per card played');
    }
  }

  // Footwork: Dex Power — scaling Block on every Block card (stacks)
  if (cardId === 'CARD.FOOTWORK' && alreadyInDeck < 2) {
    strength = Math.min(30, strength + (alreadyInDeck === 0 ? 4 : 2));
    synergy += alreadyInDeck === 0 ? 6 : 4;
    deckNeeds += alreadyInDeck === 0 ? 30 : 24;
    reasons.push(
      alreadyInDeck === 0
        ? 'Scaling Block Power — Dexterity multiplies every Block card'
        : '2nd Footwork still stacks — more Dex on every Block card',
    );
  }

  // Piercing Wail: first copy — answer big Strength / multi-hit turns
  if (cardId === 'CARD.PIERCING_WAIL' && alreadyInDeck === 0) {
    deckNeeds += 18;
    reasons.push('First Piercing Wail — shuts down big attack turns');
  }

  // Fan of Knives: Shiv scaling — all Shivs hit ALL enemies
  if (cardId === 'CARD.FAN_OF_KNIVES' && alreadyInDeck === 0) {
    const shivEngine = deck.some(id => {
      const d = cardTextMap.get(id);
      if (!d) return false;
      const text = `${d.name} ${d.description}`.toLowerCase();
      return text.includes('shiv') || id === 'CARD.ACCURACY' || id === 'CARD.BLADE_DANCE';
    });
    strength = Math.min(30, strength + 6);
    synergy += shivEngine ? 10 : 4;
    deckNeeds += shivEngine ? 24 : 14;
    reasons.push(
      shivEngine
        ? 'Shiv scaling Power — Shivs hit ALL enemies'
        : 'Scaling Power — enables Shiv AoE (better with Shivs in deck)',
    );
  }

  // Deck lacks damage scaling — block solved or no Accuracy/poison/Strength/Tracking output
  const hasDamageScaling = deck.some(id => {
    if (['CARD.ACCURACY', 'CARD.NOXIOUS_FUMES', 'CARD.CATALYST', 'CARD.A_THOUSAND_CUTS', 'CARD.ENVENOM', 'CARD.OUTBREAK', 'CARD.ACCELERANT', 'CARD.TRACKING'].includes(id)) {
      return true;
    }
    const d = cardTextMap.get(id);
    return d ? /gain \d+ strength/i.test(d.description ?? '') : false;
  });
  const blockSolved = deck.includes('CARD.AFTERIMAGE') || deck.includes('CARD.FOOTWORK');
  const nonStrikeDmg = deckTexts.filter(
    c => c.type === 'Attack' && !/strike/i.test(c.id) && !/strike/i.test(c.name),
  ).length;
  const deckLacksDamage = !hasDamageScaling && (blockSolved || nonStrikeDmg < 4 || act >= 2);
  const deckHasWeak = relics.includes('RELIC.RED_MASK') || deckTexts.some(c =>
    /apply\s+\d+\s+weak/i.test(c.description ?? ''),
  );

  // Echoing Slash: rare AoE that chains on kills — high priority when damage is the gap
  if (cardId === 'CARD.ECHOING_SLASH' && alreadyInDeck === 0 && deckLacksDamage) {
    strength = Math.min(30, strength + 8);
    synergy += 8;
    deckNeeds += 32;
    reasons.push('Deck lacks damage — Echoing Slash is strong AoE output');
  }

  // Tracking: +50% Attack damage vs Weak — top damage scaler when the deck needs output
  if (cardId === 'CARD.TRACKING' && alreadyInDeck === 0 && deckLacksDamage) {
    strength = Math.min(30, strength + 6);
    synergy += deckHasWeak ? 12 : 6;
    deckNeeds += deckHasWeak ? 30 : 22;
    reasons.push(
      deckHasWeak
        ? 'Deck lacks damage — Tracking is +50% Attack damage vs Weak'
        : 'Deck lacks damage — Tracking is strong damage scaling',
    );
  }

  // Power gap: bonus for first few power cards (not poison payoffs with no Poison yet)
  const offeredMentionsPoison = /poison/i.test(
    `${ct?.description ?? ''} ${(ct?.keywords ?? []).join(' ')}`,
  );
  const offeredIsPoisonPayoff = offeredMentionsPoison && !cardAppliesPoison(ct);
  if (ct?.type === 'Power' && powerCount < 2 && !(offeredIsPoisonPayoff && !deckHasPoison)) {
    deckNeeds += 4;
    reasons.push(`Only ${powerCount} power(s) in deck — scaling needed`);
  }

  // Power saturation: penalty for stacking too many powers (not for Defect who thrives on powers)
  if (ct?.type === 'Power' && powerCount >= 5 && character !== 'CHARACTER.DEFECT') {
    const excess = powerCount - 4;
    const penalty = Math.min(excess * 5, 15);
    deckNeeds = Math.max(0, deckNeeds - penalty);
    reasons.push(`↓ Already ${powerCount} powers in deck — diminishing returns`);
  }

  // Balance bonus: if very attack-heavy, reward skills/powers
  if (attackCount > 0 && skillCount === 0 && ct?.type !== 'Attack') {
    deckNeeds += 3;
    reasons.push('No skills in deck — improves versatility');
  }

  // Draw / cycle: early prefer 0-cost filter (Prepared) over paid pure-draw (Acrobatics)
  const cardDescLower = (ct?.description ?? '').toLowerCase();
  const isDrawCard = cardDescLower.includes('draw');
  const deckHasDraw = deckTexts.some(c => c.description?.toLowerCase().includes('draw'));
  const isBlockAndDraw = cardGainsNumericBlock(ct) && isDrawCard;

  // Young decks love free Block+Draw (Finesse, etc.) — tempo + consistency
  if (act === 1 && deckSize <= 20 && cardCost === 0 && isBlockAndDraw) {
    deckNeeds += 10;
    reasons.push('Early 0-cost Block+Draw — excellent tempo for a young deck');
  } else if (isDrawCard && !deckHasDraw && deckSize < 20) {
    const isPureDrawCycle = !/(deal \d+|gain \d+ block|gain \d+ energy|channel|apply )/i.test(cardDescLower);
    const baseDraw = parseInt(cardDescLower.match(/draw (\d+)/)?.[1] ?? '0', 10);
    const upgDraw = parseInt((ct?.upgrade_description ?? '').toLowerCase().match(/draw (\d+)/)?.[1] ?? '0', 10);
    const upgradeBoostsDraw = !isUpgraded && upgDraw > baseDraw;

    if (act === 1 && isPureDrawCycle && !isNaN(cardCost) && cardCost >= 1) {
      // Still some value, but energy is tight before Footwork / energy relics
      deckNeeds += 1;
      reasons.push('Early paid draw is pricey — prefer 0-cost cycle first (upgrade soon)');
    } else if (act === 1 && isPureDrawCycle && cardCost === 0) {
      deckNeeds += 6;
      reasons.push(
        upgradeBoostsDraw
          ? 'Early 0-cost cycle — take now, prioritize the upgrade'
          : 'Early 0-cost draw/cycle — efficient consistency',
      );
    } else {
      deckNeeds += 4;
      reasons.push('No draw in deck — this fills a critical gap');
    }
  }

  // Act 1 energy efficiency — prefer >6 damage or >5 Block per energy (0-cost = free)
  // Powers skipped — conditional payoffs (e.g. Outbreak) are not "efficient attacks"
  if (act === 1 && deckSize <= 22 && ct && ct.type !== 'Power') {
    const dmg = parseInt(cardDescLower.match(/deal (\d+) damage/)?.[1] ?? '0', 10);
    const blockAmt = parseInt(
      cardDescLower.replace(/unblocked/g, '').match(/gain (\d+) block/)?.[1] ?? '0',
      10,
    );
    const isInnate = (ct.keywords ?? []).some(k => k.toLowerCase() === 'innate');
    const energy = isNaN(cardCost) ? 99 : cardCost;
    const nonStrikeAttacks = deckTexts.filter(
      c => c.type === 'Attack' && !/strike/i.test(c.id) && !/strike/i.test(c.name),
    ).length;

    if (energy === 0 && dmg >= 8) {
      // Backstab-tier free upfront damage — premium Act 1 deck fit
      let bonus = dmg >= 11 ? 20 : 16;
      if (isInnate) bonus += 8;
      if (nonStrikeAttacks < 2) {
        bonus += 10;
        reasons.push('Act 1 deck needs upfront damage beyond Strikes');
      }
      deckNeeds += bonus;
      reasons.push(
        isInnate
          ? `Early free Innate damage (${dmg}) — high energy-efficiency opener`
          : `Early 0-cost damage (${dmg}) — high energy efficiency`,
      );
    } else if (energy > 0 && energy <= 2 && dmg / energy > 6) {
      let bonus = 8;
      if (nonStrikeAttacks < 2) bonus += 4;
      deckNeeds += bonus;
      reasons.push(`Efficient damage (${dmg} for ${energy} energy) — beats Act 1 6 dmg/energy bar`);
    } else if (energy === 0 && blockAmt >= 5 && !isBlockAndDraw) {
      deckNeeds += 10;
      reasons.push(`Early 0-cost Block (${blockAmt}) — efficient defense`);
    } else if (energy > 0 && energy <= 2 && blockAmt / energy > 5 && !isBlockAndDraw) {
      deckNeeds += 6;
      reasons.push(`Efficient Block (${blockAmt} for ${energy} energy) — beats Act 1 5 Block/energy bar`);
    }
  }

  // Poison payoff with no Poison sources — downrank (Outbreak, Mirage, etc.)
  // Skip enablers like Deadly Poison / Noxious Fumes that apply Poison themselves.
  if (offeredMentionsPoison && !deckHasPoison && !cardAppliesPoison(ct)) {
    deckNeeds = Math.min(deckNeeds, 10);
    reasons.push('↓ No Poison in deck — poison payoff is premature');
  }

  // Vulnerable gap: bonus for adding a Vulnerable source when deck has very few
  const vulnAppliers = deckTexts.filter(c =>
    /apply.*vulnerable|vulnerable.*apply/i.test(c.description ?? '')
  ).length;
  const cardAppliesVuln = /apply.*vulnerable|vulnerable.*apply/i.test(ct?.description ?? '');
  if (cardAppliesVuln && vulnAppliers < 2) {
    const bonus = vulnAppliers === 0 ? 8 : 4;
    deckNeeds += bonus;
    const urgency = vulnAppliers === 0 ? 'No Vulnerable source' : 'Only 1 Vulnerable source';
    reasons.push(`↑ ${urgency} — desperate need, 50% damage amp with Vicious/Whirlwind`);
  }

  // Avoid trap cards
  if (charCtx?.avoid_cards.includes(cardId)) {
    deckNeeds = 0;
    reasons.push(`Avoid card for ${character.replace('CHARACTER.', '')}`);
  }

  // Regent: penalise mixing Stars and Forge
  if (character === 'CHARACTER.REGENT') {
    const deckText = deck.map(id => cardTextMap.get(id)?.description ?? '').join(' ').toLowerCase();
    const cardDesc = (ct?.description ?? '').toLowerCase() + (ct?.name ?? '').toLowerCase();
    const deckHasStars = deckText.includes('star') || deck.some(id => id.includes('ALIGNMENT') || id.includes('SEVEN_STARS') || id.includes('BIG_BANG'));
    const deckHasForge = deckText.includes('forge') || deck.some(id => id.includes('SOVEREIGN') || id.includes('BULWARK') || id.includes('FURNACE'));
    const cardIsStars = cardDesc.includes('star') || ['CARD.BIG_BANG','CARD.ALIGNMENT','CARD.SEVEN_STARS','CARD.CONVERGENCE'].includes(cardId);
    const cardIsForge = cardDesc.includes('forge') || ['CARD.SUMMON_FORTH','CARD.CONQUEROR','CARD.FURNACE','CARD.BULWARK'].includes(cardId);
    if (deckHasStars && cardIsForge && !deckHasForge) {
      deckNeeds = Math.max(0, deckNeeds - 12);
      reasons.push('⚠ Stars deck — adding Forge cards weakens both archetypes');
    } else if (deckHasForge && cardIsStars && !deckHasStars) {
      deckNeeds = Math.max(0, deckNeeds - 12);
      reasons.push('⚠ Forge deck — adding Stars cards weakens both archetypes');
    }
  }

  deckNeeds = Math.round(clamp(deckNeeds, 0, 40));

  // ── Factor 4: Win Condition (0–20) ─────────────────────────────────────────
  // Scores how well the offered card advances or completes the deck's win conditions
  let winCon = 0;
  const metaBuilds = charCtx?.meta_builds;
  if (metaBuilds) {
    let bestWinConBonus = 0;
    let bestWinConReason = '';

    for (const [, build] of Object.entries(metaBuilds)) {
      const core: string[] = build.core ?? [];
      if (core.length === 0) continue;
      const deckHas = core.filter(c => deckSet.has(c));
      const progress = deckHas.length / core.length; // 0–1
      const isCorePiece = core.includes(cardId);

      if (isCorePiece) {
        let bonus = 0;
        if (progress >= 0.5) {
          // 50%+ of the build is in deck — completing it is high value
          bonus = Math.round(10 + progress * 10); // 15–20
          bestWinConReason = `Completes ${build.description ?? 'win condition'} (${deckHas.length}/${core.length} pieces)`;
        } else if (progress > 0) {
          // Started build — advancing it
          bonus = Math.round(8 + progress * 8); // 8–16
          bestWinConReason = `Advances ${build.description ?? 'win condition'} (${deckHas.length}/${core.length} pieces)`;
        } else {
          // First piece — opens a new win condition
          bonus = 6;
          bestWinConReason = `Opens ${build.description ?? 'win condition'} strategy`;
        }
        if (bonus > bestWinConBonus) bestWinConBonus = bonus;
      } else if (progress >= 0.5 && deckHas.length >= 2) {
        // Deck is committed to this build — non-core cards that synergise get a smaller bump
        const cardTextLower = `${ct?.description ?? ''} ${(ct?.keywords ?? []).join(' ')}`.toLowerCase();
        const buildDesc = build.description?.toLowerCase() ?? '';
        if (buildDesc.split(' ').some(w => w.length > 4 && cardTextLower.includes(w))) {
          const bonus = Math.round(4 + progress * 6); // 4–10
          if (bonus > bestWinConBonus) {
            bestWinConBonus = bonus;
            bestWinConReason = `Supports active ${build.description ?? 'win condition'} build`;
          }
        }
      }
    }

    if (bestWinConBonus > 0) {
      winCon = bestWinConBonus;
      reasons.push(bestWinConReason);
    }
  }
  winCon = Math.round(clamp(winCon, 0, 20));

  // ── Factor 5: Rarity — not scored (rarity alone is not a pick signal) ──────
  const rarity = 0;

  // ── Boss Context bonus — folded into synergy ──────────────────────────────
  let bossBonus = 0;
  if (currentBoss && ctx.boss_context) {
    const bossCtx = ctx.boss_context[currentBoss];
    if (bossCtx && ct) {
      const kws = ct.keywords.map(k => k.toLowerCase());
      const desc = ct.description.toLowerCase();
      if (bossCtx.boost_aoe && (kws.includes('aoe') || desc.includes('all enemies') || desc.includes('every enemy'))) {
        bossBonus += 8;
        reasons.unshift(`⚔ ${bossCtx.name}: AoE hits both claws`);
      }
      if (bossCtx.boost_poison && (kws.includes('poison') || desc.includes('poison'))) {
        bossBonus += 6;
        reasons.unshift(`⚔ ${bossCtx.name}: Poison bypasses block stacking`);
      }
      if (bossCtx.boost_keywords) {
        for (const bk of bossCtx.boost_keywords) {
          if (kws.includes(bk) || desc.includes(bk)) {
            bossBonus += 4;
            reasons.push(`⚔ ${bossCtx.name}: ${bk} is helpful for this boss`);
            break;
          }
        }
      }
    }
  }
  bossBonus = clamp(bossBonus, 0, 10);

  // ── Final score ────────────────────────────────────────────────────────────
  const total = clamp(strength + synergy + deckNeeds + winCon + rarity + bossBonus, 0, 100);

  const recommendation: CardScore['recommendation'] =
    total >= 65 ? 'strong' :
    total >= 40 ? 'consider' :
    'skip';

  return {
    card_id: cardId,
    name: ct?.name ?? cardId.replace('CARD.', '').replace(/_/g, ' '),
    score: total,
    factors: { strength, synergy, deck_needs: deckNeeds, win_con: winCon, rarity },
    reasons: reasons.slice(0, 4),
    recommendation,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function recommend(db: DatabaseSync, req: RecommendRequest): CardScore[] {
  const cardTexts = loadJson<CardText[]>('card_text.json') ?? [];
  const ctx = loadJson<GameContext>('game_context.json');

  if (!ctx) throw new Error('game_context.json not found');

  const cardTextMap = new Map(cardTexts.map(c => [c.id, c]));

  // Win rates filtered by character + global fallback
  const charWinRates = getWinRates(db, req.character);
  const allWinRates = getWinRates(db);

  // Synergies involving any non-basic card in current deck OR offered cards
  const allCards = [...new Set([...req.deck, ...req.offered])].filter(id => !BASIC_CARDS.has(id));
  const synergyMap = getSynergiesForDeck(db, allCards, req.character);

  const relics = req.relics ?? [];

  const deckUpgrades = req.deckUpgrades ?? [];

  return req.offered.map((cardId, i) =>
    scoreCard(
      cardId,
      req.deck,
      req.character,
      req.floor,
      relics,
      req.offeredUpgrades?.[i] ?? false,
      deckUpgrades,
      charWinRates,
      allWinRates,
      synergyMap,
      cardTextMap,
      ctx,
      db,
      req.currentBoss,
    )
  );
}
