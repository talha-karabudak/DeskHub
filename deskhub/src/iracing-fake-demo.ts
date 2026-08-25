import { DeskHubCore } from "./core/deskhub-core.ts";
import { FakeIRacingTelemetrySource } from "./integrations/iracing/fake-telemetry-source.ts";
import { iracingIdleView } from "./integrations/iracing/idle-view.ts";
import { IRacingPipeline } from "./integrations/iracing/pipeline.ts";
import { HttpPixooDisplay } from "./pixoo-display.ts";

const session = { connected: true, sessionActive: true, sessionId: "fake-race" } as const;
const source = new FakeIRacingTelemetrySource([
  { ...session, position: 7, lapBestLapTime: 108.5, incidentCount: 0 },
  { ...session, position: 7, lapBestLapTime: 107.9, incidentCount: 0 },
], 1000);
let pipeline: IRacingPipeline;
const core = new DeskHubCore(new HttpPixooDisplay(), undefined, () => iracingIdleView(pipeline?.getCurrentPosition()));
pipeline = new IRacingPipeline(source, core);

console.log("[IRACING] Fake session: baseline P7 -> PB -> P7");
await pipeline.run();
console.log("[IRACING] Fake pipeline complete");
