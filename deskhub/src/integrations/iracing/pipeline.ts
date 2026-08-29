import type { DeskHubCore } from "../../core/deskhub-core.ts";
import { spotterFrame } from "./animations.ts";
import { IRacingEventAdapter } from "./event-adapter.ts";
import { IRacingEventDetector } from "./event-detector.ts";
import type { IRacingTelemetrySource } from "./types.ts";

export class IRacingPipeline {
  private position: number | undefined;
  private carLeftRight: number | undefined;
  private yellowFlag = false;
  private blueFlag = false;
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
  getCarLeftRight(): number | undefined { return this.carLeftRight; }
  getYellowFlag(): boolean { return this.yellowFlag; }
  getBlueFlag(): boolean { return this.blueFlag; }

  async run(): Promise<void> {
    for await (const snapshot of this.source.snapshots()) {
      const wasConnected = this.position !== undefined;
      const events = this.detector.update(snapshot);
      const deskHubEvents = events.flatMap((event) => this.adapter.toDeskHub(event));
      if (!snapshot.connected || !snapshot.sessionActive) {
        const hadSpotter = isSpotterActive(this.carLeftRight);
        this.position = undefined;
        this.carLeftRight = undefined;
        this.yellowFlag = false;
        this.blueFlag = false;
        if (hadSpotter) await this.core.setUrgentOverlay(undefined);
        if (deskHubEvents.length > 0) {
          this.core.enqueueMany(deskHubEvents);
        } else if (wasConnected) this.core.requestNormal();
        continue;
      }
      const spotterChanged = snapshot.carLeftRight !== this.carLeftRight;
      const changed = snapshot.position !== this.position
        || Boolean(snapshot.yellowFlag) !== this.yellowFlag || Boolean(snapshot.blueFlag) !== this.blueFlag;
      this.position = snapshot.position;
      this.carLeftRight = snapshot.carLeftRight;
      this.yellowFlag = Boolean(snapshot.yellowFlag);
      this.blueFlag = Boolean(snapshot.blueFlag);
      if (spotterChanged) {
        await this.core.setUrgentOverlay(isSpotterActive(this.carLeftRight)
          ? spotterFrame(this.carLeftRight!) : undefined);
      }
      if (deskHubEvents.length > 0) {
        this.core.enqueueMany(deskHubEvents);
      } else if (changed || this.yellowFlag || this.blueFlag) {
        this.core.requestNormal();
      }
    }
    await this.core.whenIdle();
  }
}

function isSpotterActive(value: number | undefined): boolean {
  return value !== undefined && value >= 2 && value <= 6;
}
