import { useEffect, useState } from 'react';
import { fetchSynergies, fetchCharacters, fetchBuilds, type SynergyPair } from '../api';
import { formatCardId, formatCharacter } from '../utils';

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
      <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-sm text-gray-200 tabular-nums">{value.toFixed(1)}%</span>
    </div>
  );
}

export default function Synergies() {
  const [pairs, setPairs] = useState<SynergyPair[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [builds, setBuilds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChar, setSelectedChar] = useState('');
  const [selectedBuild, setSelectedBuild] = useState('');
  const [minRuns, setMinRuns] = useState(2);
  const [sortBy, setSortBy] = useState<'win_rate' | 'lift' | 'runs'>('lift');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, chars, buildList] = await Promise.all([
        fetchSynergies({
          character: selectedChar || undefined,
          buildId: selectedBuild || undefined,
          minRuns,
        }),
        fetchCharacters(),
        fetchBuilds(),
      ]);
      setPairs(data);
      setCharacters(chars);
      setBuilds(buildList);
    } catch {
      setError('Could not reach the backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [selectedChar, selectedBuild, minRuns]);

  const sorted = [...pairs].sort((a, b) => {
    if (sortBy === 'lift') return b.synergy_lift - a.synergy_lift;
    if (sortBy === 'win_rate') return b.win_rate_together - a.win_rate_together;
    return b.runs_together - a.runs_together;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-100">Card Synergies</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Pairs of cards that appear together in winning runs. Lift = win rate together minus average individual win rate.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={selectedChar}
          onChange={e => setSelectedChar(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:border-spire-500"
        >
          <option value="">All Characters</option>
          {characters.map(c => (
            <option key={c} value={c}>{formatCharacter(c)}</option>
          ))}
        </select>
        <select
          value={selectedBuild}
          onChange={e => setSelectedBuild(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:border-spire-500"
        >
          <option value="">All Patches</option>
          {builds.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Min. runs together:</span>
          <input
            type="number"
            min={2}
            value={minRuns}
            onChange={e => setMinRuns(Number(e.target.value))}
            className="w-16 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:border-spire-500"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Sort by:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:border-spire-500"
          >
            <option value="lift">Synergy Lift</option>
            <option value="win_rate">Win Rate Together</option>
            <option value="runs">Most Runs Together</option>
          </select>
        </div>
        <button
          onClick={load}
          className="ml-auto px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Refresh
        </button>
        {!loading && (
          <span className="text-xs text-gray-500">{sorted.length} pairs</span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
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
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">Loading...</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No pairs found — try lowering Min. runs together</td></tr>
            ) : (
              sorted.map((p, i) => (
                <tr
                  key={`${p.card_a}-${p.card_b}`}
                  className={`border-t border-gray-800/50 hover:bg-gray-800/40 transition-colors ${i % 2 === 0 ? 'bg-gray-900/20' : ''}`}
                >
                  <td className="px-4 py-2.5 font-medium text-gray-100">{formatCardId(p.card_a)}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-100">{formatCardId(p.card_b)}</td>
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
