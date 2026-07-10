import { useState } from 'react';
import { fetchRunDetails, fetchAiInsight, fetchCardText, type RunDetails, type CardText } from '../api';
import { formatCardId } from '../utils';
import { CardNameCell } from './CardNameCell';

const RARITY_COLOR: Record<string, string> = {
  Rare:     'text-yellow-400',
  Uncommon: 'text-blue-400',
  Common:   'text-gray-200',
  Starter:  'text-red-400',
  Special:  'text-purple-400',
  Curse:    'text-red-500',
};

interface Props {
  runId: number;
}

export default function RunDetailPanel({ runId }: Props) {
  const [details, setDetails] = useState<RunDetails | null>(null);
  const [cardTextMap, setCardTextMap] = useState<Map<string, CardText>>(new Map());
  const [loading, setLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load details once on first render of the panel
  if (!loaded && !loading) {
    setLoading(true);
    setLoaded(true);
    Promise.all([
      fetchRunDetails(runId),
      fetchCardText(),
    ]).then(([d, cardTexts]) => {
      setDetails(d);
      setCardTextMap(new Map(cardTexts.map(c => [c.id, c])));
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  const handleAiInsight = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const insight = await fetchAiInsight(runId);
      setAiInsight(insight);
    } catch {
      setAiError('Could not reach Ollama. Make sure it is running: ollama serve');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-3 text-sm text-gray-500">Loading details...</div>
    );
  }

  if (!details) return null;

  const pickRate = details.card_offers > 0
    ? Math.round((details.cards_picked / details.card_offers) * 100)
    : 0;

  return (
    <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-800/60">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
        <Stat label="Floor reached" value={String(details.floor_reached)} />
        <Stat label="Final deck" value={`${details.final_deck_size} cards`} />
        <Stat
          label="Total damage taken"
          value={String(details.total_damage_taken)}
          sub={details.damage_per_act.map((a, i) => `Act ${i + 1}: ${a.damage}`).join(' / ')}
        />
      </div>

      {/* Relics */}
      {details.relics.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Relics</p>
          <div className="flex flex-wrap gap-1.5">
            {details.relics.map((r, i) => (
              <span key={i} className="px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Final deck */}
      {details.final_deck.length > 0 && (() => {
        // Group by id+upgraded key, preserving rarity order
        const grouped = new Map<string, { id: string; upgraded: boolean; count: number }>();
        for (const card of details.final_deck) {
          const key = `${card.id}__${card.upgraded ? '+' : ''}`;
          if (grouped.has(key)) grouped.get(key)!.count++;
          else grouped.set(key, { id: card.id, upgraded: card.upgraded, count: 1 });
        }
        const rarityOrder = ['Rare', 'Uncommon', 'Common', 'Starter', 'Special', 'Curse', 'Unknown'];
        const entries = [...grouped.values()].sort((a, b) => {
          const ra = rarityOrder.indexOf(cardTextMap.get(a.id)?.rarity ?? 'Unknown');
          const rb = rarityOrder.indexOf(cardTextMap.get(b.id)?.rarity ?? 'Unknown');
          return ra - rb;
        });
        const rarityCounts: Record<string, number> = {};
        for (const { id, count } of entries) {
          const r = cardTextMap.get(id)?.rarity ?? 'Unknown';
          rarityCounts[r] = (rarityCounts[r] ?? 0) + count;
        }
        const rarityParts = ['Rare','Uncommon','Common','Starter','Special','Curse']
          .filter(r => rarityCounts[r])
          .map(r => ({ rarity: r, count: rarityCounts[r] }));
        return (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Final Deck <span className="text-gray-600 font-normal normal-case">({details.final_deck.length} cards)</span>
            </p>
            <div className="p-2 bg-gray-900/50 border border-gray-800 rounded-lg">
              {/* Rarity summary */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 text-xs">
                {rarityParts.map(({ rarity, count }) => (
                  <span key={rarity} className={RARITY_COLOR[rarity] ?? 'text-gray-400'}>
                    {count} {rarity}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-x-2 gap-y-0.5">
                {entries.map(({ id, upgraded, count }) => {
                  const ct = cardTextMap.get(id);
                  const colorClass = RARITY_COLOR[ct?.rarity ?? ''] ?? 'text-gray-300';
                  return (
                    <div key={`${id}-${upgraded}`} className="flex items-baseline gap-0.5 min-w-0">
                      <CardNameCell
                        id={id}
                        cardTextMap={cardTextMap}
                        className={`text-sm truncate ${colorClass}`}
                      />
                      {upgraded && <span className="text-cyan-400 text-xs font-bold shrink-0">+</span>}
                      {count > 1 && <span className="text-gray-500 text-xs shrink-0">×{count}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}


      {/* Patch version (hidden here) */}
      {details.build_id && (
        <p className="text-xs text-gray-600 font-mono">Patch: {details.build_id}</p>
      )}

      {/* AI Insight */}
      <div className="border-t border-gray-800/60 pt-3">
        {aiInsight ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">AI Coach</p>
            <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
              {aiInsight}
            </div>
            <button
              onClick={() => setAiInsight(null)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleAiInsight}
              disabled={aiLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-50 rounded-md text-sm text-gray-300 transition-colors"
            >
              {aiLoading ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-gray-500 border-t-gray-200 rounded-full animate-spin" />
                  Thinking...
                </>
              ) : (
                <>✨ AI Coach</>
              )}
            </button>
            {aiError && <p className="text-xs text-red-400">{aiError}</p>}
            {!aiError && (
              <p className="text-xs text-gray-600">Requires <code>ollama serve</code></p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
