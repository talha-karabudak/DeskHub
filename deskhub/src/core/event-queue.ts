import type { DeskHubEvent } from "./types.ts";

interface QueuedEvent { event: DeskHubEvent; sequence: number }

export class PixooEventQueue {
  private readonly entries: QueuedEvent[] = [];
  private sequence = 0;

  get length(): number { return this.entries.length; }

  enqueue(event: DeskHubEvent): void {
    if (!Number.isFinite(event.priority)) throw new Error("event priority must be finite");
    if (!Number.isFinite(event.durationMs) || event.durationMs < 0) {
      throw new Error("event durationMs must be a non-negative finite number");
    }
    this.entries.push({ event, sequence: this.sequence++ });
  }

  dequeue(): DeskHubEvent | undefined {
    if (this.entries.length === 0) return undefined;
    let best = 0;
    for (let index = 1; index < this.entries.length; index++) {
      const candidate = this.entries[index];
      const current = this.entries[best];
      if (candidate.event.priority > current.event.priority ||
          (candidate.event.priority === current.event.priority && candidate.sequence < current.sequence)) {
        best = index;
      }
    }
    return this.entries.splice(best, 1)[0].event;
  }
}
