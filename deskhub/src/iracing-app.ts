import { DeskHubCore } from "./core/deskhub-core.ts";
import { iracingIdleView } from "./integrations/iracing/idle-view.ts";
import { IRacingPipeline } from "./integrations/iracing/pipeline.ts";
import { SDKIRacingTelemetrySource } from "./integrations/iracing/sdk-telemetry-source.ts";
import { HttpPixooDisplay } from "./pixoo-display.ts";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

const display = new HttpPixooDisplay();
console.log("[DeskHub] Pixoo:", await display.getStatus());
let pipeline: IRacingPipeline;
const core = new DeskHubCore(display, undefined, () => iracingIdleView(pipeline?.getCurrentPosition()));
const source = new SDKIRacingTelemetrySource({ signal: controller.signal });
pipeline = new IRacingPipeline(source, core);
await pipeline.run();
