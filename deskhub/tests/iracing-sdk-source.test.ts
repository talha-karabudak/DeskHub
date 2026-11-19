import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import { GlobalFlags, type TelemetryVariable } from "@irsdk-node/types";
import {
  SDKIRacingTelemetrySource,
  type SDKTelemetrySourceOptions,
  type TelemetrySDK,
  type TelemetrySDKModule,
} from "../src/integrations/iracing/sdk-telemetry-source.ts";

type Operation = "load" | "simStatus" | "constructor" | "start" | "wait" | "sessionStatus" | "telemetry" | "connectionId";

function variable<T>(value: T): TelemetryVariable<T[]> {
  return { name: "fake", description: "", unit: "", countAsTime: false, length: 1, varType: 0, value: [value] };
}

function fixture(options: SDKTelemetrySourceOptions = {}) {
  const state = {
    failure: undefined as Operation | undefined,
    running: true,
    connected: true,
    hasData: true,
    startOK: true,
    stopThrows: false,
    loads: 0,
    instances: [] as FakeSDK[],
    logs: [] as string[],
    telemetry: { IsOnTrack: variable(true), PlayerCarPosition: variable(7) } as ReturnType<TelemetrySDK["getTelemetry"]>,
    status: undefined as (() => Promise<boolean>) | undefined,
  };
  const fail = (operation: Operation) => {
    if (state.failure !== operation) return;
    state.failure = undefined;
    throw new Error(`${operation} failed`);
  };
  class FakeSDK implements TelemetrySDK {
    stops = 0;
    starts = 0;
    waits: number[] = [];
    options: { autoEnableTelemetry: boolean };
    constructor(options: { autoEnableTelemetry: boolean }) {
      fail("constructor");
      this.options = options;
      state.instances.push(this);
    }
    static async IsSimRunning(): Promise<boolean> {
      fail("simStatus");
      return state.status ? state.status() : state.running;
    }
    get sessionStatusOK(): boolean { fail("sessionStatus"); return state.connected; }
    startSDK(): boolean { this.starts += 1; fail("start"); return state.startOK; }
    stopSDK(): void { this.stops += 1; if (state.stopThrows) throw new Error("stop failed"); }
    waitForData(timeout: number): boolean { this.waits.push(timeout); fail("wait"); return state.hasData; }
    getTelemetry(): ReturnType<TelemetrySDK["getTelemetry"]> { fail("telemetry"); return state.telemetry; }
    getSessionConnectionID(): number { fail("connectionId"); return 42; }
  }
  const sdkModule: TelemetrySDKModule = { IRacingSDK: FakeSDK };
  const source = new SDKIRacingTelemetrySource({
    sampleIntervalMs: 0,
    reconnectIntervalMs: 0,
    log: (message) => state.logs.push(message),
    loadSDK: async () => { state.loads += 1; fail("load"); return sdkModule; },
    ...options,
  });
  return { state, source };
}

test("SDK loading is deferred until iteration and skipped when already aborted", async () => {
  const controller = new AbortController();
  const { state, source } = fixture({ signal: controller.signal });
  const snapshots = source.snapshots();
  assert.equal(state.loads, 0);
  controller.abort();
  assert.deepEqual(await snapshots.next(), { value: undefined, done: true });
  assert.equal(state.loads, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("SDK telemetry retains the existing field mappings and cleans up on iterator return", async () => {
  const { state, source } = fixture();
  state.telemetry = {
    SessionFlags: variable(GlobalFlags.YellowWaving | GlobalFlags.Blue | GlobalFlags.White
      | GlobalFlags.StartReady | GlobalFlags.StartSet | GlobalFlags.StartGo | GlobalFlags.Checkered),
    IsOnTrack: variable(false), IsOnTrackCar: variable(true), SessionNum: variable(3),
    PlayerCarPosition: variable(7), Lap: variable(4), LapCompleted: variable(3), SessionLapsRemainEx: variable(12),
    LapCurrentLapTime: variable(23.2), LapLastLapTime: variable(103.4), LapBestLapTime: variable(101.1),
    Speed: variable(32.5), RPM: variable(6400), Gear: variable(3), FuelLevel: variable(11.2),
    FuelLevelPct: variable(0.3), PlayerCarMyIncidentCount: variable(2), OnPitRoad: variable(true), CarLeftRight: variable(2),
  };
  const snapshots = source.snapshots();
  assert.deepEqual((await snapshots.next()).value, {
    connected: true, sessionActive: true, sessionId: "42:3", position: 7, lap: 4, lapCompleted: 3, lapsRemaining: 12,
    lapCurrentLapTime: 23.2, lapLastLapTime: 103.4, lapBestLapTime: 101.1,
    speed: 32.5, rpm: 6400, gear: 3, fuelLevel: 11.2, fuelLevelPct: 0.3,
    incidentCount: 2, onPitRoad: true, carLeftRight: 2,
    yellowFlag: true, blueFlag: true, whiteFlag: true,
    startReady: true, startSet: true, startGo: true, checkeredFlag: true,
  });
  assert.deepEqual(state.instances[0].options, { autoEnableTelemetry: true });
  assert.deepEqual(state.instances[0].waits, [16]);
  await snapshots.return(undefined);
  assert.equal(state.instances[0].stops, 1);
});

for (const operation of ["load", "simStatus", "constructor", "start", "wait", "sessionStatus", "telemetry", "connectionId"] as const) {
  test(`SDK ${operation} errors emit disconnect and recover`, async () => {
    const { state, source } = fixture();
    state.failure = operation;
    const snapshots = source.snapshots();
    assert.deepEqual((await snapshots.next()).value, { connected: false });
    assert.ok(state.instances.every((instance) => instance.stops === 1));
    assert.equal((await snapshots.next()).value?.connected, true);
    assert.equal(state.loads, operation === "load" ? 2 : 1);
    assert.ok(state.logs.some((message) => message.includes(`${operation} failed`)));
    await snapshots.return(undefined);
    assert.ok(state.instances.every((instance) => instance.stops === 1));
  });
}

test("a failed start releases the SDK before retrying", async () => {
  const { state, source } = fixture();
  state.startOK = false;
  const snapshots = source.snapshots();
  assert.deepEqual((await snapshots.next()).value, { connected: false });
  assert.equal(state.instances[0].stops, 1);
  state.startOK = true;
  assert.equal((await snapshots.next()).value?.connected, true);
  assert.equal(state.instances.length, 2);
  await snapshots.return(undefined);
  assert.equal(state.instances[1].stops, 1);
});

for (const reason of ["simStopped", "sessionLost"] as const) {
  test(`${reason} releases the old SDK and reconnects`, async () => {
    const { state, source } = fixture();
    const snapshots = source.snapshots();
    assert.equal((await snapshots.next()).value?.connected, true);
    if (reason === "simStopped") state.running = false;
    else { state.hasData = false; state.connected = false; }
    assert.deepEqual((await snapshots.next()).value, { connected: false });
    assert.equal(state.instances[0].stops, 1);
    state.running = true;
    state.hasData = true;
    state.connected = true;
    assert.equal((await snapshots.next()).value?.connected, true);
    assert.equal(state.instances.length, 2);
    await snapshots.return(undefined);
  });
}

test("SDK stop failures do not escape disconnect or final cleanup", async () => {
  const { state, source } = fixture();
  const snapshots = source.snapshots();
  await snapshots.next();
  state.stopThrows = true;
  state.running = false;
  assert.deepEqual((await snapshots.next()).value, { connected: false });
  state.running = true;
  assert.equal((await snapshots.next()).value?.connected, true);
  await snapshots.return(undefined);
  assert.deepEqual(state.instances.map((instance) => instance.stops), [1, 1]);
  assert.equal(state.logs.filter((message) => message.includes("cleanup failed")).length, 2);
});

test("completed sample waits remove their abort listeners", async () => {
  const controller = new AbortController();
  const { state, source } = fixture({ signal: controller.signal });
  const snapshots = source.snapshots();
  for (let sample = 0; sample < 20; sample += 1) {
    assert.equal((await snapshots.next()).value?.connected, true);
    assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  }
  await snapshots.return(undefined);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal(state.instances[0].stops, 1);
});

for (const waitingFor of ["sample", "reconnect"] as const) {
  test(`abort clears the pending ${waitingFor} timer and SDK`, { timeout: 1000 }, async (t) => {
    const controller = new AbortController();
    t.after(() => controller.abort());
    const schedule = t.mock.method(globalThis, "setTimeout");
    const clear = t.mock.method(globalThis, "clearTimeout");
    const { state, source } = fixture({ signal: controller.signal, sampleIntervalMs: 60_000, reconnectIntervalMs: 60_000 });
    state.running = waitingFor === "sample";
    const snapshots = source.snapshots();
    await snapshots.next();
    const pending = snapshots.next();
    await nextTurn();
    assert.equal(schedule.mock.callCount(), 1);
    const timer = schedule.mock.calls[0].result;
    assert.equal(getEventListeners(controller.signal, "abort").length, 2);
    controller.abort();
    assert.deepEqual(await pending, { value: undefined, done: true });
    assert.ok(clear.mock.calls.some((call) => call.arguments[0] === timer));
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    assert.ok(state.instances.every((instance) => instance.stops === 1));
  });
}

test("abort releases an SDK even while the consumer holds a snapshot", async () => {
  const controller = new AbortController();
  const { state, source } = fixture({ signal: controller.signal });
  const snapshots = source.snapshots();
  await snapshots.next();
  controller.abort();
  assert.equal(state.instances[0].stops, 1);
  await snapshots.return(undefined);
  assert.equal(state.instances[0].stops, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("abort completes pending SDK status waits and handles late rejections", { timeout: 1000 }, async (t) => {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const { state, source } = fixture({ signal: controller.signal });
  const snapshots = source.snapshots();
  await snapshots.next();
  let rejectStatus: (error: Error) => void = () => {};
  let markStatusStarted: () => void = () => {};
  const statusStarted = new Promise<void>((resolve) => { markStatusStarted = resolve; });
  state.status = () => new Promise<boolean>((_resolve, reject) => {
    rejectStatus = reject;
    markStatusStarted();
  });
  const pending = snapshots.next();
  await statusStarted;
  controller.abort();
  assert.deepEqual(await pending, { value: undefined, done: true });
  assert.equal(state.instances[0].stops, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  rejectStatus(new Error("late SDK status failure"));
  await nextTurn();
});

test("abort completes a pending native module load without constructing an SDK", { timeout: 1000 }, async (t) => {
  const controller = new AbortController();
  t.after(() => controller.abort());
  let rejectLoad: (error: Error) => void = () => {};
  const { state, source } = fixture({
    signal: controller.signal,
    loadSDK: () => new Promise((_resolve, reject) => { rejectLoad = reject; }),
  });
  const pending = source.snapshots().next();
  await nextTurn();
  controller.abort();
  assert.deepEqual(await pending, { value: undefined, done: true });
  assert.equal(state.instances.length, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  rejectLoad(new Error("late SDK load failure"));
  await nextTurn();
});
