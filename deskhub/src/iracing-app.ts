import { DeskHubCore } from "./core/deskhub-core.ts";
import { iracingIdleView } from "./integrations/iracing/idle-view.ts";
import { IRacingPipeline } from "./integrations/iracing/pipeline.ts";
import { RaceStateProjector } from "./integrations/iracing/race-state-projector.ts";
import { SDKIRacingTelemetrySource } from "./integrations/iracing/sdk-telemetry-source.ts";
import { createDisplay } from "./pixoo-display.ts";
import { RaceCompanionServer } from "./race-companion/server.ts";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

const displayMode = process.env.DESKHUB_DISPLAY ?? "pixoo";
const display = createDisplay(displayMode);
console.log(`[DeskHub] Display (${displayMode}):`, await display.getStatus());
let pipeline: IRacingPipeline;
const core = new DeskHubCore(display, undefined,
  () => iracingIdleView(pipeline?.getCurrentPosition(), undefined,
    pipeline?.getYellowFlag(), pipeline?.getBlueFlag()));
const source = new SDKIRacingTelemetrySource({ signal: controller.signal });
const raceState = new RaceStateProjector();
pipeline = new IRacingPipeline(source, core, undefined, undefined, [raceState]);
const raceServer = new RaceCompanionServer(() => raceState.getState(), {
  host: process.env.RACE_COMPANION_HOST ?? "127.0.0.1",
  port: parsePort(process.env.RACE_COMPANION_PORT),
});
const address = await raceServer.start();
console.log(`[Race Companion] http://${address.address}:${address.port}`);
try {
  await pipeline.run();
} finally {
  await raceServer.close();
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return 8787;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("RACE_COMPANION_PORT must be an integer between 0 and 65535");
  }
  return port;
}
