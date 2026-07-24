import { useEffect, useState } from 'react';
import { fetchRuns, fetchCharacters, fetchBuilds, type RunRow } from '../api';
import { formatCharacter } from '../utils';
import { sortCharacters } from '../constants/characters';
import RunDetailPanel from './RunDetailPanel';
import PageHeader from './PageHeader';
import SlidingPill from './SlidingPill';

function formatRunDate(run: RunRow): string {
  const d = run.start_time
    ? new Date(run.start_time * 1000)
    : new Date(run.parsed_at);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatActs(actsJson: string): string {
  try {
    const acts: string[] = JSON.parse(actsJson);
    return acts
      .map(a =>
        a
          .replace(/^ACT\./, '')
          .split('_')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
      )
      .join(' → ');
  } catch {
    return actsJson;
  }
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
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

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

  useEffect(() => { load(); }, [page, selectedChar, selectedBuild]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggle = (id: number) => setExpandedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const sortedChars = sortCharacters(characters);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Run History"
        countLabel={!loading ? `${total} runs` : undefined}
        onRefresh={load}
      />

      {/* Character filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <SlidingPill
          options={[
            { id: '__all__', label: 'All' },
            ...sortedChars.map(c => ({ id: c, label: formatCharacter(c) })),
          ]}
          value={selectedChar || '__all__'}
          onChange={id => {
            setSelectedChar(id === '__all__' ? '' : (selectedChar === id ? '' : id));
            setPage(0);
          }}
        />

        {builds.length > 1 && (
          <select
            value={selectedBuild}
            onChange={e => { setSelectedBuild(e.target.value); setPage(0); }}
            className="ml-auto px-3 py-1.5 rounded-full text-sm text-gray-100 glass-input"
          >
            <option value="">All Versions</option>
            {builds.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-red-300 text-sm glass-sm" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          {error}
        </div>
      )}

      {/* Run list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No runs found</div>
      ) : (
        <div className="rounded-xl overflow-hidden glass-sm">
          {runs.map((run, i) => (
            <div
              key={run.id}
              className={`border-t border-gray-800/50 ${i === 0 ? 'border-t-0' : ''}`}
            >
              {/* Row */}
              <button
                onClick={() => toggle(run.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
              >
                {/* Character badge */}
                <span className="px-2 py-0.5 text-xs rounded-full font-medium text-gray-300"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {formatCharacter(run.character)}
                </span>

                {/* Ascension */}
                <span className="text-xs text-gray-400 font-mono shrink-0">A{run.ascension}</span>

                {/* Acts */}
                <span className="text-xs text-gray-500 hidden sm:block truncate">
                  {formatActs(run.acts)}
                </span>

                {/* Win / Loss pill */}
                {run.win ? (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full shrink-0"
                    style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(52,211,153,0.3)', color: '#6ee7b7' }}>
                    Win
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full shrink-0"
                    style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                    Floor {run.floor_reached}
                  </span>
                )}

                <span className="flex-1" />

                {/* Date */}
                <span className="text-xs text-gray-500 ml-auto whitespace-nowrap shrink-0">
                  {formatRunDate(run)}
                </span>

                {/* Chevron */}
                <span className={`text-gray-600 text-xs transition-transform duration-200 shrink-0 ${expandedIds.has(run.id) ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>

              {/* Detail panel */}
              {expandedIds.has(run.id) && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <RunDetailPanel runId={run.id} />
                </div>
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
            className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-40 transition-all glass-button text-gray-300 hover:text-white"
          >
            Previous
          </button>
          <span className="text-sm text-gray-400">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-40 transition-all glass-button text-gray-300 hover:text-white"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
