export interface FaceitMatchResult {
  matchId: string;
  won: boolean;
  eloBefore: number;
  eloAfter: number | null;
  eloDelta: number | null;
  finishedAt: string;
}

export interface FaceitMatchSource {
  latestResult(): Promise<FaceitMatchResult | null>;
}

export interface FaceitPlayer {
  player_id: string;
  nickname: string;
  games: {
    cs2?: {
      skill_level: number;
      faceit_elo: number;
    };
  };
}

export interface FaceitHistoryTeam {
  players: Array<{ player_id: string; nickname?: string }>;
}

export interface FaceitHistoryItem {
  match_id: string;
  finished_at: number;
  competition_name?: string;
  teams: Record<string, FaceitHistoryTeam>;
  results: { winner: string };
}

export interface FaceitHistoryResponse {
  items: FaceitHistoryItem[];
}

export interface FaceitDataClient {
  getPlayerByNickname(nickname: string): Promise<FaceitPlayer>;
  getPlayerById(playerId: string): Promise<FaceitPlayer>;
  getMatchHistory(playerId: string, limit?: number): Promise<FaceitHistoryResponse>;
  getMatch(matchId: string): Promise<FaceitHistoryItem>;
}

export interface FaceitPersistentState {
  playerId: string;
  nickname: string;
  lastSeenMatchId: string;
  lastKnownElo: number | null;
  processedMatchIds: string[];
  updatedAt: string;
}

export interface FaceitStateStore {
  load(): Promise<FaceitPersistentState | null>;
  save(state: FaceitPersistentState): Promise<void>;
}
