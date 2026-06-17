import { useState } from 'react';
import { fetchRunDetails, fetchAiInsight, type RunDetails } from '../api';

interface Props {
  runId: number;
}

function groupCards(deck: string[]): { name: string; count: number; isBasic: boolean }[] {
  const counts = new Map<string, number>();
  for (const card of deck) counts.set(card, (counts.get(card) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      count,
      isBasic: /^strike|^defend/i.test(name),
    }))
    .sort((a, b) => {
      // Basic cards first, then alphabetical
      if (a.isBasic !== b.isBasic) return a.isBasic ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export default function RunDetailPanel({ runId }: Props) {
  const [details, setDetails] = useState<RunDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load details once on first render of the panel
  if (!loaded && !loading) {
    setLoading(true);
    setLoaded(true);
    fetchRunDetails(runId).then(d => {
      setDetails(d);
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
          label="Total damage"
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
      {details.final_deck.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Final Deck <span className="text-gray-600 font-normal normal-case">({details.final_deck.length} cards)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {groupCards(details.final_deck).map(({ name, count, isBasic }, i) => (
              <span
                key={i}
                className={`flex items-center gap-1 px-2 py-0.5 border rounded text-xs ${
                  isBasic
                    ? 'bg-red-950/40 border-red-800/50 text-red-300'
                    : 'bg-gray-800/70 border-gray-700/60 text-gray-200'
                }`}
              >
                {name}
                {count > 1 && (
                  <span className={`font-bold ${isBasic ? 'text-red-400' : 'text-gray-400'}`}>
                    ×{count}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rule-based insights */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Insights</p>
        <ul className="space-y-1">
          {details.insights.map((ins, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-300">
              <span className="text-spire-400 mt-0.5">•</span>
              <span>{ins}</span>
            </li>
          ))}
        </ul>
      </div>

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
