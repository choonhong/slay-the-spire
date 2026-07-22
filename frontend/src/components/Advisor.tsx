import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  fetchCardText,
  fetchRecommendations,
  fetchCurrentRun,
  fetchCombatPace,
  type CardText,
  type CardScore,
  type CombatPace,
} from '../api';
import { CardNameCell } from './CardNameCell';
import { formatCharacter, formatRelicId, formatEncounterId } from '../utils';
import PageHeader from './PageHeader';

// ─── Search helpers ───────────────────────────────────────────────────────────
/** 0 = exact · 1 = name starts-with · 2 = word starts-with · 3 = contains */
function searchRank(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(' ').some(w => w.startsWith(q))) return 2;
  return 3;
}

function sortByQuery<T extends { name: string }>(items: T[], q: string): T[] {
  return [...items].sort((a, b) => {
    const ra = searchRank(a.name, q), rb = searchRank(b.name, q);
    if (ra !== rb) return ra - rb;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CHARACTERS = [
  'CHARACTER.IRONCLAD',
  'CHARACTER.SILENT',
  'CHARACTER.NECROBINDER',
  'CHARACTER.REGENT',
  'CHARACTER.DEFECT',
  'CHARACTER.WATCHER',
];

const CHARACTER_COLOR: Record<string, string> = {
  IRONCLAD:    'text-gray-200',
  SILENT:      'text-gray-200',
  DEFECT:      'text-gray-200',
  WATCHER:     'text-gray-200',
  NECROBINDER: 'text-gray-200',
  REGENT:      'text-gray-200',
};

const SCORE_COLORS: Record<CardScore['recommendation'], { ring: string; badge: string; label: string }> = {
  strong:   { ring: 'ring-2 ring-green-500',  badge: 'bg-green-600 text-white',  label: '✦ Strong Pick' },
  consider: { ring: 'ring-2 ring-yellow-500', badge: 'bg-yellow-600 text-white', label: '◈ Consider' },
  skip:     { ring: 'ring-2 ring-gray-600',   badge: 'bg-gray-700 text-gray-300', label: '✕ Skip' },
};

const FACTOR_LABELS: Record<string, { label: string; max: number; color: string }> = {
  strength:    { label: 'Strength',   max: 30, color: 'bg-blue-500' },
  synergy:     { label: 'Synergy',    max: 25, color: 'bg-purple-500' },
  deck_needs:  { label: 'Deck Fit',   max: 40, color: 'bg-teal-500' },
  win_con:     { label: 'Win Con',    max: 20, color: 'bg-amber-500' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
type SearchEntry = { card: CardText; upgraded: boolean };

function CardSearch({
  cards,
  character,
  placeholder,
  value,
  upgraded,
  onChange,
  onSelected,
  requestFocus,
  onFocusHandled,
}: {
  cards: CardText[];
  character: string;
  placeholder: string;
  value: string;
  upgraded: boolean;
  onChange: (id: string, upgraded: boolean) => void;
  onSelected?: () => void;
  requestFocus?: boolean;
  onFocusHandled?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const charColor = character.replace('CHARACTER.', '').toLowerCase();

  const filtered = useMemo<SearchEntry[]>(() => {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    const matches = cards.filter(c =>
      (c.color === charColor || c.color === 'colorless' || c.color === 'event') &&
      (c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    );
    return sortByQuery(matches, q).slice(0, 12).map(c => ({ card: c, upgraded: false }));
  }, [query, cards, charColor]);

  const selected = cards.find(c => c.id === value);

  useEffect(() => { setHighlightedIdx(-1); }, [filtered]);
  useEffect(() => {
    if (highlightedIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx]);

  // Parent asked us to start typing (after previous slot was confirmed)
  useEffect(() => {
    if (!requestFocus) return;
    setQuery('');
    setEditing(true);
    setOpen(false);
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      onFocusHandled?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [requestFocus, onFocusHandled]);

  const selectItem = useCallback((e: SearchEntry, advance = false) => {
    onChange(e.card.id, e.upgraded);
    setQuery('');
    setEditing(false);
    setOpen(false);
    setHighlightedIdx(-1);
    // Only Enter advances to the next offered-card slot — mouse click stays put
    if (advance) onSelected?.();
  }, [onChange, onSelected]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[highlightedIdx] ?? filtered[0];
      if (target) selectItem(target, true);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setEditing(false);
      setQuery('');
    }
  }, [open, filtered, highlightedIdx, selectItem]);

  // Outside click — auto-select first result if dropdown is open, otherwise just close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (open && filtered.length > 0) {
          const target = filtered[highlightedIdx] ?? filtered[0];
          if (target) selectItem(target);
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, filtered, highlightedIdx, selectItem]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing]);

  const COST_COLORS: Record<string, string> = {
    '0': 'bg-green-700', '1': 'bg-blue-700', '2': 'bg-yellow-700',
    '3': 'bg-red-800', 'X': 'bg-purple-700', 'N/A': 'bg-gray-700',
  };

  return (
    <div ref={ref} className="relative">
      {selected && !editing ? (
        <div className={`flex items-stretch bg-gray-800 border rounded-lg overflow-hidden transition-colors ${upgraded ? 'border-cyan-600' : 'border-gray-600'}`}>
          <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-0">
            <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded ${COST_COLORS[selected.cost] ?? 'bg-gray-700'} text-white shrink-0`}>
              {selected.cost}
            </span>
            {/* Click name to enter edit mode — prefills query, doesn't clear */}
            <span
              className={`text-sm font-bold flex-1 cursor-text hover:brightness-125 truncate ${RARITY_COLOR[selected.rarity] ?? 'text-gray-100'}`}
              onClick={() => { setQuery(selected.name); setEditing(true); setOpen(true); }}
            >
              {selected.name}
            </span>
          </div>
          {/* + toggle — full height */}
          <button
            onMouseDown={e => {
              e.stopPropagation();
              onChange(selected.id, !upgraded);
            }}
            className={`px-3 text-sm font-bold border-l transition-colors shrink-0 ${
              upgraded
                ? 'bg-cyan-700 border-cyan-600 text-cyan-200 hover:bg-cyan-600'
                : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white hover:bg-gray-600'
            }`}
            title="Toggle upgraded version"
          >+</button>
        </div>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setOpen(true);
              if (editing && selected) {
                onChange('', false);
                setEditing(false);
              }
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 pr-8 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-spire-500"
          />
          {query && (
            <button
              onMouseDown={e => {
                e.preventDefault();
                setQuery('');
                setEditing(false);
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200 text-lg leading-none"
            >×</button>
          )}
        </div>
      )}

      {open && filtered.length > 0 && (
        <div ref={listRef} className="absolute z-50 top-full mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {filtered.map((entry, i) => (
            <button
              key={`${entry.card.id}-${entry.upgraded}`}
              onMouseDown={() => selectItem(entry)}
              onMouseEnter={() => setHighlightedIdx(i)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${i === highlightedIdx ? 'bg-gray-700' : 'hover:bg-gray-800'}`}
            >
              <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded ${COST_COLORS[entry.card.cost] ?? 'bg-gray-700'} text-white shrink-0`}>
                {entry.card.cost}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold truncate ${RARITY_COLOR[entry.card.rarity] ?? 'text-gray-100'}`}>{entry.card.name}</div>
                <div className="text-xs text-gray-500 truncate">{entry.card.description?.slice(0, 55)}{(entry.card.description?.length ?? 0) > 55 ? '…' : ''}</div>
              </div>
              <span className="text-xs text-gray-600 shrink-0">{entry.card.rarity[0]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreCard({ score, rank, upgraded }: { score: CardScore; rank: number; upgraded: boolean }) {
  const style = SCORE_COLORS[score.recommendation];

  return (
    <div className={`relative flex flex-col gap-3 rounded-xl bg-gray-900 border border-gray-800 p-4 ${style.ring} transition-all`}>
      {/* Rank badge */}
      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center text-xs font-bold text-gray-300">
        {rank}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-2 pt-1">
        <div>
          <div className="font-bold text-gray-100">
            {score.name}{upgraded && <span className="text-cyan-400 font-bold ml-0.5">+</span>}
          </div>
          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
            {style.label}
          </span>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-bold text-white leading-none">{score.score}</div>
          <div className="text-xs text-gray-500 mt-0.5">/ 100</div>
        </div>
      </div>

      {/* Score breakdown bars */}
      <div className="space-y-1.5">
        {(Object.entries(score.factors) as [string, number][]).map(([key, val]) => {
          const meta = FACTOR_LABELS[key];
          if (!meta) return null;
          const isNegative = val < 0;
          const pct = Math.min((Math.abs(val) / meta.max) * 100, 100);
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-16 shrink-0">{meta.label}</span>
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${isNegative ? 'bg-red-500' : meta.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`text-xs w-6 text-right tabular-nums ${isNegative ? 'text-red-400' : 'text-gray-400'}`}>{val}</span>
            </div>
          );
        })}
      </div>

      {/* Reasons */}
      {score.reasons.length > 0 && (
        <ul className="space-y-1 border-t border-gray-800 pt-2">
          {score.reasons.map((r, i) => (
            <li key={i} className="text-xs text-gray-400 flex gap-1.5">
              <span className="text-gray-600 shrink-0">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}

const RARITY_COLOR: Record<string, string> = {
  Common:    'text-gray-300',
  Uncommon:  'text-blue-400',
  Rare:      'text-yellow-400',
  Special:   'text-purple-400',
  Starter:   'text-gray-500',
  Curse:     'text-red-400',
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function Advisor() {
  const [allCards, setAllCards] = useState<CardText[]>([]);
  const [cardMap, setCardMap] = useState<Map<string, CardText>>(new Map());
  const [loading, setLoading] = useState(true);

  const [character, setCharacter] = useState('CHARACTER.REGENT');
  const [floor, setFloor] = useState(1);
  const [deck, setDeck] = useState<string[]>([]);
  const [relics, setRelics] = useState<string[]>([]);
  const [upgrades, setUpgrades] = useState<string[]>([]);
  const [offered, setOffered] = useState<[string, string, string]>(['', '', '']);
  const [offeredUpgrades, setOfferedUpgrades] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [focusOfferedSlot, setFocusOfferedSlot] = useState<number | null>(null);
  const [currentBoss, setCurrentBoss] = useState<string | null>(null);
  const [actIndex, setActIndex] = useState<number | null>(null);

  const [scores, setScores] = useState<CardScore[] | null>(null);
  const [scoring, setScoring] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [combatPace, setCombatPace] = useState<CombatPace | null>(null);

  // Load card text once, then immediately sync
  useEffect(() => {
    fetchCardText().then(cards => {
      setAllCards(cards);
      setCardMap(new Map(cards.map(c => [c.id, c])));
      setLoading(false);
      syncFromSave(true);
    });
  }, []);

  // Historical clear speed for this character — damage-quality proxy
  useEffect(() => {
    let cancelled = false;
    fetchCombatPace(character)
      .then(pace => { if (!cancelled) setCombatPace(pace); })
      .catch(() => { if (!cancelled) setCombatPace(null); });
    return () => { cancelled = true; };
  }, [character]);

  // Keep a stable ref to syncFromSave to avoid stale closures in the interval
  const syncRef = useRef(syncFromSave);
  useEffect(() => { syncRef.current = syncFromSave; });

  // Auto-sync deck/relics every 10s while tab is open
  useEffect(() => {
    const interval = setInterval(() => syncRef.current(true), 10000);
    return () => clearInterval(interval);
  }, []);

  const act = actIndex != null ? actIndex + 1 : (floor <= 0 ? 1 : floor <= 17 ? 1 : floor <= 34 ? 2 : 3);
  const charKey = character.replace('CHARACTER.', '');
  const charColorClass = CHARACTER_COLOR[charKey] ?? 'text-gray-300';

  const filledOffered = offered.filter(Boolean);
  const canScore = filledOffered.length >= 1;

  async function syncFromSave(silent = false) {
    setSyncing(true);
    try {
      // Backend reads current_run.save from the local STS2 saves folder
      const run = await fetchCurrentRun();
      if (run.floor > 0) setFloor(run.floor);
      if (run.currentBoss) setCurrentBoss(run.currentBoss);
      if (run.actIndex != null) setActIndex(run.actIndex);
      if (run.character) {
        setCharacter(run.character);
        const newDeck = run.deck.filter((id: string) => id.startsWith('CARD.'));
        const newRelics = run.relics ?? [];
        const newUpgrades = run.upgrades ?? [];
        // Only reset scores if deck actually changed (silent auto-sync should not wipe scores)
        setDeck(prev => {
          const changed = prev.length !== newDeck.length || prev.some((id, i) => id !== newDeck[i]);
          if (changed && !silent) setScores(null);
          return newDeck;
        });
        setRelics(newRelics);
        setUpgrades(newUpgrades);
      }
      if (!silent) setSetupCollapsed(false);
    } catch {
      if (!silent) setError('No active run found — start a run in-game, or set the saves path in Settings.');
    } finally {
      setSyncing(false);
    }
  }

  async function score() {
    if (!canScore) return;
    setScoring(true);
    setError(null);
    try {
      try {
        const run = await fetchCurrentRun();
        if (run.floor > 0) setFloor(run.floor);
      } catch { /* ignore if no active run */ }

      const result = await fetchRecommendations({
        deck,
        offered: filledOffered,
        offeredUpgrades: filledOffered.map((_, i) => offeredUpgrades[i] ?? false),
        deckUpgrades: upgrades,
        character,
        floor,
        relics,
        currentBoss,
      });
      setScores(result);
    } catch {
      setError('Failed to get recommendations. Is the backend running?');
    } finally {
      setScoring(false);
    }
  }

  function removeFromDeck(idx: number) {
    setDeck(d => d.filter((_, i) => i !== idx));
    setScores(null);
  }

  function setOfferedCard(slot: number, id: string, isUpgraded = false) {
    setOffered(prev => {
      const next = [...prev] as [string, string, string];
      next[slot] = id;
      return next;
    });
    setOfferedUpgrades(prev => {
      const next = [...prev] as [boolean, boolean, boolean];
      next[slot] = isUpgraded;
      return next;
    });
    // Keep previous scores visible until user re-runs — don't collapse
  }

  function loadStarterDeck() {
    // Common starter structures per character
    const starters: Record<string, string[]> = {
      'CHARACTER.IRONCLAD':    Array(5).fill('CARD.STRIKE_IRONCLAD').concat(Array(4).fill('CARD.DEFEND_IRONCLAD'), ['CARD.BASH']),
      'CHARACTER.SILENT':      Array(5).fill('CARD.STRIKE_SILENT').concat(Array(5).fill('CARD.DEFEND_SILENT')),
      'CHARACTER.DEFECT':      Array(4).fill('CARD.STRIKE_DEFECT').concat(Array(4).fill('CARD.DEFEND_DEFECT'), ['CARD.ZAP', 'CARD.DUALCAST']),
      'CHARACTER.NECROBINDER': Array(4).fill('CARD.STRIKE_NECROBINDER').concat(Array(4).fill('CARD.DEFEND_NECROBINDER')),
      'CHARACTER.REGENT':      Array(4).fill('CARD.STRIKE_REGENT').concat(Array(4).fill('CARD.DEFEND_REGENT')),
      'CHARACTER.WATCHER':     Array(4).fill('CARD.STRIKE_WATCHER').concat(Array(4).fill('CARD.DEFEND_WATCHER'), ['CARD.ERUPTION', 'CARD.VIGILANCE']),
    };
    setDeck(starters[character] ?? []);
    setScores(null);
  }

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading card data…</div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Advisor"
        onRefresh={() => syncFromSave(false)}
        refreshLabel={syncing ? 'Syncing…' : 'Sync'}
      />

      {/* ── Setup section (collapsible) ── */}
      {setupCollapsed ? (
        /* Collapsed summary bar */
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900/60 border border-gray-800 rounded-lg">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className={`font-semibold ${charColorClass}`}>{formatCharacter(character)}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-200">Floor {floor} · Act {act}</span>
            {currentBoss && (
              <>
                <span className="text-gray-400">·</span>
                <span className="text-yellow-400 font-medium">{formatEncounterId(currentBoss)}</span>
              </>
            )}
            <span className="text-gray-400">·</span>
            <span className="text-gray-300">{deck.length} cards</span>
            {relics.length > 0 && (
              <>
                <span className="text-gray-400">·</span>
                <span className="text-gray-300">{relics.length} relics</span>
              </>
            )}
          </div>
          <button
            onClick={() => setSetupCollapsed(false)}
            className="text-xs px-3 py-1 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors shrink-0"
          >
            Edit
          </button>
        </div>
      ) : (
        <>
          {/* ── Controls row ── */}
          <div className="flex flex-wrap gap-4 items-end">
            {/* Character — hidden once a run is synced (floor > 0) */}
            {floor <= 0 && (
              <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase tracking-wide">Character</label>
                <div className="flex gap-1 flex-wrap">
                  {CHARACTERS.map(c => {
                    const isActive = character === c;
                    return (
                      <button
                        key={c}
                        onClick={() => { setCharacter(c); setDeck([]); setScores(null); }}
                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-spire-600 border-spire-500 text-white'
                            : 'bg-gray-900/40 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                        }`}
                      >
                        <span className={isActive ? 'text-white' : charColorClass}>{formatCharacter(c)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Floor */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase tracking-wide">Floor</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={55}
                  value={floor}
                  onChange={e => setFloor(Math.max(1, Math.min(55, Number(e.target.value))))}
                  className="w-16 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-spire-500"
                />
                <span className={`text-sm font-medium px-2 py-1 rounded ${
                  act === 1 ? 'bg-blue-900/40 text-blue-300' :
                  act === 2 ? 'bg-yellow-900/40 text-yellow-300' :
                  'bg-red-900/40 text-red-300'
                }`}>
                  Act {act}
                </span>
              </div>
            </div>

          </div>

          {/* ── Deck builder ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500 uppercase tracking-wide">
                Current Deck <span className="text-gray-600">({deck.length} cards)</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={loadStarterDeck}
                  className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Load Starter Deck
                </button>
                {deck.length > 0 && (
                  <button
                    onClick={() => { setDeck([]); setScores(null); }}
                    className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Deck chips */}
            <div className="min-h-[44px] p-2 bg-gray-900/50 border border-gray-800 rounded-lg">
              {deck.length === 0 ? (
                  <span className="text-xs text-gray-600">Empty — click Sync or load starter deck</span>
              ) : (
                <>
                  {/* Rarity summary line */}
                  {(() => {
                    const counts: Record<string, number> = {};
                    deck.forEach(id => {
                      const rarity = cardMap.get(id)?.rarity ?? 'Unknown';
                      counts[rarity] = (counts[rarity] ?? 0) + 1;
                    });
                    const order = ['Rare', 'Uncommon', 'Common', 'Starter', 'Special', 'Curse'];
                    const parts = order.filter(r => counts[r]).map(r => ({ rarity: r, count: counts[r] }));
                    return (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 text-xs">
                        {parts.map(({ rarity, count }) => (
                          <span key={rarity} className={RARITY_COLOR[rarity] ?? 'text-gray-400'}>
                            {count} {rarity}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-5 gap-x-2 gap-y-0.5">
                  {deck.map((id, i) => {
                    const ct = cardMap.get(id);
                    const colorClass = RARITY_COLOR[ct?.rarity ?? ''] ?? 'text-gray-300';
                    // nth copy of this card in the deck (1-indexed)
                    const deckCopyIndex = deck.slice(0, i + 1).filter(d => d === id).length;
                    // how many copies of this card are upgraded total
                    const totalUpgraded = upgrades.filter(u => u === id).length;
                    const isUpgraded = deckCopyIndex <= totalUpgraded;
                    return (
                      <div key={`${id}-${i}`} className="group flex items-center min-w-0">
                        <CardNameCell
                          id={id}
                          cardTextMap={cardMap}
                          className={`text-sm font-bold truncate ${colorClass}`}
                        />
                        {isUpgraded && <span className="text-xs text-cyan-400 font-bold shrink-0 ml-0.5">+</span>}
                        <button
                          onClick={() => removeFromDeck(i)}
                          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-200 text-xs leading-none shrink-0 transition-opacity"
                        >×</button>
                      </div>
                    );
                  })}
                  </div>
                </>
              )}
            </div>

            {/* Relics (read-only, populated via Sync from Save) */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500 uppercase tracking-wide">Relics {relics.length > 0 && `(${relics.length})`}</label>
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {relics.length === 0 ? (
                  <span className="text-xs text-gray-600 self-center">No relics — use Sync to load</span>
                ) : relics.map(r => (

                  <span key={r} className="px-2 py-0.5 bg-yellow-900/30 border border-yellow-700/40 rounded text-sm text-yellow-300">
                    {formatRelicId(r)}
                  </span>
                ))}
              </div>
            </div>

          </div>
        </>
      )}

      {/* ── Offered cards ── */}
      <div className="space-y-2">
        <label className="text-xs text-gray-500 uppercase tracking-wide">Offered Cards</label>
        <div className="grid grid-cols-3 gap-3">
          {([0, 1, 2] as const).map(slot => (
            <div key={slot} className="space-y-1">
              <div className="text-xs text-gray-600">Card {slot + 1}</div>
              <CardSearch
                cards={allCards}
                character={character}
                placeholder="Search card…"
                value={offered[slot]}
                upgraded={offeredUpgrades[slot]}
                onChange={(id, isUpgraded) => setOfferedCard(slot, id, isUpgraded)}
                onSelected={() => {
                  if (slot < 2) setFocusOfferedSlot(slot + 1);
                }}
                requestFocus={focusOfferedSlot === slot}
                onFocusHandled={() => setFocusOfferedSlot(null)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Score button ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={score}
          disabled={!canScore || scoring}
          className="px-5 py-2.5 bg-spire-600 hover:bg-spire-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {scoring ? 'Scoring…' : 'Get Recommendation'}
        </button>
        {scores && (
          <button
            onClick={() => {
              setOffered(['', '', ''] as [string, string, string]);
              setOfferedUpgrades([false, false, false]);
              setScores(null);
              syncFromSave(true);
            }}
            disabled={syncing}
            className="px-5 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-500 text-sm font-semibold text-gray-200 transition-colors disabled:opacity-50"
          >
            {syncing ? '⟳ Syncing…' : 'Next Floor →'}
          </button>
        )}
        {!canScore && (
          <span className="text-xs text-gray-600">Add at least 1 offered card to score</span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {/* Damage pace — always visible when we have history for this character */}
      {combatPace && combatPace.runs > 0 && (
        <div
          className="rounded-lg bg-gray-900/50 border border-gray-800 px-4 py-2.5 text-xs text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-1"
          title="Average turns to clear fights in your past runs for this character. Lower ≈ stronger damage."
        >
          <span className="text-gray-500 font-medium uppercase tracking-wide">Clear pace</span>
          <span>
            <span className="text-gray-500">Normals</span>{' '}
            <span className="text-gray-200 tabular-nums font-medium">{combatPace.monster.n ? combatPace.monster.avg : '—'}</span>
            {combatPace.monster.n > 0 && <span className="text-gray-600">t</span>}
          </span>
          <span className="text-gray-700">·</span>
          <span>
            <span className="text-gray-500">Elites</span>{' '}
            <span className="text-gray-200 tabular-nums font-medium">{combatPace.elite.n ? combatPace.elite.avg : '—'}</span>
            {combatPace.elite.n > 0 && <span className="text-gray-600">t</span>}
          </span>
          <span className="text-gray-700">·</span>
          <span>
            <span className="text-gray-500">Bosses</span>{' '}
            <span className="text-gray-200 tabular-nums font-medium">{combatPace.boss.n ? combatPace.boss.avg : '—'}</span>
            {combatPace.boss.n > 0 && <span className="text-gray-600">t</span>}
          </span>
          <span className="text-gray-600">({combatPace.runs} runs · lower = better damage)</span>
        </div>
      )}

      {/* ── Results ── */}
      {scores && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Recommendation</h3>
            <span className="text-xs text-gray-600">Floor {floor} · Act {act}{currentBoss ? ` · ${formatEncounterId(currentBoss)}` : ''} · {deck.length} cards in deck</span>
          </div>
          <div className={`grid gap-4 ${scores.length === 1 ? 'grid-cols-1 max-w-xs' : scores.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {scores.map((s, i) => (
              <ScoreCard
                key={s.card_id}
                score={s}
                rank={i + 1}
                upgraded={offeredUpgrades[i] ?? false}
              />
            ))}
          </div>

          {/* Act context tip */}
          <div className="rounded-lg bg-gray-900/50 border border-gray-800 px-4 py-3 text-xs text-gray-500 leading-relaxed">
            <span className="text-gray-400 font-medium">Act {act} principle: </span>
            {act === 1 && 'Increase energy efficiency — every energy spent should do more than 6 damage or 5 Block. Reduce wasted energy.'}
            {act === 2 && 'Identify your win condition. Take key synergy pieces. Avoid random Commons that dilute focus.'}
            {act === 3 && 'Your deck is mostly built. Only add clear upgrades. Rare > Uncommon > skip a Common.'}
          </div>
        </div>
      )}
    </div>
  );
}
