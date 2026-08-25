import type { FaceitDataClient, FaceitHistoryItem, FaceitMatchResult, FaceitMatchSource, FaceitPersistentState, FaceitPhase, FaceitPlacementState, FaceitPlayer, FaceitStateStore } from "./types.ts";
import type { FaceitPhaseProvider } from "./phase.ts";

type Sleep = (milliseconds: number) => Promise<void>;
const defaultSleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
export interface RealFaceitSourceOptions { client: FaceitDataClient; nickname: string; stateStore?: FaceitStateStore; phaseProvider?: FaceitPhaseProvider; eloRetryAttempts?: number; eloRetryDelayMs?: number; sleep?: Sleep; log?: (message: string) => void; }

export class RealFaceitSource implements FaceitMatchSource {
  private readonly client: FaceitDataClient; private readonly nickname: string;
  private readonly stateStore: FaceitStateStore | undefined; private readonly eloRetryAttempts: number;
  private readonly eloRetryDelayMs: number; private readonly sleep: Sleep; private readonly log: (message: string) => void;
  private playerId: string | undefined; private lastSeenMatchId: string | undefined;
  private lastKnownElo: number | undefined; private lastKnownLevel: number | undefined;
  private processedMatchIds: string[] = []; private stateLoaded = false;
  private readonly phaseProvider: FaceitPhaseProvider | undefined;
  private phase: FaceitPhase = "ranked"; private placement: FaceitPlacementState | null = null;

  constructor(options: RealFaceitSourceOptions) {
    this.client = options.client; this.nickname = options.nickname; this.stateStore = options.stateStore; this.phaseProvider = options.phaseProvider;
    this.eloRetryAttempts = options.eloRetryAttempts ?? 3; this.eloRetryDelayMs = options.eloRetryDelayMs ?? 2_000;
    this.sleep = options.sleep ?? defaultSleep; this.log = options.log ?? ((message) => console.log(`[FACEIT] ${message}`));
  }

  async latestResult(): Promise<FaceitMatchResult | null> {
    let player: FaceitPlayer | undefined;
    if (!this.stateLoaded) {
      player = await this.getPlayer(); this.rememberPlayer(player); await this.loadState(player);
    }
    if (!this.playerId) throw new Error("FACEIT player is not initialized");
    this.log("Polling match history");
    const history = await this.client.getMatchHistory(this.playerId, 50); const latest = history.items[0];
    if (!latest) { this.log("No completed match found"); return null; }
    const observation = this.phaseProvider?.current();
    if (observation?.phase === "placement" && this.phase !== "placement") {
      this.phase = "placement"; this.placement = observation.placement ?? { played: 0, wins: 0, losses: 0, total: 10 };
      this.lastKnownElo = undefined; this.log("Placement phase entered; ranked ELO baseline invalidated");
      if (latest.match_id === this.lastSeenMatchId) { await this.persistCurrent(latest.match_id, null); return null; }
    } else if (observation?.phase === "ranked" && this.phase === "placement") {
      player ??= await this.getPlayer(); this.rememberPlayer(player); const placedElo = this.cs2Elo(player);
      this.phase = "ranked"; this.placement = null; await this.persistBaseline(player, latest, placedElo);
      this.log(`Placement complete; ranked baseline: ${placedElo}`);
      return { matchId: `placement-complete-${latest.match_id}`, won: true, eloBefore: placedElo, eloAfter: placedElo,
        eloDelta: null, finishedAt: new Date().toISOString(), phase: "ranked", placementCompleted: true };
    }
    if (this.lastSeenMatchId === undefined) {
      if (this.phase === "placement") { this.log("Creating placement baseline"); await this.persistCurrent(latest.match_id, null); return null; }
      player ??= await this.getPlayer(); this.rememberPlayer(player); const elo = this.cs2Elo(player);
      this.log("Creating baseline"); await this.persistBaseline(player, latest, elo);
      this.log(`ELO: ${elo}`); this.log(`Latest match: ${latest.match_id}`); return null;
    }
    if (latest.match_id === this.lastSeenMatchId || this.processedMatchIds.includes(latest.match_id)) {
      this.log("Latest match already processed"); return null;
    }
    if (this.phase === "placement") {
      const won = this.didPlayerWin(latest, this.playerId); const current = this.placement ?? { played: 0, wins: 0, losses: 0, total: 10 };
      this.placement = { played: Math.min(current.total, current.played + 1), wins: current.wins + (won ? 1 : 0), losses: current.losses + (won ? 0 : 1), total: current.total };
      await this.persistCurrent(latest.match_id, null);
      return { matchId: latest.match_id, won, eloBefore: 0, eloAfter: null, eloDelta: null,
        finishedAt: new Date(latest.finished_at * 1000).toISOString(), phase: "placement", placement: this.placement };
    }
    player ??= await this.getPlayer(); this.rememberPlayer(player); const elo = this.cs2Elo(player);
    const previousIndex = history.items.findIndex((item) => item.match_id === this.lastSeenMatchId);
    if (this.stateStore && previousIndex !== 1) {
      this.log("Multiple unseen matches detected"); this.log("Individual ELO deltas cannot be reconstructed reliably");
      if (this.lastKnownElo !== undefined) { const net = elo - this.lastKnownElo; this.log(`Net ELO change: ${net >= 0 ? "+" : ""}${net}`); }
      this.log(`Re-baselining at ${elo} ELO`); await this.persistBaseline(player, latest, elo); return null;
    }
    const won = this.didPlayerWin(latest, player.player_id); this.log(`New match detected: ${latest.match_id}`); this.log(`Result: ${won ? "WIN" : "LOSS"}`);
    const eloBefore = this.lastKnownElo; let eloAfter: number | null = elo;
    if (eloBefore !== undefined && eloAfter === eloBefore) eloAfter = await this.waitForEloChange(player.player_id, eloBefore);
    const eloDelta = eloBefore === undefined || eloAfter === null ? null : eloAfter - eloBefore;
    if (eloDelta === null) this.log("Match result known but ELO delta cannot be reconstructed safely");
    else this.log(`ELO: ${eloBefore} -> ${eloAfter} (${eloDelta >= 0 ? "+" : ""}${eloDelta})`);
    await this.persist({ playerId: player.player_id, nickname: player.nickname, lastSeenMatchId: latest.match_id,
      lastKnownElo: eloAfter ?? elo, processedMatchIds: [...this.processedMatchIds, latest.match_id].slice(-30), updatedAt: new Date().toISOString(),
      phase: "ranked", placement: null, stateVersion: 2 });
    return { matchId: latest.match_id, won, eloBefore: eloBefore ?? elo, eloAfter, eloDelta, finishedAt: new Date(latest.finished_at * 1000).toISOString() };
  }

  getCurrentLevel(): number | undefined { return this.lastKnownLevel; }
  getCurrentElo(): number | undefined { return this.lastKnownElo; }
  getCurrentPhase(): FaceitPhase { return this.phase; }
  getPlacement(): FaceitPlacementState | null { return this.placement; }

  private async loadState(player: FaceitPlayer): Promise<void> {
    if (this.stateLoaded) return; this.stateLoaded = true; const state = await this.stateStore?.load();
    if (!state || state.playerId !== player.player_id || state.nickname.toLowerCase() !== player.nickname.toLowerCase()) return;
    this.lastSeenMatchId = state.lastSeenMatchId; this.lastKnownElo = state.lastKnownElo ?? undefined;
    this.processedMatchIds = state.processedMatchIds.slice(-30); this.log("Persistent state loaded");
    this.phase = state.phase ?? "ranked"; this.placement = state.placement ?? null;
    this.log(`Previous ELO: ${state.lastKnownElo ?? "unknown"}`); this.log(`Previous match: ${state.lastSeenMatchId}`);
  }
  private async persistBaseline(player: FaceitPlayer, latest: FaceitHistoryItem, elo: number): Promise<void> {
    await this.persist({ playerId: player.player_id, nickname: player.nickname, lastSeenMatchId: latest.match_id,
      lastKnownElo: elo, processedMatchIds: [latest.match_id], updatedAt: new Date().toISOString(), phase: this.phase, placement: this.placement, stateVersion: 2 });
  }
  private async persistCurrent(matchId: string, elo: number | null): Promise<void> {
    if (!this.playerId) throw new Error("FACEIT player is not initialized");
    await this.persist({ playerId: this.playerId, nickname: this.nickname, lastSeenMatchId: matchId, lastKnownElo: elo,
      processedMatchIds: [...this.processedMatchIds, matchId].slice(-30), updatedAt: new Date().toISOString(),
      phase: this.phase, placement: this.placement, stateVersion: 2 });
  }
  private async persist(state: FaceitPersistentState): Promise<void> {
    this.playerId = state.playerId; this.lastSeenMatchId = state.lastSeenMatchId; this.lastKnownElo = state.lastKnownElo ?? undefined; this.processedMatchIds = state.processedMatchIds;
    if (this.stateStore) { await this.stateStore.save(state); this.log("State persisted"); }
  }
  private async getPlayer(): Promise<FaceitPlayer> {
    if (!this.playerId) { this.log(`Resolving player: ${this.nickname}`); const player = await this.client.getPlayerByNickname(this.nickname);
      this.playerId = player.player_id; this.log(`Player resolved: ${this.playerId}`); return player; }
    return this.client.getPlayerById(this.playerId);
  }
  private cs2Elo(player: FaceitPlayer): number {
    const elo = player.games.cs2?.faceit_elo; if (!Number.isInteger(elo)) throw new Error(`FACEIT player ${player.nickname} has no CS2 ELO`); return elo!;
  }
  private didPlayerWin(match: FaceitHistoryItem, playerId: string): boolean {
    const faction = Object.entries(match.teams).find(([, team]) => team.players.some((p) => p.player_id === playerId))?.[0];
    if (!faction) throw new Error(`FACEIT player ${playerId} is not present in match ${match.match_id}`); return match.results.winner === faction;
  }
  private async waitForEloChange(playerId: string, eloBefore: number): Promise<number | null> {
    for (let attempt = 1; attempt <= this.eloRetryAttempts; attempt++) {
      this.log(`Waiting for ELO update (${attempt}/${this.eloRetryAttempts})`); await this.sleep(this.eloRetryDelayMs);
      const refreshed = await this.client.getPlayerById(playerId); this.rememberPlayer(refreshed); const elo = this.cs2Elo(refreshed); if (elo !== eloBefore) return elo;
    } return null;
  }
  private rememberPlayer(player: FaceitPlayer): void { const level = player.games.cs2?.skill_level; if (Number.isInteger(level)) this.lastKnownLevel = level; }
}
