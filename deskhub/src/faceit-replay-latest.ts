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
  const config = loadFaceitConfig();
  const client = new FaceitApiClient({ apiKey: config.apiKey, timeoutMs: config.requestTimeoutMs });
  const player = await client.getPlayerByNickname(config.nickname);
  const latest = (await client.getMatchHistory(player.player_id)).items[0];
  if (!latest) throw new Error("No completed FACEIT match found");
  const faction = Object.entries(latest.teams)
    .find(([, team]) => team.players.some((member) => member.player_id === player.player_id))?.[0];
  if (!faction) throw new Error("Player is absent from the latest match");
  const won = latest.results.winner === faction;
  const elo = player.games.cs2?.faceit_elo;
  if (!Number.isInteger(elo)) throw new Error("Player has no CS2 ELO");

  const display = new HttpPixooDisplay();
  const level = player.games.cs2?.skill_level;
  const core = new DeskHubCore(display, undefined, () => faceitIdleView(level));
  const event = new FaceitEventAdapter().toEvent({
    matchId: latest.match_id, won, eloBefore: elo!, eloAfter: null, eloDelta: null,
    finishedAt: new Date(latest.finished_at * 1000).toISOString(),
  });
  if (!event) throw new Error("Latest match could not be converted to an event");
  console.log(`[FACEIT] Replaying latest match ${latest.match_id}: ${won ? "WIN" : "LOSS"}`);
  core.enqueue(event);
  await core.whenIdle();
  console.log("[FACEIT] Replay complete; normal screen restored");
}

main().catch((error) => {
  console.error("[DeskHub] Replay failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
