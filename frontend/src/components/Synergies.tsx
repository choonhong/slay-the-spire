import { useEffect, useState, useMemo, useRef } from 'react';
import { fetchSynergies, fetchCharacters, fetchBuilds, fetchCardText, type SynergyPair, type CardText } from '../api';
import { formatCharacter } from '../utils';
import { sortCharacters } from '../constants/characters';
import { CardNameCell } from './CardNameCell';
import ClearableInput from './ClearableInput';
import PageHeader from './PageHeader';
import SlidingPill from './SlidingPill';

function LiftBadge({ value }: { value: number }) {
  if (value >= 15) return <span className="text-green-400 font-semibold">+{value}%</span>;
  if (value >= 5)  return <span className="text-yellow-400 font-semibold">+{value}%</span>;
  if (value > 0)   return <span className="text-gray-400">+{value}%</span>;
  return <span className="text-red-400">{value}%</span>;
}

function WinBar({ value }: { value: number }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-sm text-gray-200 tabular-nums">{value.toFixed(1)}%</span>
    </div>
  );
}

export default function Synergies({ active = true }: { active?: boolean }) {
  const [pairs, setPairs] = useState<SynergyPair[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [builds, setBuilds] = useState<string[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChar, setSelectedChar] = useState('');
  const [selectedBuild, setSelectedBuild] = useState('');
  const [minRuns, setMinRuns] = useState(3);
  const [scope, setScope] = useState<'global' | 'mine'>('mine');
  const [sortBy, setSortBy] = useState<'win_rate' | 'lift' | 'runs'>('lift');
  const [cardSearch, setCardSearch] = useState('');
  const [cardTexts, setCardTexts] = useState<CardText[]>([]);
  const cardTextMap = useMemo(() => new Map(cardTexts.map(c => [c.id, c])), [cardTexts]);
  const hasLoadedOnce = useRef(false);

  useEffect(() => { fetchCardText().then(setCardTexts).catch(() => {}); }, []);

  const load = async () => {
    if (!hasLoadedOnce.current) setInitialLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [data, chars, buildList] = await Promise.all([
        fetchSynergies({
          character: selectedChar || undefined,
          buildId: selectedBuild || undefined,
          minRuns,
          scope,
        }),
        fetchCharacters(),
        fetchBuilds(),
      ]);
      setPairs(data);
      setCharacters(chars);
      setBuilds(buildList);
      hasLoadedOnce.current = true;
    } catch {
      setError('Could not reach the backend.');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  };

  // Refetch when filters change, and whenever the tab becomes visible again
  // (keeps search state, but picks up newly synced runs)
  useEffect(() => {
    if (active) load();
  }, [active, selectedChar, selectedBuild, minRuns, scope]);

  const cardName = (id: string) =>
    (cardTextMap.get(id)?.name ?? id.replace(/^CARD\./, '').replace(/_/g, ' ')).toLowerCase();

  const sorted = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    const filtered = q
      ? pairs.filter(p => cardName(p.card_a).includes(q) || cardName(p.card_b).includes(q))
      : pairs;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'lift') return b.synergy_lift - a.synergy_lift;
      if (sortBy === 'win_rate') return b.win_rate_together - a.win_rate_together;
      return b.runs_together - a.runs_together;
    });
  }, [pairs, sortBy, cardSearch, cardTextMap]);

  const searchQuery = cardSearch.trim().toLowerCase();
  const matchesSearch = (id: string): boolean => !!searchQuery && cardName(id).includes(searchQuery);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Synergies"
        countLabel={!initialLoading ? `${sorted.length} pairs` : undefined}
        onRefresh={load}
      />

      {/* Character filter + scope toggle */}
      <div className="flex flex-wrap gap-2 items-center">
        <SlidingPill
          options={[
            { id: '__all__', label: 'All' },
            ...sortCharacters(characters).map(c => ({ id: c, label: formatCharacter(c) })),
          ]}
          value={selectedChar || '__all__'}
          onChange={id => setSelectedChar(id === '__all__' ? '' : (selectedChar === id ? '' : id))}
        />

        <SlidingPill
          className="ml-auto"
          options={[
            { id: 'global', label: 'Global Stats' },
            { id: 'mine',   label: 'My Stats' },
          ]}
          value={scope}
          onChange={id => setScope(id as 'global' | 'mine')}
        />
      </div>

      {/* Secondary filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <ClearableInput
          placeholder="Search card…"
          value={cardSearch}
          onChange={setCardSearch}
          className="px-4 py-1.5 rounded-full text-sm text-gray-100 placeholder-gray-500 glass-input w-44"
        />
        <select
          value={selectedBuild}
          onChange={e => setSelectedBuild(e.target.value)}
          className="px-4 py-1.5 rounded-full text-sm text-gray-100 glass-input"
        >
          <option value="">All Versions</option>
          {builds.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Min. runs together:</span>
          <input
            type="number"
            min={2}
            value={minRuns}
            onChange={e => setMinRuns(Math.max(2, Number(e.target.value)))}
            className="w-16 px-3 py-1.5 rounded-full text-gray-100 glass-input text-center"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Sort by:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="px-4 py-1.5 rounded-full text-sm text-gray-100 glass-input"
          >
            <option value="lift">Synergy Lift</option>
            <option value="win_rate">Win Rate Together</option>
            <option value="runs">Most Runs Together</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Table — keep previous rows while refetching; only blank on first load */}
      <div
        className={`rounded-xl overflow-hidden transition-opacity duration-200 glass-sm ${
          refreshing ? 'opacity-55' : 'opacity-100'
        }`}
      >
        <table className="w-full text-sm">
          <thead style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Card A</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Card B</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Runs</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Win Rate Together</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Solo A / B</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Synergy Lift</th>
            </tr>
          </thead>
          <tbody>
            {initialLoading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">Loading...</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No pairs found — try lowering Min. runs together</td></tr>
            ) : (
              sorted.map((p, i) => (
                <tr
                  key={`${p.card_a}-${p.card_b}`}
                  className={`border-t border-gray-800/50 hover:bg-gray-800/40 transition-colors ${i % 2 === 0 ? 'bg-gray-900/20' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <CardNameCell id={p.card_a} cardTextMap={cardTextMap}
                      colorByRarity={!matchesSearch(p.card_a)}
                      className={matchesSearch(p.card_a) ? 'font-bold text-spire-400' : 'font-bold'}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <CardNameCell id={p.card_b} cardTextMap={cardTextMap}
                      colorByRarity={!matchesSearch(p.card_b)}
                      className={matchesSearch(p.card_b) ? 'font-bold text-spire-400' : 'font-bold'}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 tabular-nums">
                    {p.wins_together}/{p.runs_together}
                  </td>
                  <td className="px-4 py-2.5"><WinBar value={p.win_rate_together} /></td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 tabular-nums">
                    {p.win_rate_a.toFixed(0)}% / {p.win_rate_b.toFixed(0)}%
                  </td>
                  <td className="px-4 py-2.5"><LiftBadge value={p.synergy_lift} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
