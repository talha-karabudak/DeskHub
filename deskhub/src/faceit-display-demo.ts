import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { DeskHubCore } from "./core/deskhub-core.ts";
import { FaceitApiClient } from "./integrations/faceit/api-client.ts";
import { loadFaceitConfig } from "./integrations/faceit/config.ts";
import { FaceitEventAdapter } from "./integrations/faceit/faceit-event-adapter.ts";
import { faceitIdleView } from "./integrations/faceit/idle-view.ts";
import { HttpPixooDisplay } from "./pixoo-display.ts";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);

async function main(): Promise<void> {
  const delta = Number(process.argv[2] ?? "25");
  if (!Number.isInteger(delta)) throw new Error("Demo ELO delta must be an integer");
  const config = loadFaceitConfig();
  const player = await new FaceitApiClient({ apiKey: config.apiKey, timeoutMs: config.requestTimeoutMs })
    .getPlayerByNickname(config.nickname);
  const level = player.games.cs2?.skill_level;
  const core = new DeskHubCore(new HttpPixooDisplay(), undefined, () => faceitIdleView(level));
  const sequence = new FaceitEventAdapter().toEvents({ matchId: `visual-demo-${Date.now()}`,
    won: delta >= 0, eloBefore: 887 - delta, eloAfter: 887, eloDelta: delta, finishedAt: new Date().toISOString() });
  if (!sequence) throw new Error("Demo event could not be created");
  console.log(`[FACEIT] Visual demo: ${delta >= 0 ? "WIN" : "LOSS"} -> ${delta >= 0 ? "+" : ""}${delta} -> level badge`);
  core.enqueueMany(sequence);
  await core.whenIdle();
  console.log("[FACEIT] Visual demo complete");
}

main().catch((error) => { console.error("[DeskHub] Demo failed:", error instanceof Error ? error.message : error); process.exitCode = 1; });
