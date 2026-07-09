import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fetchCardText, fetchRecommendations, fetchCurrentRun, type CardText, type CardScore } from '../api';
import { formatCharacter } from '../utils';

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
  IRONCLAD:    'text-red-400',
  SILENT:      'text-green-400',
  DEFECT:      'text-blue-400',
  WATCHER:     'text-purple-400',
  NECROBINDER: 'text-pink-400',
  REGENT:      'text-yellow-400',
};

const SCORE_COLORS: Record<CardScore['recommendation'], { ring: string; badge: string; label: string }> = {
  strong:   { ring: 'ring-2 ring-green-500',  badge: 'bg-green-600 text-white',  label: '✦ Strong Pick' },
  consider: { ring: 'ring-2 ring-yellow-500', badge: 'bg-yellow-600 text-white', label: '◈ Consider' },
  skip:     { ring: 'ring-2 ring-gray-600',   badge: 'bg-gray-700 text-gray-300', label: '✕ Skip' },
};

const FACTOR_LABELS: Record<string, { label: string; max: number; color: string }> = {
  strength:    { label: 'Strength',   max: 30, color: 'bg-blue-500' },
  synergy:     { label: 'Synergy',    max: 25, color: 'bg-purple-500' },
  deck_needs:  { label: 'Deck Fit',   max: 20, color: 'bg-teal-500' },
  act_context: { label: 'Act Bonus',  max: 15, color: 'bg-orange-500' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function CardSearch({
  cards,
  character,
  placeholder,
  value,
  onChange,
}: {
  cards: CardText[];
  character: string;
  placeholder: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const charColor = character.replace('CHARACTER.', '').toLowerCase();
  const filtered = useMemo(() => {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    const matches = cards.filter(c =>
      (c.color === charColor || c.color === 'colorless' || c.color === 'event') &&
      (c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    );
    return sortByQuery(matches, q).slice(0, 12);
  }, [query, cards, charColor]);

  const selected = cards.find(c => c.id === value);

  // Reset highlight when results change
  useEffect(() => { setHighlightedIdx(-1); }, [filtered]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx]);

  const selectItem = useCallback((c: CardText) => {
    onChange(c.id);
    setQuery('');
    setOpen(false);
    setHighlightedIdx(-1);
  }, [onChange]);

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
      if (target) selectItem(target);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [open, filtered, highlightedIdx, selectItem]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const COST_COLORS: Record<string, string> = {
    '0': 'bg-green-700', '1': 'bg-blue-700', '2': 'bg-yellow-700',
    '3': 'bg-red-800', 'X': 'bg-purple-700', 'N/A': 'bg-gray-700',
  };

  return (
    <div ref={ref} className="relative">
      {selected ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg">
          <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded ${COST_COLORS[selected.cost] ?? 'bg-gray-700'} text-white shrink-0`}>
            {selected.cost}
          </span>
          <span className="text-gray-100 text-sm font-medium flex-1">{selected.name}</span>
          <span className="text-xs text-gray-500">{selected.rarity}</span>
          <button
            onClick={() => { onChange(''); setQuery(''); }}
            className="text-gray-500 hover:text-gray-200 ml-1 text-lg leading-none"
          >×</button>
        </div>
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-spire-500"
        />
      )}

      {open && filtered.length > 0 && (
        <div ref={listRef} className="absolute z-50 top-full mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onMouseDown={() => selectItem(c)}
              onMouseEnter={() => setHighlightedIdx(i)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${i === highlightedIdx ? 'bg-gray-700' : 'hover:bg-gray-800'}`}
            >
              <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded ${COST_COLORS[c.cost] ?? 'bg-gray-700'} text-white shrink-0`}>
                {c.cost}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-100 truncate">{c.name}</div>
                <div className="text-xs text-gray-500 truncate">{c.description?.slice(0, 55)}{c.description?.length > 55 ? '…' : ''}</div>
              </div>
              <span className="text-xs text-gray-600 shrink-0">{c.rarity[0]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreCard({ score, rank, onPick }: { score: CardScore; rank: number; onPick: () => void }) {
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
          <div className="font-semibold text-gray-100">{score.name}</div>
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
          const pct = (val / meta.max) * 100;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-16 shrink-0">{meta.label}</span>
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${meta.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-gray-400 w-6 text-right tabular-nums">{val}</span>
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

      {/* Pick button */}
      <button
        onClick={onPick}
        className="mt-auto w-full py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-xs font-semibold text-gray-300 hover:text-white transition-colors"
      >
        + Add to Deck
      </button>
    </div>
  );
}

function DeckChip({ cardId, name, onRemove }: { cardId: string; name: string; onRemove: () => void }) {
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300">
      <span className="truncate max-w-[100px]">{name}</span>
      <button onClick={onRemove} className="text-gray-600 hover:text-gray-200 ml-0.5 leading-none">×</button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Advisor() {
  const [allCards, setAllCards] = useState<CardText[]>([]);
  const [cardMap, setCardMap] = useState<Map<string, CardText>>(new Map());
  const [loading, setLoading] = useState(true);

  const [character, setCharacter] = useState('CHARACTER.REGENT');
  const [floor, setFloor] = useState(1);
  const [deck, setDeck] = useState<string[]>([]);
  const [offered, setOffered] = useState<[string, string, string]>(['', '', '']);

  const [scores, setScores] = useState<CardScore[] | null>(null);
  const [scoring, setScoring] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupCollapsed, setSetupCollapsed] = useState(false);

  const [deckSearch, setDeckSearch] = useState('');
  const [deckDropdown, setDeckDropdown] = useState(false);
  const [deckHighlightIdx, setDeckHighlightIdx] = useState(-1);
  const deckRef = useRef<HTMLDivElement>(null);
  const deckListRef = useRef<HTMLDivElement>(null);

  // Load card text once
  useEffect(() => {
    fetchCardText().then(cards => {
      setAllCards(cards);
      setCardMap(new Map(cards.map(c => [c.id, c])));
      setLoading(false);
    });
  }, []);

  // Close deck dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (deckRef.current && !deckRef.current.contains(e.target as Node)) setDeckDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const act = floor <= 0 ? 1 : floor <= 17 ? 1 : floor <= 34 ? 2 : 3;
  const charKey = character.replace('CHARACTER.', '');
  const charColorClass = CHARACTER_COLOR[charKey] ?? 'text-gray-300';

  const filledOffered = offered.filter(Boolean);
  const canScore = filledOffered.length >= 1;

  async function syncFromSave(silent = false) {
    setSyncing(true);
    try {
      const run = await fetchCurrentRun();
      if (run.floor > 0) setFloor(run.floor);
      if (run.character) {
        setCharacter(run.character);
        setDeck(run.deck.filter(id => id.startsWith('CARD.')));
        setScores(null);
      }
      if (!silent) setSetupCollapsed(false);
    } catch {
      if (!silent) setError('No active run found — start a run in-game first.');
    } finally {
      setSyncing(false);
    }
  }

  async function score() {
    if (!canScore) return;
    setScoring(true);
    setError(null);
    try {
      // Auto-sync floor from save before scoring
      try {
        const run = await fetchCurrentRun();
        if (run.floor > 0) setFloor(run.floor);
      } catch { /* ignore if no active run */ }

      const result = await fetchRecommendations({
        deck,
        offered: filledOffered,
        character,
        floor,
      });
      setScores(result);
      setSetupCollapsed(true);
    } catch (e) {
      setError('Failed to get recommendations. Is the backend running?');
    } finally {
      setScoring(false);
    }
  }

  // Deck card search filtered results
  const deckCharColor = character.replace('CHARACTER.', '').toLowerCase();
  const filteredDeckCards = useMemo(() => {
    if (!deckSearch) return [];
    const q = deckSearch.toLowerCase();
    const matches = allCards.filter(c =>
      (c.color === deckCharColor || c.color === 'colorless' || c.color === 'event') &&
      (c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    );
    return sortByQuery(matches, q).slice(0, 10);
  }, [deckSearch, allCards, deckCharColor]);

  // Reset deck highlight when results change
  useEffect(() => { setDeckHighlightIdx(-1); }, [filteredDeckCards]);

  // Scroll highlighted deck item into view
  useEffect(() => {
    if (deckHighlightIdx < 0 || !deckListRef.current) return;
    const item = deckListRef.current.children[deckHighlightIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [deckHighlightIdx]);

  function handleDeckKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!deckDropdown || filteredDeckCards.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDeckHighlightIdx(i => Math.min(i + 1, filteredDeckCards.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDeckHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredDeckCards[deckHighlightIdx] ?? filteredDeckCards[0];
      if (target) addToDeck(target.id);
    } else if (e.key === 'Escape') {
      setDeckDropdown(false);
    }
  }

  function addToDeck(cardId: string) {
    setDeck(d => [...d, cardId]);
    setDeckSearch('');
    setDeckDropdown(false);
    setScores(null);
  }

  function removeFromDeck(idx: number) {
    setDeck(d => d.filter((_, i) => i !== idx));
    setScores(null);
  }

  function setOfferedCard(slot: number, id: string) {
    setOffered(prev => {
      const next = [...prev] as [string, string, string];
      next[slot] = id;
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
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-100">Card Advisor</h2>
        <p className="text-sm text-gray-500 mt-1">
          Set your character, current floor, deck, and the 3 cards being offered — get a scored recommendation.
        </p>
      </div>

      {/* ── Setup section (collapsible) ── */}
      {setupCollapsed ? (
        /* Collapsed summary bar */
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900/60 border border-gray-800 rounded-lg">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className={`font-semibold ${charColorClass}`}>{formatCharacter(character)}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-200">Floor {floor} · Act {act}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-300">{deck.length} cards</span>
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
            {/* Character */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase tracking-wide">Character</label>
              <div className="flex gap-1 flex-wrap">
                {CHARACTERS.map(c => {
                  const key = c.replace('CHARACTER.', '');
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

            {/* Sync from save */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase tracking-wide opacity-0 select-none">Sync</label>
              <button
                onClick={() => syncFromSave(false)}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 transition-colors"
              >
                <span>{syncing ? '⟳' : '⇣'}</span>
                {syncing ? 'Syncing…' : 'Sync from Save'}
              </button>
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
            <div className="min-h-[44px] p-2 bg-gray-900/50 border border-gray-800 rounded-lg flex flex-wrap gap-1.5">
              {deck.length === 0 && (
                <span className="text-xs text-gray-600 self-center pl-1">Empty — sync from save, load starter deck, or add cards below</span>
              )}
              {deck.map((id, i) => (
                <DeckChip
                  key={`${id}-${i}`}
                  cardId={id}
                  name={cardMap.get(id)?.name ?? id.replace('CARD.', '').replace(/_/g, ' ')}
                  onRemove={() => removeFromDeck(i)}
                />
              ))}
            </div>

            {/* Add card to deck */}
            <div ref={deckRef} className="relative">
              <input
                type="text"
                placeholder="Add card to deck…"
                value={deckSearch}
                onChange={e => { setDeckSearch(e.target.value); setDeckDropdown(true); }}
                onFocus={() => setDeckDropdown(true)}
                onKeyDown={handleDeckKeyDown}
                className="w-full max-w-xs px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-spire-500"
              />
              {deckDropdown && filteredDeckCards.length > 0 && (
                <div ref={deckListRef} className="absolute z-50 top-full mt-1 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {filteredDeckCards.map((c, i) => (
                    <button
                      key={c.id}
                      onMouseDown={() => addToDeck(c.id)}
                      onMouseEnter={() => setDeckHighlightIdx(i)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${i === deckHighlightIdx ? 'bg-gray-700' : 'hover:bg-gray-800'}`}
                    >
                      <span className="text-xs text-gray-400 w-4 shrink-0">{c.cost}</span>
                      <span className="text-sm text-gray-100 flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-gray-600">{c.rarity[0]}</span>
                    </button>
                  ))}
                </div>
              )}
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
                placeholder={`Search card…`}
                value={offered[slot]}
                onChange={id => setOfferedCard(slot, id)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Score button ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={score}
          disabled={!canScore || scoring}
          className="px-5 py-2.5 bg-spire-600 hover:bg-spire-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {scoring ? 'Scoring…' : '⚔ Get Recommendation'}
        </button>
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
            <span className="text-xs text-gray-600">Floor {floor} · Act {act} · {deck.length} cards in deck</span>
          </div>
          <div className={`grid gap-4 ${scores.length === 1 ? 'grid-cols-1 max-w-xs' : scores.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {scores.map((s, i) => (
              <ScoreCard
                key={s.card_id}
                score={s}
                rank={i + 1}
                onPick={() => {
                  addToDeck(s.card_id);
                  setOffered((['', '', ''] as [string, string, string]));
                  setScores(null);
                  setSetupCollapsed(false);
                }}
              />
            ))}
          </div>

          {/* Act context tip */}
          <div className="rounded-lg bg-gray-900/50 border border-gray-800 px-4 py-3 text-xs text-gray-500 leading-relaxed">
            <span className="text-gray-400 font-medium">Act {act} principle: </span>
            {act === 1 && 'Build consistency. Prefer 1-cost cards. A 3-cost card is risky without energy scaling.'}
            {act === 2 && 'Identify your win condition. Take key synergy pieces. Avoid random Commons that dilute focus.'}
            {act === 3 && 'Your deck is mostly built. Only add clear upgrades. Rare > Uncommon > skip a Common.'}
          </div>
        </div>
      )}
    </div>
  );
}
