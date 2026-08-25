import assert from "node:assert/strict";
import test from "node:test";
import { DeskHubCore } from "../src/core/deskhub-core.ts";
import { FakeIRacingTelemetrySource } from "../src/integrations/iracing/fake-telemetry-source.ts";
import { iracingIdleView } from "../src/integrations/iracing/idle-view.ts";
import { IRacingPipeline } from "../src/integrations/iracing/pipeline.ts";
import type { DisplayStatus, PixooDisplay, ShowTextOptions } from "../src/pixoo-display.ts";

class MockDisplay implements PixooDisplay {
  readonly calls: string[] = [];
  async getStatus(): Promise<DisplayStatus> { return { status: "ok", connected: true, device_address: "x", serial_port: "x" }; }
  async setBrightness(): Promise<void> {}
  async showFrame(): Promise<void> {}
  async showText(text: string, _options?: ShowTextOptions): Promise<void> { this.calls.push(text); }
}

test("fake source drives P7, PB, then restores P7", async () => {
  const session = { connected: true, sessionActive: true, sessionId: "race" } as const;
  const source = new FakeIRacingTelemetrySource([
    { ...session, position: 7, lapBestLapTime: 108.5, incidentCount: 0 },
    { ...session, position: 7, lapBestLapTime: 107.9, incidentCount: 0 },
  ]);
  const display = new MockDisplay();
  let pipeline: IRacingPipeline;
  const core = new DeskHubCore(display, async () => {}, () => iracingIdleView(pipeline?.getCurrentPosition()));
  pipeline = new IRacingPipeline(source, core);
  await pipeline.run();
  assert.deepEqual(display.calls, ["P7", "PB", "P7"]);
});

test("telemetry unavailable exits to normal without crashing", async () => {
  const source = new FakeIRacingTelemetrySource([
    { connected: true, sessionActive: true, sessionId: "race", position: 7 },
    { connected: false },
  ]);
  const display = new MockDisplay();
  let pipeline: IRacingPipeline;
  const core = new DeskHubCore(display, async () => {}, () => iracingIdleView(pipeline?.getCurrentPosition()));
  pipeline = new IRacingPipeline(source, core);
  await pipeline.run();
  assert.deepEqual(display.calls, ["P7", "RDY"]);
  assert.equal(core.state.mode, "normal");
});
