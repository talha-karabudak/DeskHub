import type { DeskHubEvent } from "./types.ts";

interface QueuedEvent { event: DeskHubEvent; sequence: number }

export class PixooEventQueue {
  private readonly entries: QueuedEvent[] = [];
  private sequence = 0;

  get length(): number { return this.entries.length; }

  has(predicate: (event: DeskHubEvent) => boolean): boolean {
    return this.entries.some(({ event }) => predicate(event));
  }

  enqueue(event: DeskHubEvent): void {
    if (!Number.isFinite(event.priority)) throw new Error("event priority must be finite");
    if (!Number.isFinite(event.durationMs) || event.durationMs < 0) {
      throw new Error("event durationMs must be a non-negative finite number");
    }
    this.entries.push({ event, sequence: this.sequence++ });
  }

  dequeue(predicate: (event: DeskHubEvent) => boolean = () => true): DeskHubEvent | undefined {
    if (this.entries.length === 0) return undefined;
    let best = -1;
    for (let index = 0; index < this.entries.length; index++) {
      const candidate = this.entries[index];
      if (!predicate(candidate.event)) continue;
      if (best === -1) { best = index; continue; }
      const current = this.entries[best];
      if (candidate.event.priority > current.event.priority ||
          (candidate.event.priority === current.event.priority && candidate.sequence < current.sequence)) {
        best = index;
      }
    }
    if (best === -1) return undefined;
    return this.entries.splice(best, 1)[0].event;
  }

  remove(predicate: (event: DeskHubEvent) => boolean): DeskHubEvent[] {
    const removed: DeskHubEvent[] = [];
    for (let index = this.entries.length - 1; index >= 0; index--) {
      if (predicate(this.entries[index].event)) removed.unshift(this.entries.splice(index, 1)[0].event);
    }
    return removed;
  }
}
