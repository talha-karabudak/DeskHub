import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { UnifiedModeManager } from "./core/mode-manager.ts";
import { FaceitApiClient } from "./integrations/faceit/api-client.ts";
import type { FaceitActivityHint } from "./integrations/faceit/activity-hint.ts";
import { WindowsProcessActivityHint } from "./integrations/faceit/activity-hint.ts";
import { loadFaceitConfig } from "./integrations/faceit/config.ts";
import { faceitIdleView, faceitPlacementIdleView } from "./integrations/faceit/idle-view.ts";
import { ConfiguredFaceitPhaseProvider } from "./integrations/faceit/phase.ts";
import { FaceitPoller } from "./integrations/faceit/poller.ts";
import { RealFaceitSource } from "./integrations/faceit/source.ts";
import { JsonFaceitStateStore } from "./integrations/faceit/state-store.ts";
import { RaceStateProjector } from "./integrations/iracing/race-state-projector.ts";
import { loadPixooSettings, savePixooSettings } from "./integrations/iracing/pixoo-settings.ts";
import { SDKIRacingTelemetrySource } from "./integrations/iracing/sdk-telemetry-source.ts";
import { createDisplay, HttpPixooDisplay } from "./pixoo-display.ts";
import { OptionalPixooDisplay } from "./optional-pixoo-display.ts";
import { RaceCompanionServer } from "./race-companion/server.ts";
import { createUnifiedIRacingPipeline } from "./unified-iracing.ts";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);

const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const displayMode = process.env.DESKHUB_DISPLAY ?? "pixoo";
const optionalDisplay = displayMode === "pixoo"
  ? new OptionalPixooDisplay(new HttpPixooDisplay("http://127.0.0.1:8765", 1000),
    () => manager.core.refreshDisplay())
  : undefined;
const display = optionalDisplay ?? createDisplay(displayMode);
let faceitSource: RealFaceitSource | undefined;
let faceitIdleAnimationIntervalMs = 30_000;
const pixooSettingsPath = fileURLToPath(new URL("../../data/pixoo-settings.json", import.meta.url));
let pixooSettings = loadPixooSettings(pixooSettingsPath);
const manager = new UnifiedModeManager(display, {
  pixooSettings,
  faceitView: () => faceitSource?.getCurrentPhase() === "placement"
    ? faceitPlacementIdleView(faceitSource.getPlacement())
    : faceitIdleView(faceitSource?.getCurrentLevel()),
  log: console.log,
});

const raceState = new RaceStateProjector();
const raceServer = new RaceCompanionServer(() => raceState.getState(), {
  application: "deskhub",
  host: process.env.RACE_COMPANION_HOST ?? "127.0.0.1",
  port: parsePort(process.env.RACE_COMPANION_PORT),
  pixooSettings: {
    get: () => pixooSettings,
    save(settings) {
      savePixooSettings(pixooSettingsPath, settings);
      pixooSettings = settings;
      manager.setPixooSettings(settings);
    },
  },
});

async function main(): Promise<void> {
  const address = await raceServer.start();
  console.log(`[Race Companion] http://${address.address}:${address.port}/race`);

  const tasks: Promise<void>[] = [runIdleRefresh(controller.signal)];
  if (optionalDisplay) tasks.push(optionalDisplay.monitor(controller.signal));
  if (process.env.FACEIT_API_KEY?.trim() && process.env.FACEIT_NICKNAME?.trim()) {
    const config = loadFaceitConfig();
    faceitIdleAnimationIntervalMs = config.idleAnimationIntervalMs;
    const client = new FaceitApiClient({ apiKey: config.apiKey, timeoutMs: config.requestTimeoutMs, signal: controller.signal });
    const statePath = fileURLToPath(new URL("../../data/faceit-state.json", import.meta.url));
    faceitSource = new RealFaceitSource({
      client, nickname: config.nickname, stateStore: new JsonFaceitStateStore(statePath),
      phaseProvider: new ConfiguredFaceitPhaseProvider(config.phaseMode, config.placementPlayed, config.placementTotal),
      signal: controller.signal,
    });
    let currentActivity = false;
    const activity = new ReportingActivityHint(new WindowsProcessActivityHint(), (active) => {
      currentActivity = active; manager.setFaceitActive(active);
    });
    currentActivity = await activity.readWithoutReporting();
    const poller = new FaceitPoller(faceitSource, manager, {
      activeIntervalMs: config.activePollIntervalMs,
      idleIntervalMs: config.idlePollIntervalMs,
      activityHint: activity,
      onPoll: () => { manager.setFaceitActive(currentActivity); manager.refreshIdle(); },
      log: (message) => console.log(`[FACEIT] ${message}`),
    });
    tasks.push(poller.run(controller.signal).catch((error) => {
      console.error("[FACEIT] Source disabled:", errorMessage(error));
      manager.setFaceitActive(false);
    }));
  } else {
    console.log("[FACEIT] Disabled: FACEIT_API_KEY or FACEIT_NICKNAME is missing");
  }

  if (process.env.IRACING_ENABLED?.trim().toLowerCase() !== "false") {
    const source = new SDKIRacingTelemetrySource({ signal: controller.signal });
    tasks.push(createUnifiedIRacingPipeline(source, manager, raceState).run().catch((error) => {
      console.error("[IRACING] Source failed:", errorMessage(error));
      raceState.update({ connected: false });
      manager.onIRacingTelemetry({ connected: false });
    }));
  } else {
    console.log("[IRACING] Disabled by IRACING_ENABLED=false");
  }

  await manager.core.showNormal().catch((error) => console.error("[DeskHub] Initial display failed:", errorMessage(error)));
  console.log("[DeskHub] Unified mode manager started (IRACING > FACEIT > NORMAL)");
  await Promise.all(tasks);
}

async function runIdleRefresh(signal: AbortSignal): Promise<void> {
  let previousKey = "";
  let nextFaceitRefresh = 0;
  while (!signal.aborted) {
    const now = new Date();
    if (manager.currentMode === "normal") {
      const key = `${now.getHours()}:${now.getMinutes()}`;
      if (key !== previousKey) { previousKey = key; manager.refreshIdle(); }
    } else if (manager.currentMode === "faceit" && Date.now() >= nextFaceitRefresh) {
      nextFaceitRefresh = Date.now() + faceitIdleAnimationIntervalMs; manager.refreshIdle();
    }
    await abortableWait(1_000, signal);
  }
}

class ReportingActivityHint implements FaceitActivityHint {
  private readonly inner: FaceitActivityHint;
  private readonly report: (active: boolean) => void;
  constructor(inner: FaceitActivityHint, report: (active: boolean) => void) {
    this.inner = inner; this.report = report;
  }
  readWithoutReporting(): Promise<boolean> { return this.inner.isActive(); }
  async isActive(): Promise<boolean> { const active = await this.inner.isActive(); this.report(active); return active; }
}

function abortableWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function parsePort(value: string | undefined): number {
  if (value === undefined) return 8787;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("RACE_COMPANION_PORT must be an integer between 0 and 65535");
  }
  return port;
}

main().catch((error) => {
  console.error("[DeskHub] Startup failed:", errorMessage(error)); process.exitCode = 1;
}).finally(async () => {
  controller.abort();
  await Promise.all([manager.stop(), raceServer.close()]);
  process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
});
