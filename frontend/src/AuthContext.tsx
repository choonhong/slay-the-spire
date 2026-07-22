import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';

export interface AuthUser { id: number; username: string }

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, loading: true, logout: () => {},
});

function getOrCreateClientId(): string {
  const stored = localStorage.getItem('clientId');
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem('clientId', id);
  return id;
}

async function initAuth(): Promise<{ token: string; user: AuthUser }> {
  const clientId = getOrCreateClientId();
  const { data } = await axios.post<{ token: string; user: AuthUser }>('/api/auth/init', { clientId });
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (token) {
      // Validate existing token (server may return a refreshed token after DB wipe)
      axios.get<AuthUser & { token?: string }>('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => {
          if (r.data.token) localStorage.setItem('token', r.data.token);
          setUser({ id: r.data.id, username: r.data.username });
        })
        .catch(() => {
          // Token invalid — re-init
          localStorage.removeItem('token');
          return initAuth().then(({ token: t, user: u }) => {
            localStorage.setItem('token', t);
            setUser(u);
          });
        })
        .finally(() => setLoading(false));
    } else {
      // First visit — auto-create identity
      initAuth()
        .then(({ token: t, user: u }) => {
          localStorage.setItem('token', t);
          setUser(u);
        })
        .catch(() => {/* server unreachable */})
        .finally(() => setLoading(false));
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('clientId');
    setUser(null);
    // Re-init with a fresh ID
    initAuth().then(({ token: t, user: u }) => {
      localStorage.setItem('token', t);
      setUser(u);
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
