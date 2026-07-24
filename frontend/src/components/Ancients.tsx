import { useEffect, useMemo, useState } from 'react';
import { fetchAncients, fetchCharacters, fetchBuilds, type AncientStat } from '../api';
import { formatRelicId, formatEventName, formatCharacter } from '../utils';
import { sortCharacters } from '../constants/characters';
import PageHeader from './PageHeader';
import SlidingPill from './SlidingPill';

function WinRateBar({ value, runs }: { value: number; runs: number }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
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
    <div className="rounded-xl overflow-hidden glass-sm">
      <table className="w-full text-sm">
        <thead style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <tr className="text-left">
            <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Relic</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Picked</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.relic_id}
              className={`border-t border-gray-800/50 hover:bg-gray-800/40 transition-colors ${i % 2 === 0 ? 'bg-gray-900/20' : ''}`}
            >
              <td className="px-4 py-2.5 text-gray-200 font-bold">{formatRelicId(row.relic_id)}</td>
              <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{row.times_picked}</td>
              <td className="px-4 py-2.5">
                <WinRateBar value={row.win_rate} runs={row.times_picked} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const [scope, setScope] = useState<'global' | 'mine'>('mine');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, chars, buildList] = await Promise.all([
        fetchAncients({
          character: selectedChar || undefined,
          buildId: selectedBuild || undefined,
          scope,
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

  useEffect(() => { load(); }, [selectedChar, selectedBuild, scope]);

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

  const orderedChars = sortCharacters(characters);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ancient Relics"
        onRefresh={load}
      />

      {/* Character filter + version + scope toggle — all one row */}
      <div className="flex flex-wrap gap-2 items-center">
        <SlidingPill
          options={[
            { id: '__all__', label: 'All' },
            ...orderedChars.map(c => ({ id: c, label: formatCharacter(c) })),
          ]}
          value={selectedChar || '__all__'}
          onChange={id => setSelectedChar(id === '__all__' ? '' : id)}
        />

        {builds.length > 1 && (
          <select
            value={selectedBuild}
            onChange={e => setSelectedBuild(e.target.value)}
            className="px-4 py-1.5 rounded-full text-sm text-gray-100 glass-input"
          >
            <option value="">All Versions</option>
            {builds.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}

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

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      {!loading && !error && (
        <div className="space-y-8">
          {/* Neow's Bonus */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-bold text-gray-100">Neow's Bonus</h2>
              <span className="text-xs text-gray-500">{neowStats.length} relics · {neowStats.reduce((s, r) => s + r.times_picked, 0)} total picks</span>
            </div>
            {neowStats.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No Neow data yet.</p>
            ) : (
              <RelicTable rows={neowStats} />
            )}
          </section>

          {/* Ancient Events */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-bold text-gray-100">Ancient Events</h2>
              <span className="text-xs text-gray-500">{eventNames.length} events</span>
            </div>

            {/* Event tabs */}
            {eventNames.length > 0 && (
              <div className="mb-4">
                <SlidingPill
                  options={[
                    { id: 'ALL', label: 'All' },
                    ...eventNames.map(n => ({ id: n, label: formatEventName(n), activeClass: 'bg-purple-600' })),
                  ]}
                  value={selectedEvent}
                  onChange={id => setSelectedEvent(selectedEvent === id && id !== 'ALL' ? 'ALL' : id)}
                />
              </div>
            )}

            {selectedEvent === 'ALL' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {eventNames.map(name => {
                  const rows = ancientEvents.get(name) ?? [];
                  return (
                    <div key={name} className="space-y-2">
                      <h3 className="text-sm font-semibold text-purple-300 uppercase tracking-wide px-1">{formatEventName(name)}</h3>
                      <RelicTable rows={rows} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-purple-300 uppercase tracking-wide px-1">{formatEventName(selectedEvent)}</h3>
                <RelicTable rows={ancientEvents.get(selectedEvent) ?? []} />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
