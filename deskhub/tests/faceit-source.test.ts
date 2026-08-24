import assert from "node:assert/strict";
import test from "node:test";
import { RealFaceitSource } from "../src/integrations/faceit/source.ts";
import type { FaceitDataClient, FaceitHistoryItem, FaceitHistoryResponse, FaceitPersistentState, FaceitPlayer, FaceitStateStore } from "../src/integrations/faceit/types.ts";

function player(elo: number): FaceitPlayer { return { player_id: "p1", nickname: "tester", games: { cs2: { skill_level: 8, faceit_elo: elo } } }; }
function match(id: string, won: boolean): FaceitHistoryItem {
  return { match_id: id, finished_at: 1_777_000_000, results: { winner: won ? "faction1" : "faction2" },
    teams: { faction1: { players: [{ player_id: "p1" }] }, faction2: { players: [{ player_id: "p2" }] } } };
}
class FakeClient implements FaceitDataClient {
  players: FaceitPlayer[];
  histories: FaceitHistoryResponse[];
  constructor(elos: number[], matches: FaceitHistoryItem[]) { this.players = elos.map(player); this.histories = matches.map((item) => ({ items: [item] })); }
  async getPlayerByNickname(): Promise<FaceitPlayer> { return this.nextPlayer(); }
  async getPlayerById(): Promise<FaceitPlayer> { return this.nextPlayer(); }
  async getMatchHistory(): Promise<FaceitHistoryResponse> { return this.histories.shift() ?? { items: [] }; }
  async getMatch(): Promise<FaceitHistoryItem> { throw new Error("unused"); }
  private nextPlayer(): FaceitPlayer { const value = this.players.shift(); if (!value) throw new Error("fake player sequence exhausted"); return value; }
}
function source(client: FaceitDataClient): RealFaceitSource { return new RealFaceitSource({ client, nickname: "tester", sleep: async () => {}, log: () => {} }); }

class MemoryStore implements FaceitStateStore {
  state: FaceitPersistentState | null;
  saves = 0;
  constructor(state: FaceitPersistentState | null = null) { this.state = state; }
  async load(): Promise<FaceitPersistentState | null> { return this.state; }
  async save(state: FaceitPersistentState): Promise<void> { this.state = structuredClone(state); this.saves++; }
}
function stored(elo: number | null, matchId: string): FaceitPersistentState {
  return { playerId: "p1", nickname: "tester", lastSeenMatchId: matchId, lastKnownElo: elo,
    processedMatchIds: [matchId], updatedAt: "2026-08-23T00:00:00Z" };
}

test("first poll establishes baseline without replaying a match", async () => {
  assert.equal(await source(new FakeClient([1620], [match("old", true)])).latestResult(), null);
});
test("new win produces positive ELO delta", async () => {
  const value = source(new FakeClient([1620, 1644], [match("old", true), match("new", true)]));
  assert.equal(await value.latestResult(), null);
  assert.deepEqual(await value.latestResult(), { matchId: "new", won: true, eloBefore: 1620, eloAfter: 1644, eloDelta: 24, finishedAt: new Date(1_777_000_000_000).toISOString() });
});
test("new loss produces negative ELO delta", async () => {
  const value = source(new FakeClient([1644, 1622], [match("old", true), match("new", false)])); await value.latestResult(); const result = await value.latestResult();
  assert.equal(result?.won, false); assert.equal(result?.eloDelta, -22);
});
test("duplicate and no-new-match polls do not emit again", async () => {
  const value = source(new FakeClient([1620, 1644, 1644], [match("old", true), match("new", true), match("new", true)]));
  await value.latestResult(); assert.ok(await value.latestResult()); assert.equal(await value.latestResult(), null);
});
test("eventual-consistency retry waits for changed ELO", async () => {
  const client = new FakeClient([1620, 1620, 1620, 1644], [match("old", true), match("new", true)]); const value = source(client);
  await value.latestResult(); assert.equal((await value.latestResult())?.eloDelta, 24); assert.equal(client.players.length, 0);
});
test("unchanged ELO after bounded retries emits result without delta", async () => {
  const value = source(new FakeClient([1620, 1620, 1620, 1620, 1620], [match("old", true), match("new", true)]));
  await value.latestResult(); const result = await value.latestResult(); assert.equal(result?.won, true); assert.equal(result?.eloAfter, null); assert.equal(result?.eloDelta, null);
});

test("missing persistent state writes baseline without event", async () => {
  const store = new MemoryStore();
  const value = new RealFaceitSource({ client: new FakeClient([887], [match("A", true)]), nickname: "tester", stateStore: store, log: () => {} });
  assert.equal(await value.latestResult(), null);
  assert.equal(store.state?.lastSeenMatchId, "A"); assert.equal(store.state?.lastKnownElo, 887); assert.equal(store.saves, 1);
});

test("restart detects one new win and persists real delta", async () => {
  const store = new MemoryStore(stored(887, "A"));
  const client = new FakeClient([912], [match("B", true)]);
  client.histories = [{ items: [match("B", true), match("A", true)] }];
  const result = await new RealFaceitSource({ client, nickname: "tester", stateStore: store, log: () => {} }).latestResult();
  assert.equal(result?.eloDelta, 25); assert.equal(store.state?.lastSeenMatchId, "B"); assert.equal(store.state?.lastKnownElo, 912);
});

test("restart with same match emits nothing", async () => {
  const store = new MemoryStore(stored(912, "B"));
  const result = await new RealFaceitSource({ client: new FakeClient([912], [match("B", true)]), nickname: "tester", stateStore: store, log: () => {} }).latestResult();
  assert.equal(result, null); assert.equal(store.saves, 0);
});

test("restart loss computes negative delta", async () => {
  const store = new MemoryStore(stored(912, "B")); const client = new FakeClient([890], []);
  client.histories = [{ items: [match("C", false), match("B", true)] }];
  const result = await new RealFaceitSource({ client, nickname: "tester", stateStore: store, log: () => {} }).latestResult();
  assert.equal(result?.won, false); assert.equal(result?.eloDelta, -22);
});

test("multiple unseen matches re-baseline without invented delta", async () => {
  const store = new MemoryStore(stored(887, "A")); const client = new FakeClient([890], []);
  client.histories = [{ items: [match("C", false), match("B", true), match("A", true)] }];
  const result = await new RealFaceitSource({ client, nickname: "tester", stateStore: store, log: () => {} }).latestResult();
  assert.equal(result, null); assert.equal(store.state?.lastSeenMatchId, "C"); assert.equal(store.state?.lastKnownElo, 890);
});
