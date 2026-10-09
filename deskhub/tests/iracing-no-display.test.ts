import assert from "node:assert/strict";
import test from "node:test";
import { DeskHubCore } from "../src/core/deskhub-core.ts";
import { FakeIRacingTelemetrySource } from "../src/integrations/iracing/fake-telemetry-source.ts";
import { iracingIdleView } from "../src/integrations/iracing/idle-view.ts";
import { IRacingPipeline } from "../src/integrations/iracing/pipeline.ts";
import { RaceStateProjector } from "../src/integrations/iracing/race-state-projector.ts";
import { createDisplay, NullDisplay } from "../src/pixoo-display.ts";
import { RaceCompanionServer } from "../src/race-companion/server.ts";

test("no-display mode starts without contacting the Pixoo bridge", async () => {
  const display = createDisplay("none");
  assert.ok(display instanceof NullDisplay);
  assert.deepEqual(await display.getStatus(), {
    status: "disconnected", connected: false, device_address: "", serial_port: "",
  });
  await display.showText("PB");
  await display.showFrame(new Array(16 * 16 * 3).fill(0));
});

test("no-display mode processes telemetry and serves Race Companion state", async (context) => {
  const display = createDisplay("none");
  const projector = new RaceStateProjector();
  const source = new FakeIRacingTelemetrySource([
    { connected: true, sessionActive: true, sessionId: "race", position: 8,
      lap: 1, lapCompleted: 0, fuelLevel: 30 },
    { connected: true, sessionActive: true, sessionId: "race", position: 6,
      lap: 2, lapCompleted: 1, lapLastLapTime: 92.5, lapBestLapTime: 92.5, fuelLevel: 28 },
  ]);
  let pipeline: IRacingPipeline;
  const core = new DeskHubCore(display, async () => {}, () => iracingIdleView(pipeline?.getCurrentPosition()));
  pipeline = new IRacingPipeline(source, core, undefined, undefined, [projector]);
  const server = new RaceCompanionServer(() => projector.getState(), { port: 0 });
  const address = await server.start();
  context.after(() => server.close());

  await pipeline.run();

  const response = await fetch(`http://127.0.0.1:${address.port}/api/race/state`);
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.equal(state.connection.sessionActive, true);
  assert.deepEqual(state.position, { current: 6, start: 8, gainLoss: 2 });
  assert.equal(state.laps.recent[0].lapTime, 92.5);
  assert.equal(core.state.lastError, undefined);
});

test("display mode defaults to Pixoo and rejects configuration mistakes", () => {
  assert.equal(createDisplay().constructor.name, "HttpPixooDisplay");
  assert.throws(() => createDisplay("off"), /DESKHUB_DISPLAY/);
});
