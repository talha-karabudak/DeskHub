import type { IRacingTelemetry, IRacingTelemetrySource } from "./types.ts";

export class FakeIRacingTelemetrySource implements IRacingTelemetrySource {
  private readonly sequence: readonly IRacingTelemetry[];
  private readonly delayMs: number;
  constructor(sequence: readonly IRacingTelemetry[], delayMs = 0) {
    this.sequence = sequence;
    this.delayMs = delayMs;
  }

  async *snapshots(): AsyncIterable<IRacingTelemetry> {
    for (const snapshot of this.sequence) {
      if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      yield { ...snapshot };
    }
  }
}
