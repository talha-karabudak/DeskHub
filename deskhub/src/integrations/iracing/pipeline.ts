import type { DeskHubCore } from "../../core/deskhub-core.ts";
import { IRacingEventAdapter } from "./event-adapter.ts";
import { IRacingEventDetector } from "./event-detector.ts";
import type { IRacingTelemetrySource } from "./types.ts";

export class IRacingPipeline {
  private position: number | undefined;
  private readonly source: IRacingTelemetrySource;
  private readonly core: DeskHubCore;
  private readonly detector: IRacingEventDetector;
  private readonly adapter: IRacingEventAdapter;
  constructor(
    source: IRacingTelemetrySource,
    core: DeskHubCore,
    detector = new IRacingEventDetector(),
    adapter = new IRacingEventAdapter(),
  ) {
    this.source = source;
    this.core = core;
    this.detector = detector;
    this.adapter = adapter;
  }

  getCurrentPosition(): number | undefined { return this.position; }

  async run(): Promise<void> {
    for await (const snapshot of this.source.snapshots()) {
      const wasConnected = this.position !== undefined;
      const events = this.detector.update(snapshot);
      if (!snapshot.connected || !snapshot.sessionActive) {
        this.position = undefined;
        if (wasConnected) await this.core.showNormal();
        continue;
      }
      const changed = snapshot.position !== this.position;
      this.position = snapshot.position;
      const deskHubEvents = events.map((event) => this.adapter.toDeskHub(event)).filter((event) => event !== undefined);
      if (deskHubEvents.length > 0) {
        this.core.enqueueMany(deskHubEvents);
        await this.core.whenIdle();
      } else if (changed) {
        await this.core.showNormal();
      }
    }
  }
}
