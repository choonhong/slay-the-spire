import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';
import type { CardStat } from '../api';
import { formatCardId } from '../utils';

interface Props {
  data: CardStat[];
  character?: string | null;
}

const WIN_COLOR = '#22c55e';

export default function TopCardsChart({ data, character }: Props) {
  const charLabel = character ? ` — ${character.charAt(0) + character.slice(1).toLowerCase()}` : '';

  // Top 15 by win rate (min 3 runs with card)
  const topByWinRate = [...data]
    .filter(d => d.runs_with_card >= 3)
    .sort((a, b) => b.win_rate - a.win_rate || b.runs_with_card - a.runs_with_card)
    .slice(0, 15)
    .map(d => ({
      name: formatCardId(d.card_id),
      win_rate: d.win_rate,
      runs_with_card: d.runs_with_card,
    }));

  return (
    <div>
      {/* Win Rate Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">
          Best Win Rate Cards{charLabel}
        </h3>
        <p className="text-xs text-gray-500 mb-4">Win rate = % of runs won when this card was in your deck (min. 3 runs)</p>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={topByWinRate} layout="vertical" margin={{ left: 8, right: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={v => `${v}%`}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={180}
              tick={{ fill: '#ffffff', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '8px 12px', color: '#ffffff' }}
              labelStyle={{ color: '#ffffff', fontWeight: 700, marginBottom: 4 }}
              itemStyle={{ color: '#ffffff' }}
              formatter={(value: number, _name: string, props) => {
                const runs = (props.payload as { runs_with_card?: number })?.runs_with_card ?? 0;
                return [`${value.toFixed(1)}%  ·  ${runs} run${runs !== 1 ? 's' : ''}`, 'Win Rate'];
              }}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            />
            <Bar dataKey="win_rate" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {topByWinRate.map((_, i) => (
                <Cell key={i} fill={WIN_COLOR} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
