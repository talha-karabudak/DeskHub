import assert from "node:assert/strict";
import test from "node:test";
import { RaceStateProjector } from "../src/integrations/iracing/race-state-projector.ts";
import type { IRacingTelemetry } from "../src/integrations/iracing/types.ts";

const active = { connected: true, sessionActive: true, sessionId: "race-1" } as const;

test("initial state uses null for unknown values", () => {
  const state = new RaceStateProjector().getState();
  assert.deepEqual(state, {
    connection: { connected: false, sessionActive: false, sessionId: null },
    position: { current: null, start: null, gainLoss: null },
    laps: { current: null, remaining: null, last: null, best: null, recent: [] },
    fuel: { remaining: null, averagePerLap: null, estimatedLaps: null, estimatedAtFinish: null },
  });
});

test("connected, disconnected, and inactive snapshots cannot expose stale race state", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, position: 6, lap: 3, fuelLevel: 20 });
  assert.equal(projector.getState().connection.connected, true);
  projector.update({ connected: true, sessionActive: false, sessionId: "race-1" });
  assert.deepEqual(projector.getState().position, { current: null, start: null, gainLoss: null });
  projector.update({ connected: false });
  const state = projector.getState();
  assert.deepEqual(state.connection, { connected: false, sessionActive: false, sessionId: null });
  assert.equal(state.laps.current, null);
  assert.equal(state.fuel.remaining, null);
});

test("session change resets session state, start position, and fuel history", () => {
  const projector = new RaceStateProjector();
  for (const snapshot of fuelSequence("race-1")) projector.update(snapshot);
  assert.notEqual(projector.getState().fuel.averagePerLap, null);
  projector.update({ ...active, sessionId: "race-2", position: 9, lap: 0, fuelLevel: 50 });
  const state = projector.getState();
  assert.equal(state.position.start, 9);
  assert.equal(state.position.gainLoss, 0);
  assert.deepEqual(state.laps.recent, []);
  assert.equal(state.fuel.averagePerLap, null);
});

test("first reliable position is retained and gain/loss follows current position", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active });
  projector.update({ ...active, position: 8 });
  projector.update({ ...active, position: 5 });
  assert.deepEqual(projector.getState().position, { current: 5, start: 8, gainLoss: 3 });
});

test("current, last, and best laps come from valid telemetry", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, lap: 4, lapCompleted: 3, lapsRemaining: 7.5,
    lapLastLapTime: 91.2, lapBestLapTime: 90.8 });
  assert.deepEqual(projector.getState().laps, {
    current: 4, remaining: 7.5, last: 91.2, best: 90.8, recent: [],
  });
});

test("remaining laps hides the official unlimited sentinel", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, lapsRemaining: 32767 });
  assert.equal(projector.getState().laps.remaining, null);
});

test("remaining laps preserves normal finite values and zero", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, lapsRemaining: 12.5 });
  assert.equal(projector.getState().laps.remaining, 12.5);
  projector.update({ ...active, lapsRemaining: 0 });
  assert.equal(projector.getState().laps.remaining, 0);
});

test("remaining laps rejects negative and non-finite values", () => {
  const projector = new RaceStateProjector();
  for (const lapsRemaining of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    projector.update({ ...active, lapsRemaining });
    assert.equal(projector.getState().laps.remaining, null);
  }
});

test("completed laps are unique, capped at five, and recompute delta to current best", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, lapCompleted: 0, lapBestLapTime: 100 });
  for (let lap = 1; lap <= 6; lap += 1) {
    projector.update({ ...active, lapCompleted: lap, lapLastLapTime: 100 + lap, lapBestLapTime: 100 });
    projector.update({ ...active, lapCompleted: lap, lapLastLapTime: 100 + lap, lapBestLapTime: 100 });
  }
  projector.update({ ...active, lapCompleted: 6, lapLastLapTime: 106, lapBestLapTime: 99 });
  const recent = projector.getState().laps.recent;
  assert.deepEqual(recent.map((lap) => lap.lapNumber), [2, 3, 4, 5, 6]);
  assert.deepEqual(recent.map((lap) => lap.deltaToBest), [3, 4, 5, 6, 7]);
});

test("incident baseline produces zero for a clean completed lap", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, lapCompleted: 0, incidentCount: 3 });
  projector.update({ ...active, lapCompleted: 1, lapLastLapTime: 90, incidentCount: 3 });
  assert.equal(projector.getState().laps.recent[0]?.incidentDelta, 0);
});

test("incidents accumulated within a lap are stored on that completed lap", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, lapCompleted: 0, incidentCount: 2 });
  projector.update({ ...active, lapCompleted: 0, incidentCount: 3 });
  projector.update({ ...active, lapCompleted: 1, lapLastLapTime: 91, incidentCount: 4 });
  assert.equal(projector.getState().laps.recent[0]?.incidentDelta, 2);
});

test("incident baseline advances at every lap boundary", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, lapCompleted: 0, incidentCount: 0 });
  projector.update({ ...active, lapCompleted: 1, lapLastLapTime: 91, incidentCount: 2 });
  projector.update({ ...active, lapCompleted: 2, lapLastLapTime: 90, incidentCount: 3 });
  assert.deepEqual(projector.getState().laps.recent.map((lap) => lap.incidentDelta), [2, 1]);
});

test("session reset clears incident baseline and history", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, lapCompleted: 0, incidentCount: 0 });
  projector.update({ ...active, lapCompleted: 1, lapLastLapTime: 91, incidentCount: 2 });
  projector.update({ ...active, sessionId: "race-2", lapCompleted: 0, incidentCount: 7 });
  projector.update({ ...active, sessionId: "race-2", lapCompleted: 1, lapLastLapTime: 92, incidentCount: 7 });
  assert.deepEqual(projector.getState().laps.recent.map((lap) => lap.incidentDelta), [0]);
});

test("duplicate completed lap does not duplicate or change incident delta", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, lapCompleted: 0, incidentCount: 0 });
  projector.update({ ...active, lapCompleted: 1, lapLastLapTime: 91, incidentCount: 1 });
  projector.update({ ...active, lapCompleted: 1, lapLastLapTime: 91, incidentCount: 3 });
  assert.deepEqual(projector.getState().laps.recent.map((lap) => lap.incidentDelta), [1]);
});

test("fuel estimates stay null until two valid consumptions exist", () => {
  const projector = new RaceStateProjector();
  projector.update({ ...active, lapCompleted: 0, lapsRemaining: 9, fuelLevel: 40 });
  projector.update({ ...active, lapCompleted: 1, lapsRemaining: 8, fuelLevel: 38 });
  projector.update({ ...active, lapCompleted: 2, lapsRemaining: 7, fuelLevel: 36 });
  assert.deepEqual(projector.getState().fuel, {
    remaining: 36, averagePerLap: null, estimatedLaps: null, estimatedAtFinish: null,
  });
});

test("fuel model excludes refuels and calculates median-based estimates", () => {
  const projector = new RaceStateProjector();
  for (const snapshot of fuelSequence("race-1")) projector.update(snapshot);
  const fuel = projector.getState().fuel;
  assert.equal(fuel.remaining, 44);
  assert.equal(fuel.averagePerLap, 2);
  assert.equal(fuel.estimatedLaps, 22);
  assert.equal(fuel.estimatedAtFinish, 34);
});

function fuelSequence(sessionId: string): IRacingTelemetry[] {
  const session = { connected: true, sessionActive: true, sessionId } as const;
  return [
    { ...session, lapCompleted: 0, lapsRemaining: 9, fuelLevel: 40 },
    { ...session, lapCompleted: 1, lapsRemaining: 8, fuelLevel: 38 },
    { ...session, lapCompleted: 2, lapsRemaining: 7, fuelLevel: 36 },
    { ...session, lapCompleted: 3, lapsRemaining: 6, fuelLevel: 34 },
    { ...session, lapCompleted: 4, lapsRemaining: 5, fuelLevel: 46 },
    { ...session, lapCompleted: 5, lapsRemaining: 5, fuelLevel: 44 },
  ];
}
