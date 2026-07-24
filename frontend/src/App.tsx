import { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import CardStatsTable from './components/CardStatsTable';
import RunHistory from './components/RunHistory';
import Synergies from './components/Synergies';
import Ancients from './components/Ancients';
import Advisor from './components/Advisor';
import Settings from './components/Settings';
import SlidingPill from './components/SlidingPill';
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
      <header className="sticky top-0 z-10" style={{
        background: 'rgba(8, 11, 20, 0.75)',
        backdropFilter: 'blur(32px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(32px) saturate(1.5)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-3 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-2xl tracking-tight text-spire-400" style={{
              textShadow: '0 0 20px rgba(255,180,84,0.35)',
            }}>
              STS2 Advisor
            </span>
          </div>
          <nav className="ml-4">
            <SlidingPill
              options={([
                { id: 'stats',     label: 'Card Stats' },
                { id: 'synergies', label: 'Synergies' },
                { id: 'ancients',  label: 'Ancient Relics' },
                { id: 'runs',      label: 'Run History' },
                { id: 'advisor',   label: 'Advisor' },
                { id: 'settings',  label: 'Settings' },
              ] as const).map(o => ({ ...o, activeClass: 'bg-white/10 border border-white/20' }))}
              value={tab}
              onChange={id => setTab(id as Tab)}
              bare
            />
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
