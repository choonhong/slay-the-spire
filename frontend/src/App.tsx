import { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import CardStatsTable from './components/CardStatsTable';
import RunHistory from './components/RunHistory';
import Synergies from './components/Synergies';
import Ancients from './components/Ancients';
import Advisor from './components/Advisor';
import Settings from './components/Settings';
import { useTheme } from './themes';

type Tab = 'stats' | 'synergies' | 'ancients' | 'runs' | 'advisor' | 'settings';

function AppInner() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('stats');
  useTheme(); // initialize theme from localStorage on mount

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <span className="text-gray-500 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-3 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-2xl tracking-tight text-spire-400">
              STS2 Advisor
            </span>
          </div>
          <nav className="flex gap-1 ml-4">
            {(['stats', 'synergies', 'ancients', 'runs', 'advisor', 'settings'] as Tab[]).map((t) => (
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
                  : t === 'synergies' ? 'Synergies'
                  : t === 'ancients' ? 'Ancient Relics'
                  : t === 'runs' ? 'Run History'
                  : t === 'advisor' ? 'Advisor'
                  : 'Settings'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 sm:px-8 py-6">
        <div className={tab === 'stats' ? '' : 'hidden'}><CardStatsTable /></div>
        <div className={tab === 'synergies' ? '' : 'hidden'}><Synergies active={tab === 'synergies'} /></div>
        <div className={tab === 'ancients' ? '' : 'hidden'}><Ancients /></div>
        {tab === 'runs' && <RunHistory />}
        <div className={tab === 'advisor' ? '' : 'hidden'}><Advisor /></div>
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
