import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { DeskHubCore } from "./core/deskhub-core.ts";
import { FaceitApiClient } from "./integrations/faceit/api-client.ts";
import { loadFaceitConfig } from "./integrations/faceit/config.ts";
import { FaceitPoller } from "./integrations/faceit/poller.ts";
import { RealFaceitSource } from "./integrations/faceit/source.ts";
import { faceitIdleView, faceitPlacementIdleView } from "./integrations/faceit/idle-view.ts";
import { JsonFaceitStateStore } from "./integrations/faceit/state-store.ts";
import { WindowsProcessActivityHint } from "./integrations/faceit/activity-hint.ts";
import { ConfiguredFaceitPhaseProvider } from "./integrations/faceit/phase.ts";
import { HttpPixooDisplay } from "./pixoo-display.ts";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);

async function main(): Promise<void> {
  const config = loadFaceitConfig();
  const display = new HttpPixooDisplay();
  console.log("[DeskHub] Pixoo:", await display.getStatus());
  const client = new FaceitApiClient({
    apiKey: config.apiKey,
    timeoutMs: config.requestTimeoutMs,
  });
  const statePath = fileURLToPath(new URL("../../data/faceit-state.json", import.meta.url));
  const source = new RealFaceitSource({ client, nickname: config.nickname, stateStore: new JsonFaceitStateStore(statePath),
    phaseProvider: new ConfiguredFaceitPhaseProvider(config.phaseMode, config.placementPlayed, config.placementTotal) });
  await source.latestResult();
  const core = new DeskHubCore(display, undefined, () => source.getCurrentPhase() === "placement"
    ? faceitPlacementIdleView(source.getPlacement()) : faceitIdleView(source.getCurrentLevel()));
  await core.showNormal();
  const poller = new FaceitPoller(source, core, {
    activeIntervalMs: config.activePollIntervalMs,
    idleIntervalMs: config.idlePollIntervalMs,
    activityHint: new WindowsProcessActivityHint(),
    log: (message) => console.log(`[FACEIT] ${message}`),
  });
  const controller = new AbortController();
  const idleTimer = setInterval(() => { void core.showNormal().catch((error) =>
    console.error("[FACEIT] Idle animation failed:", error instanceof Error ? error.message : error)); }, config.idleAnimationIntervalMs);
  const stop = () => { clearInterval(idleTimer); controller.abort(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(`[FACEIT] Adaptive polling: active=${config.activePollIntervalMs}ms idle=${config.idlePollIntervalMs}ms`);
  await poller.run(controller.signal);
}

main().catch((error) => {
  console.error("[DeskHub] Startup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
