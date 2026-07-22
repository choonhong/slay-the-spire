import { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CardNameCell } from './CardNameCell';
import ClearableInput from './ClearableInput';
import PageHeader from './PageHeader';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { fetchCardStats, fetchCharacters, fetchBuilds, fetchCommunityCards, fetchCardText, type CardStat, type CommunityCard, type CardText, type CopyWinRate } from '../api';
import { formatCharacter } from '../utils';

type CardRow = CardStat & { community_score: number; community_tier: string };
const col = createColumnHelper<CardRow>();

const CHARACTER_STYLE: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
  IRONCLAD:    { bg: 'bg-gray-800/40', border: 'border-gray-700', text: 'text-gray-300', activeBg: 'bg-spire-600' },
  SILENT:      { bg: 'bg-gray-800/40', border: 'border-gray-700', text: 'text-gray-300', activeBg: 'bg-spire-600' },
  DEFECT:      { bg: 'bg-gray-800/40', border: 'border-gray-700', text: 'text-gray-300', activeBg: 'bg-spire-600' },
  WATCHER:     { bg: 'bg-gray-800/40', border: 'border-gray-700', text: 'text-gray-300', activeBg: 'bg-spire-600' },
  NECROBINDER: { bg: 'bg-gray-800/40', border: 'border-gray-700', text: 'text-gray-300', activeBg: 'bg-spire-600' },
  REGENT:      { bg: 'bg-gray-800/40', border: 'border-gray-700', text: 'text-gray-300', activeBg: 'bg-spire-600' },
};

const CHARACTER_ORDER = ['IRONCLAD', 'SILENT', 'NECROBINDER', 'REGENT', 'DEFECT', 'WATCHER'];

function winRateColor(value: number) {
  return value >= 70 ? 'text-green-400' :
    value >= 50 ? 'text-yellow-400' :
    'text-red-400';
}

function WinRateBadge({ value, byCopies }: { value: number; byCopies?: CopyWinRate[] }) {
  const rows = byCopies?.filter(b => b.runs > 0) ?? [];
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const el = triggerRef.current;
    if (!el || rows.length === 0) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top - 8, left: r.left + r.width / 2 });
  };
  const hide = () => setPos(null);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        className={`inline-block font-semibold ${winRateColor(value)} ${rows.length ? 'cursor-help' : ''}`}
      >
        {value.toFixed(1)}%
      </span>
      {pos && createPortal(
        <div
          className="fixed z-[9999] -translate-x-1/2 -translate-y-full pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="min-w-[180px] rounded-lg border border-gray-600 bg-gray-950 px-3.5 py-3 shadow-2xl">
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-2.5">
              By copies in deck
            </div>
            <div className="grid gap-1.5">
              {rows.map(b => (
                <div key={b.copies} className="flex items-center justify-between gap-5 text-xs tabular-nums">
                  <span className="text-gray-400">{b.label}</span>
                  <span>
                    <span className={`font-semibold ${winRateColor(b.win_rate)}`}>{b.win_rate.toFixed(1)}%</span>
                    <span className="text-gray-600 ml-1.5">{b.wins}/{b.runs}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
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

const TIER_COLOR: Record<string, string> = {
  S: 'bg-yellow-500 text-black',
  A: 'bg-green-600 text-white',
  B: 'bg-blue-600 text-white',
  C: 'bg-gray-600 text-white',
  D: 'bg-red-900 text-gray-300',
};

const ENERGY_COLOR: Record<string, string> = {
  '0': 'bg-green-700 text-green-100',
  '1': 'bg-blue-700 text-blue-100',
  '2': 'bg-yellow-700 text-yellow-100',
  '3': 'bg-red-800 text-red-100',
  'X': 'bg-purple-700 text-purple-100',
  'N/A': 'bg-gray-700 text-gray-300',
};


function TierBadge({ tier, score }: { tier: string; score: number }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold ${TIER_COLOR[tier] ?? 'bg-gray-700 text-gray-300'}`}>
      {tier} <span className="font-normal opacity-80">{score.toFixed(0)}</span>
    </span>
  );
}

export default function CardStatsTable() {
  const [data, setData] = useState<CardRow[]>([]);
  const [communityMap, setCommunityMap] = useState<Map<string, CommunityCard>>(new Map());
  const [cardTextMap, setCardTextMap] = useState<Map<string, CardText>>(new Map());
  const [characters, setCharacters] = useState<string[]>([]);
  const [builds, setBuilds] = useState<string[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'win_rate', desc: true },
    { id: 'runs_with_card', desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedChar, setSelectedChar] = useState('');
  const [colorlessOnly, setColorlessOnly] = useState(false);
  const [selectedBuild, setSelectedBuild] = useState('');
  const [minRuns, setMinRuns] = useState(3);
  const [scope, setScope] = useState<'global' | 'mine'>('mine');
  const hasLoadedOnce = useRef(false);

  const loadData = async () => {
    if (!hasLoadedOnce.current) setInitialLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [stats, weightedStats, chars, buildList, communityCards, cardTexts] = await Promise.all([
        fetchCardStats({
          character: selectedChar || undefined,
          buildId: selectedBuild || undefined,
          scope,
        }),
        fetchCardStats({
          character: selectedChar || undefined,
          buildId: selectedBuild || undefined,
          weighted: true,
          scope,
        }),
        fetchCharacters(),
        fetchBuilds(),
        fetchCommunityCards(),
        fetchCardText(),
      ]);
      const cMap = new Map(communityCards.map(c => [c.id, c]));
      const tMap = new Map(cardTexts.map(c => [c.id, c]));
      const weightedMap = new Map(weightedStats.map(s => [s.card_id, s.win_rate]));
      setData(stats.map(s => ({
        ...s,
        weighted_win_rate: weightedMap.get(s.card_id),
        community_score: cMap.get(s.card_id)?.powerScore ?? -1,
        community_tier: cMap.get(s.card_id)?.powerTier ?? '',
      })));
      setCharacters(chars);
      setBuilds(buildList);
      setCommunityMap(cMap);
      setCardTextMap(tMap);
      hasLoadedOnce.current = true;
    } catch {
      setError('Could not reach the backend. Make sure the server is running on port 3001.');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedChar, selectedBuild, colorlessOnly, scope]);

  const filtered = useMemo(
    () => data.filter(d => {
      if (d.runs_with_card < minRuns) return false;
      if (cardTextMap.get(d.card_id)?.type === 'Curse') return false;
      if (colorlessOnly && cardTextMap.get(d.card_id)?.color !== 'colorless') return false;
      return true;
    }),
    [data, minRuns, cardTextMap, colorlessOnly]
  );

  const columns = useMemo(() => [
    col.accessor('card_id', {
      header: 'Card',
      cell: info => <CardNameCell id={info.getValue()} cardTextMap={cardTextMap} colorByRarity />,
    }),
    col.accessor('community_score', {
      header: 'Score',
      cell: info => {
        const score = info.getValue();
        const tier = info.row.original.community_tier;
        if (score < 0) return <span className="text-gray-600">—</span>;
        return <TierBadge tier={tier} score={score} />;
      },
    }),
    col.accessor('runs_with_card', {
      header: 'Runs',
      cell: info => {
        const runs = info.getValue();
        const wins = info.row.original.runs_won_with_card;
        const pct = runs > 0 ? (wins / runs) * 100 : 0;
        const barColor = pct >= 60 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
        return (
          <div className="flex items-center gap-2 min-w-[90px]">
            <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden shrink-0">
              <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-gray-300 tabular-nums text-xs">
              <span className="text-gray-100 font-medium">{wins}</span>
              <span className="text-gray-500">/{runs}</span>
            </span>
          </div>
        );
      },
    }),
    col.accessor('win_rate', {
      header: 'Win Rate',
      cell: info => <WinRateBadge value={info.getValue()} byCopies={info.row.original.by_copies} />,
    }),
    col.accessor('weighted_win_rate', {
      header: 'Weighted WR',
      cell: info => {
        const v = info.getValue();
        return v != null
          ? <WinRateBadge value={v} byCopies={info.row.original.by_copies} />
          : <span className="text-gray-600">—</span>;
      },
    }),
  ], [communityMap, cardTextMap]);

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
      <PageHeader
        title="Card Stats"
        countLabel={!initialLoading ? `${filtered.length} cards` : undefined}
        onRefresh={loadData}
      />

      {/* Character picker */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setSelectedChar(''); setColorlessOnly(false); }}
          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
            selectedChar === '' && !colorlessOnly
              ? 'bg-spire-600 border-gray-700 text-white'
              : 'bg-gray-900/40 border-gray-700 text-gray-400 hover:brightness-125'
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
            text: 'text-gray-300', activeBg: 'bg-spire-600',
          };
          const isActive = selectedChar === c;
          return (
            <button
              key={c}
              onClick={() => { setColorlessOnly(false); setSelectedChar(isActive ? '' : c); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                isActive
                  ? `${style.activeBg} ${style.border} text-white`
                  : `${style.bg} ${style.border} ${style.text} hover:brightness-125`
              }`}
            >
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
              ? 'bg-spire-600 border-gray-700 text-white'
              : 'bg-gray-900/40 border-gray-700 text-gray-400 hover:brightness-125'
          }`}
        >
          Colorless
        </button>
      </div>

{/* Scope toggle */}
      <div className="flex rounded-lg bg-gray-800/60 p-0.5 w-fit gap-0.5">
        {(['global', 'mine'] as const).map(s => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              scope === s
                ? 'bg-spire-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {s === 'global' ? 'Global Stats' : 'My Stats'}
          </button>
        ))}
      </div>

{/* Secondary filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <ClearableInput
          placeholder="Search cards..."
          value={globalFilter}
          onChange={setGlobalFilter}
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
          <span>Min. runs:</span>
          <input
            type="number"
            min={0}
            value={minRuns}
            onChange={e => setMinRuns(Math.max(0, Number(e.target.value)))}
            className="w-14 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:border-spire-500"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Table — keep previous rows while refetching; only blank on first load */}
      <div
        className={`rounded-lg border border-gray-800 overflow-visible transition-opacity duration-200 ${
          refreshing ? 'opacity-55' : 'opacity-100'
        }`}
      >
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
                      {header.column.getCanSort() && (
                        <span className="inline-flex flex-col gap-px leading-none ml-0.5">
                          <span className={`text-[8px] leading-none ${header.column.getIsSorted() === 'asc' ? 'text-gray-200' : 'text-gray-600'}`}>▲</span>
                          <span className={`text-[8px] leading-none ${header.column.getIsSorted() === 'desc' ? 'text-gray-200' : 'text-gray-600'}`}>▼</span>
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {initialLoading ? (
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
