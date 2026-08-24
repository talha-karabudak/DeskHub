import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { DeskHubCore } from "./core/deskhub-core.ts";
import { FaceitApiClient } from "./integrations/faceit/api-client.ts";
import { loadFaceitConfig } from "./integrations/faceit/config.ts";
import { FaceitPoller } from "./integrations/faceit/poller.ts";
import { RealFaceitSource } from "./integrations/faceit/source.ts";
import { faceitIdleView } from "./integrations/faceit/idle-view.ts";
import { JsonFaceitStateStore } from "./integrations/faceit/state-store.ts";
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
  const source = new RealFaceitSource({ client, nickname: config.nickname, stateStore: new JsonFaceitStateStore(statePath) });
  await source.latestResult();
  const core = new DeskHubCore(display, undefined, () => faceitIdleView(source.getCurrentLevel()));
  await core.showNormal();
  const poller = new FaceitPoller(source, core, config.pollIntervalMs);
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  console.log(`[FACEIT] Polling every ${config.pollIntervalMs}ms`);
  await poller.run(controller.signal);
}

main().catch((error) => {
  console.error("[DeskHub] Startup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
