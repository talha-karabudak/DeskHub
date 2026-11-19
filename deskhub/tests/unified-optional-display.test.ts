import assert from "node:assert/strict";
import test from "node:test";
import { UnifiedModeManager } from "../src/core/mode-manager.ts";
import { FakeIRacingTelemetrySource } from "../src/integrations/iracing/fake-telemetry-source.ts";
import { RaceStateProjector } from "../src/integrations/iracing/race-state-projector.ts";
import { OptionalPixooDisplay } from "../src/optional-pixoo-display.ts";
import { NullDisplay, type DisplayStatus } from "../src/pixoo-display.ts";
import { createUnifiedIRacingPipeline } from "../src/unified-iracing.ts";

const faceitView = () => ({ kind: "text" as const, text: "LVL8" });

test("offline Pixoo does not acknowledge FACEIT delivery; it can retry after reconnection", async () => {
  let online = false;
  let textWrites = 0;
  class Display extends NullDisplay {
    override async getStatus(): Promise<DisplayStatus> {
      if (!online) throw new Error("Bridge is not running");
      return { status: "ok", connected: true, device_address: "test", serial_port: "COM9" };
    }
    override async showText(): Promise<void> { textWrites++; }
  }
  let reconnects = 0;
  const display = new OptionalPixooDisplay(new Display(), () => { reconnects++; }, () => {});
  const manager = new UnifiedModeManager(display, { faceitView, sleep: async () => {}, log: () => {} });
  const result = [{ id: "match1", type: "result", mode: "faceit" as const,
    priority: 10, durationMs: 0, view: { kind: "text" as const, text: "WIN" } }];
  await display.probe();
  assert.equal(await manager.deliver(result), false);
  assert.equal(textWrites, 0);
  online = true;
  await display.probe();
  await display.probe();
  assert.equal(reconnects, 1);
  assert.equal(await manager.deliver(result), true);
  assert.ok(textWrites > 0);
  await manager.stop();
});

test("failed display writes go offline until a successful probe", async () => {
  let writes = 0;
  class Display extends NullDisplay {
    override async getStatus(): Promise<DisplayStatus> {
      return { status: "ok", connected: true, device_address: "test", serial_port: "COM9" };
    }
    override async showFrame(): Promise<void> { writes++; throw new Error("Bluetooth lost"); }
  }
  const display = new OptionalPixooDisplay(new Display(), () => {}, () => {});
  await display.probe();
  await assert.rejects(display.showFrame([]), /Bluetooth lost/);
  await assert.rejects(display.showFrame([]), /offline/);
  assert.equal(writes, 1);
  await display.probe();
  await assert.rejects(display.showFrame([]), /Bluetooth lost/);
  assert.equal(writes, 2);
});

test("reconnecting restores an urgent spotter overlay that failed while Pixoo was off", async () => {
  let frames = 0;
  let online = false;
  class Display extends NullDisplay {
    override async getStatus(): Promise<DisplayStatus> {
      return { status: online ? "ok" : "disconnected", connected: online,
        device_address: "test", serial_port: "COM9" };
    }
    override async showFrame(): Promise<void> { frames++; }
  }
  const display = new OptionalPixooDisplay(new Display(), () => manager.core.refreshDisplay(), () => {});
  const manager = new UnifiedModeManager(display, { faceitView, sleep: async () => {}, log: () => {} });
  manager.onIRacingTelemetry({ connected: true, sessionActive: true, position: 7, carLeftRight: 2 });
  await manager.whenIdle().catch(() => {});
  await assert.rejects(manager.setUrgentOverlay({ kind: "frame", label: "LEFT", pixels: [1, 2, 3] }), /offline/);
  online = true;
  await display.probe();
  await manager.whenIdle();
  assert.equal(frames, 1);
  await manager.stop();
});

test("dashboard snapshots keep advancing while a Pixoo spotter write is blocked", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let sampled = false;
  class Display extends NullDisplay {
    override async showFrame(): Promise<void> { await blocked; }
  }
  const manager = new UnifiedModeManager(new Display(), { faceitView, sleep: async () => {}, log: () => {} });
  const raceState = new RaceStateProjector();
  const source = { async *snapshots() {
    yield { connected: true, sessionActive: true, sessionId: "race", position: 7, carLeftRight: 2 };
    yield { connected: true, sessionActive: true, sessionId: "race", position: 7,
      carLeftRight: 2, fuelLevel: 24 };
    sampled = true;
  } };
  const running = createUnifiedIRacingPipeline(source, manager, raceState, () => {}).run();
  try {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    assert.equal(sampled, true);
    assert.equal(raceState.getState().fuel.remaining, 24);
    assert.equal(raceState.getState().position.current, 7);
  } finally { release(); await running; await manager.stop(); }
});

test("unified telemetry still updates iPad state when every Pixoo request fails", async () => {
  const display = new OptionalPixooDisplay(new NullDisplay(), () => {}, () => {});
  const manager = new UnifiedModeManager(display, { faceitView, sleep: async () => {}, log: () => {} });
  const raceState = new RaceStateProjector();
  const source = new FakeIRacingTelemetrySource([
    { connected: true, sessionActive: true, sessionId: "race", position: 7, carLeftRight: 2, fuelLevel: 25 },
    { connected: true, sessionActive: true, sessionId: "race", position: 6, carLeftRight: 3, fuelLevel: 24 },
  ]);
  await createUnifiedIRacingPipeline(source, manager, raceState, () => {}).run();
  assert.deepEqual(raceState.getState().position, { current: 6, start: 7, gainLoss: 1 });
  assert.equal(raceState.getState().fuel.remaining, 24);
  assert.equal(manager.currentMode, "iracing");
  await manager.stop();
});

test("display monitor exits when aborted while waiting for a device", async () => {
  const signal = new AbortController();
  const display = new OptionalPixooDisplay(new NullDisplay(), () => {}, () => {});
  const monitoring = display.monitor(signal.signal, 100_000);
  await Promise.resolve(); await Promise.resolve();
  signal.abort();
  await monitoring;
});
