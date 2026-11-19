import type { DeskHubEvent } from "../../core/types.ts";
import { FaceitEventAdapter } from "./faceit-event-adapter.ts";
import type { FaceitMatchSource } from "./types.ts";

export interface FaceitEventSink {
  /** True means all event writes completed, not merely an in-memory enqueue. */
  deliver(events: DeskHubEvent[]): Promise<boolean>;
}

export class FaceitIntegration {
  private readonly source: FaceitMatchSource;
  private readonly core: FaceitEventSink;
  private readonly adapter: FaceitEventAdapter;
  private inFlight: Promise<boolean> | undefined;

  constructor(
    source: FaceitMatchSource,
    core: FaceitEventSink,
    adapter = new FaceitEventAdapter(),
  ) {
    this.source = source;
    this.core = core;
    this.adapter = adapter;
  }

  pollOnce(): Promise<boolean> {
    this.inFlight ??= this.deliverLatest().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  private async deliverLatest(): Promise<boolean> {
    const result = await this.source.latestResult();
    if (!result) return false;
    const events = this.adapter.toEvents(result);
    if (!events) return false;
    try {
      if (!await this.core.deliver(events)) {
        this.adapter.release(result.matchId);
        return false;
      }
      await this.source.acknowledge?.(result.matchId);
      return true;
    } catch (error) {
      this.adapter.release(result.matchId);
      throw error;
    }
  }
}
