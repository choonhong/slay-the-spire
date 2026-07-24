import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  fetchCardText,
  fetchRecommendations,
  fetchCurrentRun,
  fetchCombatPace,
  fetchRelics,
  type CardText,
  type CardScore,
  type CombatPace,
} from '../api';
import { CardNameCell } from './CardNameCell';
import { formatCharacter, formatRelicId, formatEncounterId } from '../utils';
import PageHeader from './PageHeader';
import SlidingPill from './SlidingPill';

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

const STARTER_DECKS: Record<string, string[]> = {
  'CHARACTER.IRONCLAD':    [...Array(5).fill('CARD.STRIKE_IRONCLAD'), ...Array(4).fill('CARD.DEFEND_IRONCLAD'), 'CARD.BASH'],
  'CHARACTER.SILENT':      [...Array(5).fill('CARD.STRIKE_SILENT'), ...Array(5).fill('CARD.DEFEND_SILENT'), 'CARD.NEUTRALIZE', 'CARD.SURVIVOR'],
  'CHARACTER.DEFECT':      [...Array(4).fill('CARD.STRIKE_DEFECT'), ...Array(4).fill('CARD.DEFEND_DEFECT'), 'CARD.ZAP', 'CARD.DUALCAST'],
  'CHARACTER.NECROBINDER': [...Array(4).fill('CARD.STRIKE_NECROBINDER'), ...Array(4).fill('CARD.DEFEND_NECROBINDER'), 'CARD.UNLEASH', 'CARD.POKE'],
  'CHARACTER.REGENT':      [...Array(4).fill('CARD.STRIKE_REGENT'), ...Array(4).fill('CARD.DEFEND_REGENT'), 'CARD.FALLING_STAR', 'CARD.VENERATE'],
  'CHARACTER.WATCHER':     [...Array(4).fill('CARD.STRIKE_WATCHER'), ...Array(4).fill('CARD.DEFEND_WATCHER'), 'CARD.ERUPTION', 'CARD.VIGILANCE'],
};

const CHARACTER_COLOR: Record<string, string> = {
  IRONCLAD:    'text-gray-200',
  SILENT:      'text-gray-200',
  DEFECT:      'text-gray-200',
  WATCHER:     'text-gray-200',
  NECROBINDER: 'text-gray-200',
  REGENT:      'text-gray-200',
};

const SCORE_COLORS: Record<CardScore['recommendation'], { glassClass: string; badge: string; label: string; scoreColor: string }> = {
  strong:   { glassClass: 'glass-card-strong',   badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30',  label: '✦ Strong Pick', scoreColor: 'text-emerald-300' },
  consider: { glassClass: 'glass-card-consider', badge: 'bg-amber-500/20 text-amber-300 border border-amber-400/30',       label: '◈ Consider',    scoreColor: 'text-amber-300' },
  skip:     { glassClass: 'glass-card-skip',     badge: 'bg-white/5 text-gray-400 border border-white/10',                label: '✕ Skip',        scoreColor: 'text-gray-400' },
};

const FACTOR_LABELS: Record<string, { label: string; max: number; color: string }> = {
  strength:    { label: 'Strength',   max: 30, color: 'bg-blue-500' },
  synergy:     { label: 'Synergy',    max: 25, color: 'bg-purple-500' },
  deck_needs:  { label: 'Deck Fit',   max: 40, color: 'bg-teal-500' },
  win_con:     { label: 'Win Con',    max: 20, color: 'bg-amber-500' },
};

const COST_COLORS: Record<string, string> = {
  '0': 'bg-green-700', '1': 'bg-blue-700', '2': 'bg-yellow-700',
  '3': 'bg-red-800',   'X': 'bg-purple-700', 'N/A': 'bg-gray-700',
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
  onCancel,
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
  onCancel?: () => void;
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
  const onFocusHandledRef = useRef(onFocusHandled);
  useEffect(() => { onFocusHandledRef.current = onFocusHandled; });

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

  // Parent asked us to start typing (after previous slot was confirmed).
  // We intentionally exclude onFocusHandled from deps — it's captured via ref
  // so a new inline function on every parent re-render doesn't retrigger this effect.
  useEffect(() => {
    if (!requestFocus) return;
    setQuery('');
    setEditing(true);
    setOpen(false);
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      onFocusHandledRef.current?.();
    }, 0);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestFocus]);

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

  // Dropdown only closes via X button, Escape key, or selecting a card — no outside-click dismissal.

  // Focus input when entering edit mode
  useEffect(() => {
    if (!editing) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [editing]);

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
            className="w-full px-4 py-2 pr-8 rounded-full text-sm text-gray-100 placeholder-gray-500"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}
          />
          {query && (
            <button
              onMouseDown={e => {
                e.preventDefault();
                setQuery('');
                setEditing(false);
                setOpen(false);
                onCancel?.();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200 text-lg leading-none"
            >×</button>
          )}
        </div>
      )}

      {open && filtered.length > 0 && (
        <div ref={listRef} className="absolute z-50 top-full mt-1 w-full rounded-xl shadow-2xl max-h-56 overflow-y-auto"
          style={{ background: 'rgba(10, 12, 22, 0.98)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          {filtered.map((entry, i) => (
            <button
              key={`${entry.card.id}-${entry.upgraded}`}
              onMouseDown={() => selectItem(entry)}
              onMouseEnter={() => setHighlightedIdx(i)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${i === highlightedIdx ? 'bg-white/10' : 'hover:bg-white/5'}`}
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

function RelicSearch({
  relics,
  exclude,
  onPick,
  requestFocus,
}: {
  relics: string[];
  exclude: string[];
  onPick: (id: string) => void;
  requestFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const excludeSet = useMemo(() => new Set(exclude), [exclude]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = relics.filter(id => !excludeSet.has(id));
    if (!q) return available.slice(0, 12);
    return sortByQuery(
      available.map(id => ({ id, name: formatRelicId(id) })),
      q,
    ).slice(0, 12).map(r => r.id);
  }, [query, relics, excludeSet]);

  useEffect(() => { setHighlightedIdx(0); }, [filtered]);
  useEffect(() => {
    if (requestFocus) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [requestFocus]);

  return (
    <div className="rounded-xl shadow-2xl overflow-hidden" style={{ background: 'rgba(10, 12, 22, 0.98)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search relic…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIdx(i => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIdx(i => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const id = filtered[highlightedIdx] ?? filtered[0];
            if (id) onPick(id);
          } else if (e.key === 'Escape') {
            setQuery('');
          }
        }}
        className="w-full px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      />
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-500">No relics found</div>
        ) : filtered.map((id, i) => (
          <button
            key={id}
            type="button"
            onMouseDown={() => onPick(id)}
            onMouseEnter={() => setHighlightedIdx(i)}
            className={`w-full px-3 py-2 text-left text-sm transition-colors ${
              i === highlightedIdx ? 'bg-white/10 text-yellow-200' : 'text-yellow-300/90 hover:bg-white/5'
            }`}
          >
            {formatRelicId(id)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreCard({ score, rank, upgraded, onPick }: { score: CardScore; rank: number; upgraded: boolean; onPick?: () => void }) {
  const style = SCORE_COLORS[score.recommendation];

  return (
    <div className={`relative flex flex-col rounded-2xl p-4 transition-all ${style.glassClass}`}>
      {/* Rank badge */}
      <div className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-gray-300"
        style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}>
        {rank}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-2 pt-1 mb-3">
        <div>
          <div className="font-bold text-gray-100">
            {score.name}{upgraded && <span className="text-cyan-400 font-bold ml-0.5">+</span>}
          </div>
          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
            {style.label}
          </span>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-3xl font-bold leading-none ${style.scoreColor}`} style={{ textShadow: '0 0 16px currentColor' }}>{score.score}</div>
          <div className="text-xs text-gray-600 mt-0.5">/ 100</div>
        </div>
      </div>

      {/* Score breakdown bars */}
      <div className="space-y-1.5 mb-3">
        {(Object.entries(score.factors) as [string, number][]).map(([key, val]) => {
          const meta = FACTOR_LABELS[key];
          if (!meta) return null;
          const isNegative = val < 0;
          const pct = Math.min((Math.abs(val) / meta.max) * 100, 100);
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-16 shrink-0">{meta.label}</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className={`h-full ${isNegative ? 'bg-red-500' : meta.color} rounded-full transition-all`} style={{ width: `${pct}%`, opacity: 0.85 }} />
              </div>
              <span className={`text-xs w-6 text-right tabular-nums ${isNegative ? 'text-red-400' : 'text-gray-400'}`}>{val}</span>
            </div>
          );
        })}
      </div>

      {/* Reasons — grows to fill space so button stays at bottom */}
      <div className="flex-1">
        {score.reasons.length > 0 && (
          <ul className="space-y-1 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            {score.reasons.map((r, i) => (
              <li key={i} className="text-xs text-gray-400 flex gap-1.5">
                <span className="text-gray-600 shrink-0">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pick button — pinned to bottom */}
      {onPick && (
        <button
          onClick={onPick}
          className="w-full mt-3 py-1.5 rounded-xl text-xs text-gray-400 hover:text-white transition-all glass-button"
        >
          + Add to deck
        </button>
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
  const [allRelics, setAllRelics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const DEFAULT_CHAR = 'CHARACTER.IRONCLAD';
  const [character, setCharacter] = useState(DEFAULT_CHAR);
  const [floor, setFloor] = useState(1);
  const [addingToDeck, setAddingToDeck] = useState(false);
  const [deck, setDeck] = useState<string[]>(STARTER_DECKS['CHARACTER.IRONCLAD']);
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
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [combatPace, setCombatPace] = useState<CombatPace | null>(null);
  const [addingRelic, setAddingRelic] = useState(false);

  // Load card text + relic list once, then immediately sync
  useEffect(() => {
    Promise.all([fetchCardText(), fetchRelics()])
      .then(([cards, relicIds]) => {
        setAllCards(cards);
        setCardMap(new Map(cards.map(c => [c.id, c])));
        setAllRelics(relicIds);
        setLoading(false);
        syncFromSave(true);
      })
      .catch(() => setLoading(false));
  }, []);

  // Historical clear speed for this character — damage-quality proxy
  useEffect(() => {
    if (!character) { setCombatPace(null); return; }
    let cancelled = false;
    fetchCombatPace(character)
      .then(pace => { if (!cancelled) setCombatPace(pace); })
      .catch(() => { if (!cancelled) setCombatPace(null); });
    return () => { cancelled = true; };
  }, [character]);

  // Keep a stable ref to syncFromSave to avoid stale closures in the interval
  const syncRef = useRef(syncFromSave);
  useEffect(() => { syncRef.current = syncFromSave; });

  // Auto-sync deck/relics every 10s while sync is enabled
  useEffect(() => {
    if (!syncEnabled) return;
    const interval = setInterval(() => syncRef.current(true), 10000);
    return () => clearInterval(interval);
  }, [syncEnabled]);

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
        if (newRelics.length > 0) {
          setAllRelics(prev => [...new Set([...prev, ...newRelics])]);
        }
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
    const removed = deck[idx];
    setDeck(d => d.filter((_, i) => i !== idx));
    // Drop one matching upgrade entry if this copy was upgraded
    if (removed) {
      const copyIndex = deck.slice(0, idx + 1).filter(id => id === removed).length;
      const upgCount = upgrades.filter(u => u === removed).length;
      if (copyIndex <= upgCount) {
        setUpgrades(u => {
          const i = u.indexOf(removed);
          if (i < 0) return u;
          return [...u.slice(0, i), ...u.slice(i + 1)];
        });
      }
    }
    setScores(null);
  }

  function addToDeck(id: string, isUpgraded = false) {
    if (!id) return;
    setDeck(d => [...d, id]);
    if (isUpgraded) setUpgrades(u => [...u, id]);
    setScores(null);
  }

  function addRelic(id: string) {
    if (!id || relics.includes(id)) return;
    setRelics(r => [...r, id]);
    setScores(null);
  }

  function removeRelic(idx: number) {
    setRelics(r => r.filter((_, i) => i !== idx));
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

  function starterDeckFor(char: string): string[] {
    return STARTER_DECKS[char] ?? [];
  }

  function loadStarterDeck() {
    setDeck(starterDeckFor(character));
    setUpgrades([]);
    setScores(null);
  }

  function pickCharacter(c: string) {
    setCharacter(c);
    setDeck(starterDeckFor(c));
    setUpgrades([]);
    setRelics([]);
    setScores(null);
  }

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading card data…</div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Advisor"
        right={
          <button
            onClick={() => {
              const next = !syncEnabled;
              setSyncEnabled(next);
              if (next) syncFromSave(true); // immediate sync when re-enabling
            }}
            className={`px-4 py-1.5 rounded-full text-sm transition-all glass-button ${
              syncEnabled
                ? 'text-red-400 hover:text-red-300'
                : 'text-green-400 hover:text-green-300'
            }`}
          >
            {syncing ? '⟳ Syncing…' : syncEnabled ? 'Disable Sync' : 'Enable Sync'}
          </button>
        }
      />

      {/* ── Setup section (collapsible) ── */}
      {setupCollapsed ? (
        /* Collapsed summary bar */
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl glass-sm">
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
            className="text-xs px-3 py-1 rounded-lg text-gray-400 hover:text-gray-200 transition-all glass-button shrink-0"
          >
            Edit
          </button>
        </div>
      ) : (
        <>
          {/* ── Controls row: character + floor + deck actions ── */}
          <div className="flex flex-wrap gap-3 items-center">
            <div>
              <SlidingPill
                options={CHARACTERS.map(c => ({ id: c, label: formatCharacter(c) }))}
                value={character}
                onChange={c => {
                  if (c !== character) pickCharacter(c);
                }}
              />
            </div>

            {/* Floor — read-only, auto-synced */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Floor</span>
              <span className="text-sm font-semibold text-gray-200">{floor}</span>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                act === 1 ? 'bg-blue-900/40 text-blue-300' :
                act === 2 ? 'bg-yellow-900/40 text-yellow-300' :
                'bg-red-900/40 text-red-300'
              }`}>
                Act {act}
              </span>
            </div>

            {/* Deck action buttons — same row as character + floor */}
            <div className="flex gap-2">
              {deck.length === 0 && (
                <button
                  onClick={loadStarterDeck}
                  className="text-xs px-3 py-1.5 rounded-full text-gray-400 hover:text-gray-200 transition-all glass-button"
                >
                  Load Starter Deck
                </button>
              )}
              {deck.length > 0 && (
                <button
                  onClick={() => { setDeck([]); setUpgrades([]); setScores(null); }}
                  className="text-xs px-3 py-1.5 rounded-full text-gray-400 hover:text-red-400 transition-all glass-button"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* ── Deck builder ── */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500 uppercase tracking-wide">
              Current Deck <span className="text-gray-600">({deck.length} cards)</span>
            </label>

            {/* Deck chips */}
            <div className="relative"> {/* outer wrapper — no stacking context, so popup can paint above relic section */}
            <div className="flex gap-1.5 min-h-[44px] p-2 rounded-xl glass-sm">
              <div className="flex-1 min-w-0">
                {deck.length === 0 ? (
                  <span className="text-xs text-gray-600">Empty — pick a character, load a starter deck, or Sync from a live run</span>
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
                        const deckCopyIndex = deck.slice(0, i + 1).filter(d => d === id).length;
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

              {/* + button on the right, same pattern as Relics */}
              <div className="shrink-0 flex items-end">
                <button
                  type="button"
                  title={character ? 'Add card' : 'Pick a character first'}
                  disabled={!character}
                  onClick={() => setAddingToDeck(v => !v)}
                  className="w-7 h-7 rounded-lg text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-lg leading-none flex items-center justify-center transition-all glass-button"
                >
                  +
                </button>
              </div>
            </div> {/* end glass-sm */}

            {/* Popup lives OUTSIDE glass-sm so backdrop-filter doesn't trap its z-index */}
            {addingToDeck && character && (
              <div className="absolute bottom-full right-0 mb-1.5 z-[200] w-72">
                <CardSearch
                  cards={allCards}
                  character={character}
                  placeholder="Search card…"
                  value=""
                  upgraded={false}
                  onChange={(id, isUpgraded) => {
                    addToDeck(id, isUpgraded);
                    setAddingToDeck(false);
                  }}
                  onCancel={() => setAddingToDeck(false)}
                  requestFocus
                  onFocusHandled={() => {}}
                />
              </div>
            )}
            </div> {/* end outer wrapper */}

            {/* Relics */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500 uppercase tracking-wide">Relics {relics.length > 0 && `(${relics.length})`}</label>
              <div className="relative flex gap-1.5 min-h-[36px] p-2 rounded-xl glass-sm">
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                  {relics.length === 0 ? (
                    <span className="text-xs text-gray-600 self-center">Empty — tap + to add, or Sync from a live run</span>
                  ) : relics.map((r, i) => (
                    <span
                      key={`${r}-${i}`}
                      className="group inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-sm text-yellow-300"
                      style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)' }}
                    >
                      {formatRelicId(r)}
                      <button
                        type="button"
                        onClick={() => removeRelic(i)}
                        className="opacity-0 group-hover:opacity-100 text-yellow-600 hover:text-yellow-200 text-xs leading-none transition-opacity"
                      >×</button>
                    </span>
                  ))}
                </div>

                <div className="relative shrink-0 flex items-end">
                  <button
                    type="button"
                    title="Add relic"
                    onClick={() => setAddingRelic(v => !v)}
                    className="w-7 h-7 rounded-lg text-gray-300 hover:text-white text-lg leading-none flex items-center justify-center transition-all glass-button"
                  >
                    +
                  </button>

                  {addingRelic && (
                    <div className="absolute bottom-full right-0 mb-1.5 z-50 w-72">
                      <RelicSearch
                        relics={allRelics}
                        exclude={relics}
                        requestFocus
                        onPick={id => {
                          addRelic(id);
                          setAddingRelic(false);
                        }}
                      />
                    </div>
                  )}
                </div>
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
          className="px-5 py-2.5 bg-spire-600 hover:bg-spire-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-full transition-all shadow-lg"
          style={{ boxShadow: '0 4px 20px rgba(232,136,42,0.3), 0 0 0 1px rgba(255,180,84,0.15)' }}
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
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-gray-200 transition-all disabled:opacity-50 glass-button"
          >
            {syncing ? '⟳ Syncing…' : 'Next Floor →'}
          </button>
        )}
        {!canScore && (
          <span className="text-xs text-gray-600">Add at least 1 offered card to score</span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {/* ── Results ── */}
      {scores && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Recommendation</h3>
            <span className="text-xs text-gray-600">Floor {floor} · Act {act}{currentBoss ? ` · ${formatEncounterId(currentBoss)}` : ''} · {deck.length} cards in deck</span>
          </div>
          <div className={`grid gap-4 items-stretch ${scores.length === 1 ? 'grid-cols-1 max-w-xs' : scores.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {scores.map((s, i) => (
              <ScoreCard
                key={s.card_id}
                score={s}
                rank={i + 1}
                upgraded={offeredUpgrades[i] ?? false}
                onPick={() => {
                  addToDeck(s.card_id, offeredUpgrades[i] ?? false);
                  setOffered(['', '', ''] as [string, string, string]);
                  setOfferedUpgrades([false, false, false]);
                  setScores(null);
                }}
              />
            ))}
          </div>

          {/* Act context tip — hidden for Act 1 */}
          {act > 1 && (
            <div className="rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed glass-sm">
              <span className="text-gray-400 font-medium">Act {act} principle: </span>
              {act === 2 && 'Identify your win condition. Take key synergy pieces. Avoid random Commons that dilute focus.'}
              {act === 3 && 'Your deck is mostly built. Only add clear upgrades. Rare > Uncommon > skip a Common.'}
            </div>
          )}

          {/* Damage pace */}
          {combatPace && combatPace.runs > 0 && (
            <div
              className="rounded-xl px-4 py-2.5 text-xs text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-1 glass-sm"
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
        </div>
      )}
    </div>
  );
}
