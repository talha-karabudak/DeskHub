import { DeskHubCore } from "./core/deskhub-core.ts";
import { NormalModeClock } from "./core/normal-mode.ts";
import { FaceitIntegration } from "./integrations/faceit/faceit-integration.ts";
import type { FaceitMatchResult, FaceitMatchSource } from "./integrations/faceit/types.ts";
import { HttpPixooDisplay } from "./pixoo-display.ts";

class SimulatedFaceitSource implements FaceitMatchSource {
  private delivered = false;
  async latestResult(): Promise<FaceitMatchResult> {
    this.delivered = true;
    return {
      matchId: "simulation-match-1",
      won: true,
      eloBefore: 1620,
      eloAfter: 1644,
      eloDelta: 24,
      finishedAt: new Date().toISOString(),
    };
  }
  get wasPolled(): boolean { return this.delivered; }
}

const pixoo = new HttpPixooDisplay();
console.log("Bridge status:", await pixoo.getStatus());
const normal = new NormalModeClock();
const core = new DeskHubCore(pixoo, undefined, () => normal.view());
const source = new SimulatedFaceitSource();
const faceit = new FaceitIntegration(source, core);

await core.showNormal();
await new Promise((resolve) => setTimeout(resolve, 1500));
console.log("First poll enqueued:", await faceit.pollOnce());
console.log("Duplicate poll enqueued:", await faceit.pollOnce());
await core.whenIdle();
console.log("Milestone 5 complete:", { sourcePolled: source.wasPolled, state: core.state });
