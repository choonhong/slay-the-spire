import { useEffect, useState } from 'react';
import { fetchRuns, fetchCharacters, fetchBuilds, type RunRow } from '../api';
import { formatCharacter } from '../utils';
import RunDetailPanel from './RunDetailPanel';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatActs(actsJson: string): string {
  try {
    const acts: string[] = JSON.parse(actsJson);
    return acts.map(a => a.replace(/^ACT\./, '')).join(' → ');
  } catch {
    return actsJson;
  }
}

const CHARACTER_COLORS: Record<string, string> = {
  IRONCLAD:    'bg-red-900/50 text-red-300 border-red-800',
  SILENT:      'bg-green-900/50 text-green-300 border-green-800',
  DEFECT:      'bg-blue-900/50 text-blue-300 border-blue-800',
  WATCHER:     'bg-purple-900/50 text-purple-300 border-purple-800',
  NECROBINDER: 'bg-pink-900/50 text-pink-300 border-pink-800',
  REGENT:      'bg-yellow-900/50 text-yellow-300 border-yellow-800',
};

function CharBadge({ character }: { character: string }) {
  const key = character.replace(/^CHARACTER\./, '');
  const label = formatCharacter(character);
  const cls = CHARACTER_COLORS[key] ?? 'bg-gray-800 text-gray-300 border-gray-700';
  return (
    <span className={`px-2 py-0.5 text-xs rounded border font-medium ${cls}`}>
      {label}
    </span>
  );
}

const PAGE_SIZE = 20;

export default function RunHistory() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [total, setTotal] = useState(0);
  const [characters, setCharacters] = useState<string[]>([]);
  const [builds, setBuilds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selectedChar, setSelectedChar] = useState('');
  const [selectedBuild, setSelectedBuild] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, chars, buildList] = await Promise.all([
        fetchRuns({
          character: selectedChar || undefined,
          buildId: selectedBuild || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        fetchCharacters(),
        fetchBuilds(),
      ]);
      setRuns(result.runs);
      setTotal(result.total);
      setCharacters(chars);
      setBuilds(buildList);
    } catch {
      setError('Could not reach the backend. Make sure the server is running on port 3001.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(0); }, [selectedChar, selectedBuild]);
  useEffect(() => { load(); }, [page, selectedChar, selectedBuild]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggle = (id: number) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedBuild}
          onChange={e => setSelectedBuild(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:border-spire-500"
        >
          <option value="">All Patches</option>
          {builds.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
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
        <button
          onClick={load}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Refresh
        </button>
        {!loading && (
          <span className="ml-auto text-xs text-gray-500">{total} runs</span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Run list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No runs found</div>
      ) : (
        <div className="space-y-2">
          {runs.map(run => (
            <div
              key={run.id}
              className={`rounded-lg border transition-colors ${
                run.win
                  ? 'bg-green-950/20 border-green-900/40'
                  : 'bg-gray-900/40 border-gray-800'
              }`}
            >
              {/* Row */}
              <button
                onClick={() => toggle(run.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors rounded-lg"
              >
                  {/* Character */}
                <CharBadge character={run.character} />

                {/* Ascension */}
                <span className="text-xs text-gray-400 font-mono shrink-0">A{run.ascension}</span>

                {/* Acts */}
                <span className="text-xs text-gray-500 hidden sm:block truncate">
                  {formatActs(run.acts)}
                </span>

                {/* Win pill OR Floor X — right next to acts */}
                {run.win ? (
                  <span className="px-2 py-0.5 bg-green-700 text-white text-xs font-bold rounded shrink-0">
                    Win
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-red-900/60 text-red-300 border border-red-800 text-xs font-medium rounded shrink-0">
                    Floor {run.floor_reached}
                  </span>
                )}

                {/* Spacer */}
                <span className="flex-1" />

                {/* Date */}
                <span className="text-xs text-gray-500 ml-auto whitespace-nowrap shrink-0">
                  {formatDate(run.parsed_at)}
                </span>

                {/* Chevron */}
                <span className={`text-gray-600 text-xs transition-transform shrink-0 ${expandedId === run.id ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>

              {/* Detail panel */}
              {expandedId === run.id && (
                <RunDetailPanel runId={run.id} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-md disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-400">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-md disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
