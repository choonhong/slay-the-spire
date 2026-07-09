import fs from 'fs';
import path from 'path';
import type { DatabaseSync } from 'node:sqlite';

// ─── Data file paths ──────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '../../data');

interface CardText {
  id: string;
  name: string;
  description: string;
  cost: string;
  type: string;
  rarity: string;
  color: string;
  keywords: string[];
}

interface CommunityCard {
  id: string;
  powerScore: number;
  powerTier: string;
  eloRating: number;
  winRateDelta: number;
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
  enablers: string[];
  filter: { cost?: string; type?: string };
  bonus: number;
  reason: string;
}

interface GameContext {
  characters: Record<string, CharacterContext>;
  keyword_synergies: Record<string, string[]>;
  mechanic_synergies?: Record<string, MechanicSynergy | string>;
  universal_trap_cards: string[];
  act_principles: Record<string, ActPrinciple>;
  baalorlord_tiers?: Record<string, TierList>;
}

// ─── Public types ─────────────────────────────────────────────────────────────
export interface RecommendRequest {
  deck: string[];       // card IDs currently in deck
  offered: string[];    // 1–3 card IDs being offered
  character: string;    // CHARACTER.REGENT etc.
  floor: number;        // 0 = unknown
}

export interface ScoreFactors {
  strength: number;    // 0–30  card baseline power
  synergy: number;     // 0–25  fit with current deck
  deck_needs: number;  // 0–20  fills a gap in the deck
  act_context: number; // 0–15  appropriate for this stage
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

// ─── Cards excluded from synergy (basics + curses) ───────────────────────────
const _curseIds = new Set(
  (loadJson<CardText[]>('card_text.json') ?? [])
    .filter(c => c.color === 'curse')
    .map(c => c.id)
);

const BASIC_CARDS = new Set([
  'CARD.STRIKE_IRONCLAD','CARD.STRIKE_SILENT','CARD.STRIKE_DEFECT',
  'CARD.STRIKE_WATCHER','CARD.STRIKE_REGENT','CARD.STRIKE_NECROBINDER',
  'CARD.DEFEND_IRONCLAD','CARD.DEFEND_SILENT','CARD.DEFEND_DEFECT',
  'CARD.DEFEND_WATCHER','CARD.DEFEND_REGENT','CARD.DEFEND_NECROBINDER',
  // Starter non-Strike/Defend cards
  'CARD.BASH',                        // Ironclad
  'CARD.ZAP','CARD.DUALCAST',         // Defect
  'CARD.ERUPTION','CARD.VIGILANCE',   // Watcher
  ..._curseIds,
]);

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
      ROUND(SUM(r.win) * 100.0 / COUNT(DISTINCT r.id), 1) AS win_rate_together
    FROM card_choices a
    JOIN card_choices b ON b.run_id = a.run_id AND a.card_id < b.card_id
    JOIN runs r ON r.id = a.run_id
    WHERE ${conditions.join(' AND ')}
    GROUP BY a.card_id, b.card_id
    HAVING COUNT(DISTINCT r.id) >= 2
  `).all(...params) as SynergyRow[];

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
  winRates: Map<string, WinRateRow>,
  allWinRates: Map<string, WinRateRow>,
  synergyMap: Map<string, SynergyRow[]>,
  communityMap: Map<string, CommunityCard>,
  cardTextMap: Map<string, CardText>,
  ctx: GameContext,
): CardScore {
  const act = actFromFloor(floor);
  const charCtx = ctx.characters[character];
  const actCtx = ctx.act_principles[String(act)];
  const ct = cardTextMap.get(cardId);
  const community = communityMap.get(cardId);
  const reasons: string[] = [];

  // ── Factor 1: Card Strength (0–30) ─────────────────────────────────────────
  let strength = 0;

  // Source A: our per-character win rate
  const wrRow = winRates.get(cardId) ?? allWinRates.get(cardId);
  if (wrRow && wrRow.runs >= 2) {
    strength = clamp((wrRow.win_rate / 100) * 30, 0, 30);
    reasons.push(`${wrRow.win_rate.toFixed(0)}% win rate in ${wrRow.runs} runs`);
  }

  // Source B: community ELO (1000 = neutral, 1800 = exceptional)
  if (community) {
    const eloScore = clamp(((community.eloRating - 900) / 900) * 30, 0, 30);
    if (eloScore > strength) {
      strength = eloScore;
    }
    if (community.powerTier && community.powerScore > 0) {
      reasons.push(`Community tier ${community.powerTier} (${community.powerScore.toFixed(0)} score)`);
    }
  }

  // Trap card hard-cap
  if (ctx.universal_trap_cards.includes(cardId)) {
    strength = 0;
    reasons.push('⚠ Trap card — generally harmful');
  }

  // Character S-tier boost
  if (charCtx?.tier_list_s?.includes(cardId)) {
    strength = Math.min(30, strength + 6);
    if (!reasons.some(r => r.includes('tier'))) reasons.push('S-tier card for this character');
  }
  // D-tier penalty
  if (charCtx?.tier_list_d?.includes(cardId)) {
    strength = Math.max(0, strength - 10);
    reasons.push('D-tier — generally weak for this character');
  }
  // best_cards bonus
  if (charCtx?.best_cards?.includes(cardId) && !charCtx?.tier_list_s?.includes(cardId)) {
    strength = Math.min(30, strength + 3);
  }

  // Source D: Baalorlord's pro tier list (independent signal)
  const baalordTier = getBaalorlordTier(cardId, character, ctx, cardTextMap);
  if (baalordTier !== null) {
    strength = clamp(strength + BAALORD_TIER_DELTA[baalordTier], 0, 30);
    if (baalordTier === 'S') reasons.push(`Baalorlord: S-tier for ${character.replace('CHARACTER.', '')}`);
    else if (baalordTier === 'A') reasons.push(`Baalorlord: A-tier`);
    else if (baalordTier === 'D') reasons.push(`⚠ Baalorlord: D-tier — weak for this character`);
    else if (baalordTier === 'F') reasons.push(`⚠ Baalorlord: F-tier — avoid`);
  }

  strength = Math.round(strength);

  // ── Factor 2: Deck Synergy (0–25) ─────────────────────────────────────────
  let synergy = 0;
  const deckSet = new Set(deck);

  // DB synergy pairs — exclude basic starter cards from both sides
  const pairs = synergyMap.get(cardId) ?? [];
  const relevantPairs = pairs
    .filter(p =>
      !BASIC_CARDS.has(p.card_a) && !BASIC_CARDS.has(p.card_b) &&
      (deckSet.has(p.card_a) || deckSet.has(p.card_b))
    )
    .sort((a, b) => b.win_rate_together - a.win_rate_together)
    .slice(0, 3);

  for (const p of relevantPairs) {
    const partner = p.card_a === cardId ? p.card_b : p.card_a;
    const lift = clamp(p.win_rate_together / 100, 0, 1);
    synergy += lift * 8;
    const partnerCt = cardTextMap.get(partner);
    if (partnerCt) reasons.push(`Pairs with ${partnerCt.name} (${p.win_rate_together}% wr together)`);
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
    if (ms._comment) continue;
    const { enablers, filter, bonus, reason } = ms as {
      enablers: string[];
      filter: { cost?: string; type?: string };
      bonus: number;
      reason: string;
    };
    const deckHasEnabler = enablers.some(e => deckSet.has(e));
    if (!deckHasEnabler) continue;
    const costMatch = filter.cost === undefined || ct?.cost === filter.cost;
    const typeMatch = filter.type === undefined || ct?.type?.toLowerCase() === filter.type.toLowerCase();
    if (costMatch && typeMatch) {
      synergy += bonus;
      reasons.push(reason);
    }
  }

  // Archetype match
  if (charCtx) {
    const cardText = `${ct?.name ?? ''} ${ct?.description ?? ''} ${cardKeywords.join(' ')}`.toLowerCase();
    const archetypeHits = charCtx.archetypes.filter(a => cardText.includes(a.toLowerCase()));
    if (archetypeHits.length > 0) {
      synergy += archetypeHits.length * 2;
    }
    if (charCtx.key_synergy_cards.includes(cardId)) {
      synergy += 5;
      reasons.push('Key win-condition card for this character');
    }
  }

  synergy = Math.round(clamp(synergy, 0, 25));

  // ── Factor 3: Deck Needs (0–20) ────────────────────────────────────────────
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

  // Power gap: bonus for first few power cards
  if (ct?.type === 'Power' && powerCount < 2) {
    deckNeeds += 4;
    reasons.push(`Only ${powerCount} power(s) in deck — scaling needed`);
  }

  // Balance bonus: if very attack-heavy, reward skills/powers
  if (attackCount > 0 && skillCount === 0 && ct?.type !== 'Attack') {
    deckNeeds += 3;
    reasons.push('No skills in deck — improves versatility');
  }

  // Draw / cycle cards are almost always needed early
  const isDrawCard = (ct?.description ?? '').toLowerCase().includes('draw');
  const deckHasDraw = deckTexts.some(c => c.description?.toLowerCase().includes('draw'));
  if (isDrawCard && !deckHasDraw && deckSize < 20) {
    deckNeeds += 4;
    reasons.push('No draw in deck — this fills a critical gap');
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

  deckNeeds = Math.round(clamp(deckNeeds, 0, 20));

  // ── Factor 4: Act Context (0–15) ──────────────────────────────────────────
  let actContext = 0;

  const costWeight = actCtx?.cost_weights?.[ct?.cost ?? '1'] ?? 0.7;
  actContext = Math.round(costWeight * 15);

  // Act 3 rarity boost
  if (act === 3 && ct?.rarity === 'Rare') {
    actContext = 15;
    reasons.push('Act 3: Rare cards are high priority');
  } else if (act === 3 && ct?.rarity === 'Common') {
    actContext = Math.min(actContext, 5);
    reasons.push('Act 3: Common cards rarely improve a built deck');
  } else if (act === 1 && !isNaN(cardCost) && cardCost <= 1) {
    reasons.push('Act 1: efficient 1-cost card');
  } else if (act === 1 && !isNaN(cardCost) && cardCost >= 3) {
    reasons.push('Act 1: 3-cost is risky without energy scaling');
  }

  actContext = clamp(actContext, 0, 15);

  // ── Factor 5: Rarity — not scored (rarity alone is not a pick signal) ──────
  const rarity = 0;

  // ── Final score ────────────────────────────────────────────────────────────
  const total = clamp(strength + synergy + deckNeeds + actContext + rarity, 0, 100);

  const recommendation: CardScore['recommendation'] =
    total >= 65 ? 'strong' :
    total >= 40 ? 'consider' :
    'skip';

  return {
    card_id: cardId,
    name: ct?.name ?? cardId.replace('CARD.', '').replace(/_/g, ' '),
    score: total,
    factors: { strength, synergy, deck_needs: deckNeeds, act_context: actContext, rarity },
    reasons: reasons.slice(0, 4),
    recommendation,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function recommend(db: DatabaseSync, req: RecommendRequest): CardScore[] {
  const cardTexts = loadJson<CardText[]>('card_text.json') ?? [];
  const community = loadJson<CommunityCard[]>('community_cards.json') ?? [];
  const ctx = loadJson<GameContext>('game_context.json');

  if (!ctx) throw new Error('game_context.json not found');

  const cardTextMap = new Map(cardTexts.map(c => [c.id, c]));
  const communityMap = new Map(community.map(c => [c.id, c]));

  // Win rates filtered by character + global fallback
  const charWinRates = getWinRates(db, req.character);
  const allWinRates = getWinRates(db);

  // Synergies involving any non-basic card in current deck OR offered cards
  const allCards = [...new Set([...req.deck, ...req.offered])].filter(id => !BASIC_CARDS.has(id));
  const synergyMap = getSynergiesForDeck(db, allCards, req.character);

  return req.offered.map(cardId =>
    scoreCard(
      cardId,
      req.deck,
      req.character,
      req.floor,
      charWinRates,
      allWinRates,
      synergyMap,
      communityMap,
      cardTextMap,
      ctx,
    )
  );
}
