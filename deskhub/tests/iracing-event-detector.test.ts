import assert from "node:assert/strict";
import test from "node:test";
import { IRacingEventDetector } from "../src/integrations/iracing/event-detector.ts";
import type { IRacingTelemetry } from "../src/integrations/iracing/types.ts";

const base = (overrides: Partial<IRacingTelemetry> = {}): IRacingTelemetry => ({
  connected: true, sessionActive: true, sessionId: "race-1", position: 7,
  lapBestLapTime: 108.5, incidentCount: 0, yellowFlag: false, blueFlag: false,
  checkeredFlag: false, ...overrides,
});

test("first telemetry snapshot is a baseline without race events", () => {
  const events = new IRacingEventDetector().update(base());
  assert.deepEqual(events, [{ type: "SESSION_ACTIVE", position: 7 }]);
});

test("best lap improvement emits exactly one PB", () => {
  const detector = new IRacingEventDetector();
  detector.update(base());
  assert.deepEqual(detector.update(base({ lapBestLapTime: 107.9 })),
    [{ type: "PERSONAL_BEST", previous: 108.5, current: 107.9 }]);
  assert.deepEqual(detector.update(base({ lapBestLapTime: 107.9 })), []);
});

test("zero or uninitialized best laps do not emit PB", () => {
  const detector = new IRacingEventDetector();
  detector.update(base({ lapBestLapTime: 0 }));
  assert.deepEqual(detector.update(base({ lapBestLapTime: 107.9 })), []);
});

test("position transitions emit gained and lost conservatively", () => {
  const detector = new IRacingEventDetector();
  detector.update(base());
  assert.deepEqual(detector.update(base({ position: 6 })), [{ type: "POSITION_GAINED", from: 7, to: 6 }]);
  assert.deepEqual(detector.update(base({ position: 7 })), [{ type: "POSITION_LOST", from: 6, to: 7 }]);
  assert.deepEqual(detector.update(base({ position: 20 })), []);
});

test("incident increase emits delta once and reset emits nothing", () => {
  const detector = new IRacingEventDetector();
  detector.update(base());
  assert.deepEqual(detector.update(base({ incidentCount: 4 })),
    [{ type: "INCIDENT_RECEIVED", delta: 4, total: 4 }]);
  assert.deepEqual(detector.update(base({ incidentCount: 4 })), []);
  assert.deepEqual(detector.update(base({ incidentCount: 0 })), []);
});

test("flag transitions emit once while active", () => {
  const detector = new IRacingEventDetector();
  detector.update(base());
  assert.deepEqual(detector.update(base({ yellowFlag: true })), [{ type: "YELLOW_FLAG" }]);
  assert.deepEqual(detector.update(base({ yellowFlag: true })), []);
  detector.update(base({ yellowFlag: false }));
  assert.deepEqual(detector.update(base({ blueFlag: true })), [{ type: "BLUE_FLAG" }]);
});

test("disconnect and session change reset the baseline", () => {
  const detector = new IRacingEventDetector();
  detector.update(base());
  assert.deepEqual(detector.update({ connected: false }), []);
  assert.deepEqual(detector.update(base({ position: 2, lapBestLapTime: 90 })),
    [{ type: "SESSION_ACTIVE", position: 2 }]);
  assert.deepEqual(detector.update(base({ sessionId: "race-2", position: 9, lapBestLapTime: 120 })),
    [{ type: "SESSION_ACTIVE", position: 9 }]);
});
