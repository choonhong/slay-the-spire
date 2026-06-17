import { useState } from 'react';
import CardStatsTable from './components/CardStatsTable';
import RunHistory from './components/RunHistory';
import Synergies from './components/Synergies';
import Ancients from './components/Ancients';
import Settings from './components/Settings';

type Tab = 'stats' | 'runs' | 'synergies' | 'ancients' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('stats');

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🗡️</span>
            <span className="font-bold text-lg tracking-tight text-spire-400">
              STS2 Card Tracker
            </span>
          </div>
          <nav className="flex gap-1 ml-4">
            {(['stats', 'runs', 'synergies', 'ancients', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  tab === t
                    ? 'bg-spire-600 text-white'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                }`}
              >
                {t === 'stats' ? 'Card Stats'
                  : t === 'runs' ? 'Run History'
                  : t === 'synergies' ? 'Synergies'
                  : t === 'ancients' ? 'Ancients'
                  : 'Settings'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {tab === 'stats' && <CardStatsTable />}
        {tab === 'runs' && <RunHistory />}
        {tab === 'synergies' && <Synergies />}
        {tab === 'ancients' && <Ancients />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}
