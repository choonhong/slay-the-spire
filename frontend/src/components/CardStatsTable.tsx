import { useEffect, useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { fetchCardStats, fetchCharacters, fetchBuilds, type CardStat } from '../api';
import TopCardsChart from './Charts';
import { formatCardId, formatCharacter } from '../utils';

const col = createColumnHelper<CardStat>();

const CHARACTER_STYLE: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
  IRONCLAD:    { bg: 'bg-red-950/40',    border: 'border-red-800/60',    text: 'text-red-300',    activeBg: 'bg-red-800' },
  SILENT:      { bg: 'bg-green-950/40',  border: 'border-green-800/60',  text: 'text-green-300',  activeBg: 'bg-green-800' },
  DEFECT:      { bg: 'bg-blue-950/40',   border: 'border-blue-800/60',   text: 'text-blue-300',   activeBg: 'bg-blue-800' },
  WATCHER:     { bg: 'bg-purple-950/40', border: 'border-purple-800/60', text: 'text-purple-300', activeBg: 'bg-purple-800' },
  NECROBINDER: { bg: 'bg-pink-950/40', border: 'border-pink-800/60', text: 'text-pink-300', activeBg: 'bg-pink-800' },
  REGENT:      { bg: 'bg-yellow-950/40', border: 'border-yellow-800/60', text: 'text-yellow-300', activeBg: 'bg-yellow-800' },
};

const CHARACTER_ORDER = ['IRONCLAD', 'SILENT', 'NECROBINDER', 'REGENT', 'DEFECT', 'WATCHER'];

const CHARACTER_ICON: Record<string, string> = {
  IRONCLAD:    '🗡️',
  SILENT:      '🗡️',
  DEFECT:      '🤖',
  WATCHER:     '👁️',
  NECROBINDER: '💀',
  REGENT:      '👑',
};

function WinRateBadge({ value }: { value: number }) {
  const color =
    value >= 70 ? 'text-green-400' :
    value >= 50 ? 'text-yellow-400' :
    'text-red-400';
  return <span className={`font-semibold ${color}`}>{value.toFixed(1)}%</span>;
}

function PickRateBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-spire-500 rounded-full transition-all"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs text-gray-300 w-10 text-right">{value.toFixed(1)}%</span>
    </div>
  );
}

export default function CardStatsTable() {
  const [data, setData] = useState<CardStat[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [builds, setBuilds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'win_rate', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedChar, setSelectedChar] = useState('');
  const [colorlessOnly, setColorlessOnly] = useState(false);
  const [selectedBuild, setSelectedBuild] = useState('');
  const [minWins, setMinWins] = useState(1);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [stats, chars, buildList] = await Promise.all([
        fetchCardStats({
          character: selectedChar || undefined,
          buildId: selectedBuild || undefined,
          colorless: colorlessOnly || undefined,
        }),
        fetchCharacters(),
        fetchBuilds(),
      ]);
      setData(stats);
      setCharacters(chars);
      setBuilds(buildList);
    } catch {
      setError('Could not reach the backend. Make sure the server is running on port 3001.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedChar, selectedBuild, colorlessOnly]);

  const filtered = useMemo(
    () => data.filter(d => d.runs_won_with_card >= minWins),
    [data, minWins]
  );

  const columns = useMemo(() => [
    col.accessor('card_id', {
      header: 'Card',
      cell: info => (
        <span className="font-medium text-gray-100">{formatCardId(info.getValue())}</span>
      ),
    }),
    col.accessor('times_offered', {
      header: 'Offered',
      cell: info => <span className="text-gray-300">{info.getValue()}</span>,
    }),
    col.accessor('times_picked', {
      header: 'Picked',
      cell: info => <span className="text-gray-300">{info.getValue()}</span>,
    }),
    col.accessor('pick_rate', {
      header: 'Pick Rate',
      cell: info => <PickRateBar value={info.getValue()} />,
    }),
    col.accessor('runs_with_card', {
      header: 'Runs w/ Card',
      cell: info => <span className="text-gray-300">{info.getValue()}</span>,
    }),
    col.accessor('runs_won_with_card', {
      header: 'Wins w/ Card',
      cell: info => <span className="text-gray-300">{info.getValue()}</span>,
    }),
    col.accessor('win_rate', {
      header: 'Win Rate',
      cell: info => <WinRateBadge value={info.getValue()} />,
    }),
  ], []);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const activeCharKey = selectedChar.replace(/^CHARACTER\./, '');

  return (
    <div className="space-y-5">

      {/* Character picker */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setSelectedChar(''); setColorlessOnly(false); }}
          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
            selectedChar === '' && !colorlessOnly
              ? 'bg-gray-600 border-gray-500 text-white'
              : 'bg-gray-900/40 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
          }`}
        >
          All
        </button>
        {[...characters].sort((a, b) => {
            const ai = CHARACTER_ORDER.indexOf(a.replace(/^CHARACTER\./, ''));
            const bi = CHARACTER_ORDER.indexOf(b.replace(/^CHARACTER\./, ''));
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          }).map(c => {
          const key = c.replace(/^CHARACTER\./, '');
          const style = CHARACTER_STYLE[key] ?? {
            bg: 'bg-gray-900/40', border: 'border-gray-700',
            text: 'text-gray-300', activeBg: 'bg-gray-700',
          };
          const isActive = selectedChar === c;
          return (
            <button
              key={c}
              onClick={() => { setColorlessOnly(false); setSelectedChar(isActive ? '' : c); }}
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

        {/* Colorless separator + button */}
        <div className="w-px bg-gray-700 self-stretch mx-1" />
        <button
          onClick={() => { setSelectedChar(''); setColorlessOnly(c => !c); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
            colorlessOnly
              ? 'bg-gray-500 border-transparent text-white shadow-lg'
              : 'bg-gray-900/40 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
          }`}
        >
          <span>✨</span>
          Colorless
        </button>
      </div>

      {/* Chart section */}
      {!loading && !error && filtered.length > 0 && (
        <TopCardsChart data={filtered} character={activeCharKey || null} />
      )}

      {/* Secondary filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search cards..."
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-spire-500 w-48"
        />
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
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Min. wins:</span>
          <input
            type="number"
            min={0}
            value={minWins}
            onChange={e => setMinWins(Math.max(0, Number(e.target.value)))}
            className="w-14 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:border-spire-500"
          />
        </div>
        <button
          onClick={loadData}
          className="ml-auto px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Refresh
        </button>
        {!loading && (
          <span className="text-xs text-gray-500">{filtered.length} cards</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider select-none ${
                      header.column.getCanSort() ? 'cursor-pointer hover:text-gray-200' : ''
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && ' ↑'}
                      {header.column.getIsSorted() === 'desc' && ' ↓'}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  No data found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-t border-gray-800/50 hover:bg-gray-800/40 transition-colors ${
                    i % 2 === 0 ? 'bg-gray-900/20' : ''
                  }`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
