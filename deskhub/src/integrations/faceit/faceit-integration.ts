import type { DeskHubCore } from "../../core/deskhub-core.ts";
import { FaceitEventAdapter } from "./faceit-event-adapter.ts";
import type { FaceitMatchSource } from "./types.ts";

export class FaceitIntegration {
  private readonly source: FaceitMatchSource;
  private readonly core: DeskHubCore;
  private readonly adapter: FaceitEventAdapter;

  constructor(
    source: FaceitMatchSource,
    core: DeskHubCore,
    adapter = new FaceitEventAdapter(),
  ) {
    this.source = source;
    this.core = core;
    this.adapter = adapter;
  }

  async pollOnce(): Promise<boolean> {
    const result = await this.source.latestResult();
    if (!result) return false;
    const events = this.adapter.toEvents(result);
    if (!events) return false;
    this.core.enqueueMany(events);
    return true;
  }
}
