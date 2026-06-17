import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export interface CardStat {
  card_id: string;
  times_offered: number;
  times_picked: number;
  pick_rate: number;
  runs_with_card: number;
  runs_won_with_card: number;
  win_rate: number;
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
  parsed_at: string;
}

export interface AppConfig {
  savesPath?: string;
  resolvedSavesPath: string;
}

export async function fetchCardStats(filters: {
  character?: string;
  ascension?: number;
  gameMode?: string;
  buildId?: string;
  colorless?: boolean;
} = {}): Promise<CardStat[]> {
  const params = new URLSearchParams();
  if (filters.character) params.set('character', filters.character);
  if (filters.ascension !== undefined) params.set('ascension', String(filters.ascension));
  if (filters.gameMode) params.set('gameMode', filters.gameMode);
  if (filters.buildId) params.set('buildId', filters.buildId);
  if (filters.colorless) params.set('colorless', 'true');
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

export async function fetchRuns(filters: {
  character?: string;
  buildId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ runs: RunRow[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.character) params.set('character', filters.character);
  if (filters.buildId) params.set('buildId', filters.buildId);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
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
  final_deck: string[];
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
} = {}): Promise<AncientStat[]> {
  const params = new URLSearchParams();
  if (filters.character) params.set('character', filters.character);
  if (filters.buildId) params.set('buildId', filters.buildId);
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
} = {}): Promise<SynergyPair[]> {
  const params = new URLSearchParams();
  if (filters.character) params.set('character', filters.character);
  if (filters.buildId) params.set('buildId', filters.buildId);
  if (filters.minRuns !== undefined) params.set('minRuns', String(filters.minRuns));
  const { data } = await api.get<SynergyPair[]>(`/synergies?${params}`);
  return data;
}

export async function fetchRunDetails(id: number): Promise<RunDetails> {
  const { data } = await api.get<RunDetails>(`/runs/${id}/details`);
  return data;
}

export async function fetchAiInsight(id: number, model = 'llama3'): Promise<string> {
  const { data } = await api.post<{ insight: string }>(`/runs/${id}/ai-insight`, { model });
  return data.insight;
}

export async function fetchConfig(): Promise<AppConfig> {
  const { data } = await api.get<AppConfig>('/config');
  return data;
}

export async function saveConfig(savesPath: string): Promise<AppConfig> {
  const { data } = await api.post<AppConfig>('/config', { savesPath });
  return data;
}
