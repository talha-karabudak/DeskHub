import assert from "node:assert/strict";
import test from "node:test";
import { FaceitIntegration } from "../src/integrations/faceit/faceit-integration.ts";
import { RealFaceitSource } from "../src/integrations/faceit/source.ts";
import type { DeskHubEvent } from "../src/core/types.ts";
import type { FaceitDataClient, FaceitPersistentState, FaceitStateStore } from "../src/integrations/faceit/types.ts";

const baseline: FaceitPersistentState = { playerId: "p1", nickname: "tester", lastSeenMatchId: "A",
  lastKnownElo: 887, processedMatchIds: ["A"], updatedAt: "2026-09-01T00:00:00Z" };
class Store implements FaceitStateStore {
  state = structuredClone(baseline);
  failSave = false;
  async load() { return structuredClone(this.state); }
  async save(state: FaceitPersistentState) {
    if (this.failSave) throw new Error("disk unavailable");
    this.state = structuredClone(state);
  }
}
function client(elo = 912): FaceitDataClient {
  const player = { player_id: "p1", nickname: "tester", games: { cs2: { skill_level: 3, faceit_elo: elo } } };
  return { async getPlayerByNickname() { return player; }, async getPlayerById() { return player; },
    async getMatchHistory() { return { items: ["B", "A"].map((id) => ({ match_id: id, finished_at: 1_777_000_000,
      teams: { home: { players: [{ player_id: "p1" }] } }, results: { winner: "home" } })) }; },
    async getMatch() { throw new Error("unused"); } };
}
function source(store: Store, elo = 912) {
  return new RealFaceitSource({ client: client(elo), nickname: "tester", stateStore: store, log() {} });
}

test("startup A/887 -> B/912 delivers before committing processed B", async () => {
  const store = new Store();
  let deliveries = 0;
  const integration = new FaceitIntegration(source(store), { async deliver(events) {
    deliveries++;
    assert.equal(store.state.lastSeenMatchId, "A");
    assert.equal(store.state.lastKnownElo, 887);
    assert.deepEqual(store.state.processedMatchIds, ["A"]);
    assert.equal(store.state.pendingDelivery?.result.eloDelta, 25);
    assert.deepEqual(events.map((event) => event.id), ["faceit:B:0", "faceit:B:1"]);
    return true;
  } });
  assert.equal(await integration.pollOnce(), true);
  assert.equal(deliveries, 1);
  assert.equal(store.state.lastSeenMatchId, "B");
  assert.equal(store.state.lastKnownElo, 912);
  assert.equal(store.state.pendingDelivery, undefined);
  assert.equal(await integration.pollOnce(), false);
  assert.equal(deliveries, 1);
});

test("deferred or throwing delivery retains exact result and permits retry", async () => {
  for (const fail of ["defer", "throw"]) {
    const store = new Store(); let attempts = 0;
    const integration = new FaceitIntegration(source(store), { async deliver() {
      attempts++;
      if (attempts === 1) {
        if (fail === "throw") throw new Error("bridge unavailable");
        return false;
      }
      return true;
    } });
    if (fail === "throw") await assert.rejects(integration.pollOnce(), /bridge unavailable/);
    else assert.equal(await integration.pollOnce(), false);
    assert.equal(store.state.lastSeenMatchId, "A");
    assert.equal(store.state.pendingDelivery?.result.eloDelta, 25);
    assert.equal(await integration.pollOnce(), true);
    assert.equal(attempts, 2);
    assert.equal(store.state.lastSeenMatchId, "B");
  }
});

test("restart replays pending B with original delta, then suppresses acknowledged duplicate", async () => {
  const store = new Store();
  await new FaceitIntegration(source(store), { async deliver() { return false; } }).pollOnce();
  let deliveries = 0;
  const restarted = source(store, 950);
  assert.equal((await restarted.latestResult())?.eloDelta, 25);
  assert.equal(await new FaceitIntegration(restarted, { async deliver() { deliveries++; return true; } }).pollOnce(), true);
  assert.equal(store.state.lastKnownElo, 912);
  assert.equal(await new FaceitIntegration(source(store, 950), { async deliver() { deliveries++; return true; } }).pollOnce(), false);
  assert.equal(deliveries, 1);
});

test("failed outbox save never reaches display or advances in-memory baseline", async () => {
  const store = new Store(); store.failSave = true; let deliveries = 0;
  const integration = new FaceitIntegration(source(store), { async deliver() { deliveries++; return true; } });
  await assert.rejects(integration.pollOnce(), /disk unavailable/);
  assert.equal(deliveries, 0); assert.equal(store.state.lastSeenMatchId, "A");
  store.failSave = false;
  assert.equal(await integration.pollOnce(), true);
  assert.equal(deliveries, 1); assert.equal(store.state.lastKnownElo, 912);
});

test("failed acknowledgment retries commit without redisplaying completed deterministic IDs", async () => {
  const store = new Store(); const completed = new Set<string>(); let writes = 0;
  const sink = { async deliver(events: DeskHubEvent[]) {
    for (const event of events) if (!completed.has(event.id)) { writes++; completed.add(event.id); }
    return true;
  } };
  const value = source(store);
  await value.latestResult();
  store.failSave = true;
  const integration = new FaceitIntegration(value, sink);
  await assert.rejects(integration.pollOnce(), /disk unavailable/);
  assert.equal(store.state.lastSeenMatchId, "A"); assert.equal(value.getCurrentElo(), 887);
  assert.equal(writes, 2);
  store.failSave = false;
  assert.equal(await integration.pollOnce(), true);
  assert.equal(writes, 2); assert.equal(store.state.lastSeenMatchId, "B");
});

test("placement delivery retry does not count the same match twice", async () => {
  const store = new Store();
  store.state = { ...baseline, lastKnownElo: null, phase: "placement", placement: { played: 3, wins: 2, losses: 1, total: 10 } };
  const value = source(store);
  assert.equal((await value.latestResult())?.placement?.played, 4);
  assert.equal((await value.latestResult())?.placement?.played, 4);
  assert.equal((await source(store).latestResult())?.placement?.played, 4);
  await value.acknowledge("B");
  assert.equal(store.state.placement?.played, 4);
});
