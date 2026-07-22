import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach JWT to every request if present
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auth ──────────────────────────────────────────────────────────────────

export interface AuthUser { id: number; username: string }

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}

export interface CardStat {
  card_id: string;
  runs_with_card: number;
  runs_won_with_card: number;
  win_rate: number;
  weighted_win_rate?: number;
}

export interface RunRow {
  id: number;
  file_path: string;
  character: string;
  win: number;
  ascension: number;
  game_mode: string;
  acts: string;
  build_id: string | null;
  floor_reached: number;
  killed_by: string | null;
  start_time: number | null;
  parsed_at: string;
}


export async function fetchCardStats(filters: {
  character?: string;
  ascension?: number;
  gameMode?: string;
  buildId?: string;
  colorless?: boolean;
  weighted?: boolean;
  scope?: 'global' | 'mine';
} = {}): Promise<CardStat[]> {
  const params = new URLSearchParams();
  if (filters.character) params.set('character', filters.character);
  if (filters.ascension !== undefined) params.set('ascension', String(filters.ascension));
  if (filters.gameMode) params.set('gameMode', filters.gameMode);
  if (filters.buildId) params.set('buildId', filters.buildId);
  if (filters.colorless) params.set('colorless', 'true');
  if (filters.weighted) params.set('weighted', 'true');
  if (filters.scope) params.set('scope', filters.scope);
  const { data } = await api.get<CardStat[]>(`/stats/cards?${params}`);
  return data;
}

export async function fetchCharacters(): Promise<string[]> {
  const { data } = await api.get<string[]>('/stats/characters');
  return data;
}

export async function fetchBuilds(): Promise<string[]> {
  const { data } = await api.get<string[]>('/stats/builds');
  return data;
}

export interface CommunityCard {
  id: string;
  name: string;
  pickRate: number;
  winRateDelta: number;
  timesPicked: number;
  powerScore: number;
  powerTier: string;
  eloRating: number;
}

export async function fetchCommunityCards(): Promise<CommunityCard[]> {
  const { data } = await api.get<CommunityCard[]>('/stats/community-cards');
  return data;
}

export interface CardText {
  id: string;
  key: string;
  name: string;
  description: string;
  description_raw: string;
  upgrade_description: string;
  cost: string;
  type: string;
  rarity: string;
  color: string;
  keywords: string[];
  image_url: string;
}

export async function fetchCardText(): Promise<CardText[]> {
  const { data } = await api.get<CardText[]>('/stats/card-text');
  return data;
}

export async function fetchRelics(): Promise<string[]> {
  const { data } = await api.get<string[]>('/stats/relics');
  return data;
}

export async function fetchRuns(filters: {
  character?: string;
  buildId?: string;
  limit?: number;
  offset?: number;
  scope?: 'global' | 'mine';
} = {}): Promise<{ runs: RunRow[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.character) params.set('character', filters.character);
  if (filters.buildId) params.set('buildId', filters.buildId);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  if (filters.scope) params.set('scope', filters.scope);
  const { data } = await api.get<{ runs: RunRow[]; total: number }>(`/runs?${params}`);
  return data;
}

export interface ActStats {
  act: string;
  floors: number;
  damage: number;
  elite_count: number;
  elite_damage: number;
  rest_count: number;
}

export interface RunDetails {
  win: boolean;
  character: string;
  ascension: number;
  floor_reached: number;
  killed_by: string | null;
  total_damage_taken: number;
  damage_per_act: { act: string; damage: number }[];
  act_stats: ActStats[];
  card_offers: number;
  cards_picked: number;
  final_deck_size: number;
  final_deck: { id: string; upgraded: boolean }[];
  relics: string[];
  acts: string[];
  build_id: string | null;
  insights: string[];
}

export interface AncientStat {
  event_name: string;
  is_neow: number;
  relic_id: string;
  times_picked: number;
  wins: number;
  win_rate: number;
}

export async function fetchAncients(filters: {
  character?: string;
  buildId?: string;
  scope?: 'global' | 'mine';
} = {}): Promise<AncientStat[]> {
  const params = new URLSearchParams();
  if (filters.character) params.set('character', filters.character);
  if (filters.buildId) params.set('buildId', filters.buildId);
  if (filters.scope) params.set('scope', filters.scope);
  const { data } = await api.get<AncientStat[]>(`/ancients?${params}`);
  return data;
}

export interface SynergyPair {
  card_a: string;
  card_b: string;
  runs_together: number;
  wins_together: number;
  win_rate_together: number;
  win_rate_a: number;
  win_rate_b: number;
  synergy_lift: number;
}

export async function fetchSynergies(filters: {
  character?: string;
  buildId?: string;
  minRuns?: number;
  scope?: 'global' | 'mine';
} = {}): Promise<SynergyPair[]> {
  const params = new URLSearchParams();
  if (filters.character) params.set('character', filters.character);
  if (filters.buildId) params.set('buildId', filters.buildId);
  if (filters.minRuns !== undefined) params.set('minRuns', String(filters.minRuns));
  if (filters.scope) params.set('scope', filters.scope);
  const { data } = await api.get<SynergyPair[]>(`/synergies?${params}`);
  return data;
}

export async function fetchRunDetails(id: number): Promise<RunDetails> {
  const { data } = await api.get<RunDetails>(`/runs/${id}/details`);
  return data;
}

export async function uploadRuns(
  files: Array<{ filename: string; content: string }>
): Promise<{ added: number; skipped: number; errors: string[] }> {
  const { data } = await api.post('/upload/runs', files);
  return data;
}

export async function pushCurrentRun(text: string): Promise<void> {
  await api.post('/current-run/push', { text });
}

export interface ScoreFactors {
  strength: number;
  synergy: number;
  deck_needs: number;
  act_context: number;
  rarity: number;
}

export interface CardScore {
  card_id: string;
  name: string;
  score: number;
  factors: ScoreFactors;
  reasons: string[];
  recommendation: 'strong' | 'consider' | 'skip';
}

export async function fetchRecommendations(payload: {
  deck: string[];
  offered: string[];
  offeredUpgrades?: boolean[];
  deckUpgrades?: string[];
  character: string;
  floor: number;
  relics?: string[];
  currentBoss?: string | null;
}): Promise<CardScore[]> {
  const { data } = await api.post<CardScore[]>('/recommend', payload);
  return data;
}

export interface CurrentRun {
  character: string | null;
  floor: number;
  deck: string[];
  relics: string[];
  upgrades: string[];
  actIndex: number;
  currentBoss: string | null;
}

export async function fetchCurrentRun(): Promise<CurrentRun> {
  const { data } = await api.get<CurrentRun>('/current-run');
  return data;
}
