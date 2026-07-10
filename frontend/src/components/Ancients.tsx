import { useEffect, useMemo, useState } from 'react';
import { fetchAncients, fetchCharacters, fetchBuilds, type AncientStat } from '../api';
import { formatRelicId, formatEventName, formatCharacter } from '../utils';

const CHARACTER_ORDER = ['IRONCLAD', 'SILENT', 'NECROBINDER', 'REGENT', 'DEFECT'];
const CHARACTER_STYLE: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
  IRONCLAD:    { bg: 'bg-red-950/40',    border: 'border-red-800/60',    text: 'text-red-300',    activeBg: 'bg-red-800' },
  SILENT:      { bg: 'bg-green-950/40',  border: 'border-green-800/60',  text: 'text-green-300',  activeBg: 'bg-green-800' },
  NECROBINDER: { bg: 'bg-pink-950/40',   border: 'border-pink-800/60',   text: 'text-pink-300',   activeBg: 'bg-pink-800' },
  REGENT:      { bg: 'bg-yellow-950/40', border: 'border-yellow-800/60', text: 'text-yellow-300', activeBg: 'bg-yellow-800' },
  DEFECT:      { bg: 'bg-blue-950/40',   border: 'border-blue-800/60',   text: 'text-blue-300',   activeBg: 'bg-blue-800' },
  WATCHER:     { bg: 'bg-purple-950/40', border: 'border-purple-800/60', text: 'text-purple-300', activeBg: 'bg-purple-800' },
};
const CHARACTER_ICON: Record<string, string> = {
  IRONCLAD: '🗡️', SILENT: '🗡️', DEFECT: '🤖', WATCHER: '👁️', NECROBINDER: '💀', REGENT: '👑',
};

function WinRateBar({ value, runs }: { value: number; runs: number }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-sm text-gray-200 tabular-nums">{value.toFixed(1)}%</span>
      <span className="text-xs text-gray-500 tabular-nums">({runs})</span>
    </div>
  );
}

function RelicTable({ rows }: { rows: AncientStat[] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500 italic">No data yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
          <th className="pb-2 font-medium">Relic</th>
          <th className="pb-2 font-medium text-right pr-8">Picked</th>
          <th className="pb-2 font-medium">Win Rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors"
          >
            <td className="py-2 pr-4 text-gray-200 font-medium">{formatRelicId(row.relic_id)}</td>
            <td className="py-2 pr-8 text-right text-gray-400 tabular-nums">{row.times_picked}</td>
            <td className="py-2">
              <WinRateBar value={row.win_rate} runs={row.times_picked} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Ancients() {
  const [stats, setStats] = useState<AncientStat[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [builds, setBuilds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChar, setSelectedChar] = useState('');
  const [selectedBuild, setSelectedBuild] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<string>('ALL');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, chars, buildList] = await Promise.all([
        fetchAncients({
          character: selectedChar || undefined,
          buildId: selectedBuild || undefined,
        }),
        fetchCharacters(),
        fetchBuilds(),
      ]);
      setStats(data);
      setCharacters(chars);
      setBuilds(buildList);
    } catch {
      setError('Could not reach the backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [selectedChar, selectedBuild]);

  const neowStats = useMemo(
    () => stats.filter(s => s.is_neow === 1).sort((a, b) => b.win_rate - a.win_rate || b.times_picked - a.times_picked),
    [stats]
  );

  const ancientEvents = useMemo(() => {
    const nonNeow = stats.filter(s => s.is_neow === 0);
    const eventMap = new Map<string, AncientStat[]>();
    for (const row of nonNeow) {
      if (!eventMap.has(row.event_name)) eventMap.set(row.event_name, []);
      eventMap.get(row.event_name)!.push(row);
    }
    // Sort each event's relics by win rate
    for (const [, rows] of eventMap) {
      rows.sort((a, b) => b.win_rate - a.win_rate || b.times_picked - a.times_picked);
    }
    return eventMap;
  }, [stats]);

  const eventNames = useMemo(() => Array.from(ancientEvents.keys()).sort(), [ancientEvents]);

  const orderedChars = [...characters].sort((a, b) => {
    const ai = CHARACTER_ORDER.indexOf(a.replace(/^CHARACTER\./, ''));
    const bi = CHARACTER_ORDER.indexOf(b.replace(/^CHARACTER\./, ''));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Character filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedChar('')}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
              !selectedChar
                ? 'bg-gray-600 border-gray-500 text-white'
                : 'bg-gray-900/40 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            All
          </button>
          {orderedChars.map(c => {
            const key = c.replace(/^CHARACTER\./, '');
            const style = CHARACTER_STYLE[key] ?? {
              bg: 'bg-gray-900/40', border: 'border-gray-700',
              text: 'text-gray-300', activeBg: 'bg-gray-700',
            };
            const isActive = selectedChar === c;
            return (
              <button
                key={c}
                onClick={() => setSelectedChar(isActive ? '' : c)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                  isActive
                    ? `${style.activeBg} border-transparent text-white shadow-lg`
                    : `${style.bg} ${style.border} ${style.text} hover:brightness-125`
                }`}
              >
                <span>{CHARACTER_ICON[key] ?? '⚔️'}</span>
                {formatCharacter(c)}
              </button>
            );
          })}
        </div>

        {/* Build filter */}
        {builds.length > 1 && (
          <select
            value={selectedBuild}
            onChange={e => setSelectedBuild(e.target.value)}
            className="ml-auto text-xs bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-gray-300"
          >
            <option value="">All patches</option>
            {builds.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      {!loading && !error && (
        <div className="space-y-8">
          {/* Neow's Bonus */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-semibold text-gray-100">Neow's Bonus</h2>
              <span className="text-xs text-gray-500">{neowStats.length} relics · {neowStats.reduce((s, r) => s + r.times_picked, 0)} total picks</span>
            </div>
            {neowStats.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No Neow data yet.</p>
            ) : (
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <RelicTable rows={neowStats} />
              </div>
            )}
          </section>

          {/* Ancient Events */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-semibold text-gray-100">Ancient Events</h2>
              <span className="text-xs text-gray-500">{eventNames.length} events</span>
            </div>

            {/* Event tabs */}
            {eventNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button
                  onClick={() => setSelectedEvent('ALL')}
                  className={`px-3 py-1 rounded-md border text-xs font-medium transition-colors ${
                    selectedEvent === 'ALL'
                      ? 'bg-spire-600 border-spire-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  All
                </button>
                {eventNames.map(name => (
                  <button
                    key={name}
                    onClick={() => setSelectedEvent(selectedEvent === name ? 'ALL' : name)}
                    className={`px-3 py-1 rounded-md border text-xs font-medium transition-colors ${
                      selectedEvent === name
                        ? 'bg-purple-900/70 border-purple-700 text-purple-200'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {formatEventName(name)}
                  </button>
                ))}
              </div>
            )}

            {selectedEvent === 'ALL' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {eventNames.map(name => {
                  const rows = ancientEvents.get(name) ?? [];
                  return (
                    <div key={name} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-purple-300 mb-3">{formatEventName(name)}</h3>
                      <RelicTable rows={rows} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-purple-300 mb-3">{formatEventName(selectedEvent)}</h3>
                <RelicTable rows={ancientEvents.get(selectedEvent) ?? []} />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
