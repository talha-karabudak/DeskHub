import type { DeskHubCore } from "../../core/deskhub-core.ts";
import type { FaceitMatchSource } from "./types.ts";
import { FaceitIntegration } from "./faceit-integration.ts";
import { FaceitApiError } from "./api-client.ts";
import type { FaceitActivityHint } from "./activity-hint.ts";

export interface FaceitPollerOptions {
  activeIntervalMs: number;
  idleIntervalMs: number;
  activityHint: FaceitActivityHint;
  log?: (message: string) => void;
}

export class FaceitPoller {
  private readonly integration: FaceitIntegration;
  private readonly options: FaceitPollerOptions;

  constructor(source: FaceitMatchSource, core: DeskHubCore, options: FaceitPollerOptions) {
    this.integration = new FaceitIntegration(source, core);
    this.options = options;
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.integration.pollOnce();
      } catch (error) {
        if (error instanceof FaceitApiError && [401, 403, 404].includes(error.status ?? 0)) throw error;
        console.error("[FACEIT] Poll failed:", error instanceof Error ? error.message : error);
      }
      if (!signal.aborted) await this.waitForNextPoll(signal, await this.nextIntervalMs());
    }
  }

  async nextIntervalMs(): Promise<number> {
    const active = await this.options.activityHint.isActive();
    const interval = active ? this.options.activeIntervalMs : this.options.idleIntervalMs;
    this.options.log?.(`Activity hint: ${active ? "active" : "idle"}; next poll in ${interval}ms`);
    return interval;
  }

  private async waitForNextPoll(signal: AbortSignal, intervalMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMs);
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}
