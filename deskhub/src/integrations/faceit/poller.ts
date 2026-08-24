import type { DeskHubCore } from "../../core/deskhub-core.ts";
import type { FaceitMatchSource } from "./types.ts";
import { FaceitIntegration } from "./faceit-integration.ts";
import { FaceitApiError } from "./api-client.ts";

export class FaceitPoller {
  private readonly integration: FaceitIntegration;
  private readonly intervalMs: number;

  constructor(source: FaceitMatchSource, core: DeskHubCore, intervalMs: number) {
    this.integration = new FaceitIntegration(source, core);
    this.intervalMs = intervalMs;
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.integration.pollOnce();
      } catch (error) {
        if (error instanceof FaceitApiError && [401, 403, 404].includes(error.status ?? 0)) throw error;
        console.error("[FACEIT] Poll failed:", error instanceof Error ? error.message : error);
      }
      if (!signal.aborted) await this.waitForNextPoll(signal);
    }
  }

  private async waitForNextPoll(signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, this.intervalMs);
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}
