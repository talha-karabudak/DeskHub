import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { DeskHubCore } from "./core/deskhub-core.ts";
import { FaceitApiClient } from "./integrations/faceit/api-client.ts";
import { loadFaceitConfig } from "./integrations/faceit/config.ts";
import { FaceitEventAdapter } from "./integrations/faceit/faceit-event-adapter.ts";
import { faceitIdleView } from "./integrations/faceit/idle-view.ts";
import { faceitPlacementIdleView } from "./integrations/faceit/idle-view.ts";
import { HttpPixooDisplay } from "./pixoo-display.ts";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);

async function main(): Promise<void> {
  const delta = Number(process.argv[2] ?? "25");
  const placementDemo = process.argv[3] === "placement";
  const level10Demo = process.argv[3] === "level10";
  const allLevelsDemo = process.argv[3] === "levels";
  if (!Number.isInteger(delta)) throw new Error("Demo ELO delta must be an integer");
  const config = loadFaceitConfig();
  const player = await new FaceitApiClient({ apiKey: config.apiKey, timeoutMs: config.requestTimeoutMs })
    .getPlayerByNickname(config.nickname);
  const level = player.games.cs2?.skill_level;
  const placement = { played: 4, wins: 3, losses: 1, total: 10 };
  if (allLevelsDemo) {
    console.log("[FACEIT] Level badge preview: 1 -> 10");
    for (let previewLevel = 1; previewLevel <= 10; previewLevel++) {
      console.log(`[FACEIT] Preview level ${previewLevel}`);
      await new DeskHubCore(new HttpPixooDisplay(), undefined, () => faceitIdleView(previewLevel)).showNormal();
    }
    return;
  }
  const core = new DeskHubCore(new HttpPixooDisplay(), undefined, () => placementDemo
    ? faceitPlacementIdleView(placement) : faceitIdleView(level10Demo ? 10 : level));
  if (level10Demo) { console.log("[FACEIT] Level 10 static badge demo"); await core.showNormal(); return; }
  const sequence = new FaceitEventAdapter().toEvents({ matchId: `visual-demo-${Date.now()}`,
    won: delta >= 0, eloBefore: 887 - delta, eloAfter: placementDemo ? null : 887,
    eloDelta: placementDemo ? null : delta, finishedAt: new Date().toISOString(),
    phase: placementDemo ? "placement" : "ranked", placement: placementDemo ? placement : null });
  if (!sequence) throw new Error("Demo event could not be created");
  console.log(placementDemo
    ? `[FACEIT] Placement demo: ${delta >= 0 ? "VICTORY" : "LOSS"} -> ${placement.played}/${placement.total} -> placement idle`
    : `[FACEIT] Ranked demo: ${delta >= 0 ? "VICTORY" : "LOSS"} -> ${delta >= 0 ? "+" : ""}${delta} -> level badge`);
  core.enqueueMany(sequence);
  await core.whenIdle();
  console.log("[FACEIT] Visual demo complete");
}

main().catch((error) => { console.error("[DeskHub] Demo failed:", error instanceof Error ? error.message : error); process.exitCode = 1; });
