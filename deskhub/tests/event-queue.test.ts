import assert from "node:assert/strict";
import test from "node:test";
import { PixooEventQueue } from "../src/core/event-queue.ts";
import type { DeskHubEvent } from "../src/core/types.ts";

function makeEvent(id: string, priority: number): DeskHubEvent {
  return { id, type: id, mode: "normal", priority, durationMs: 0,
    view: { kind: "text", text: id } };
}

test("higher priority is dequeued first", () => {
  const queue = new PixooEventQueue();
  queue.enqueue(makeEvent("low", 10)); queue.enqueue(makeEvent("high", 100)); queue.enqueue(makeEvent("medium", 50));
  assert.equal(queue.dequeue()?.id, "high");
  assert.equal(queue.dequeue()?.id, "medium");
  assert.equal(queue.dequeue()?.id, "low");
});

test("equal priority preserves FIFO order", () => {
  const queue = new PixooEventQueue();
  queue.enqueue(makeEvent("first", 50)); queue.enqueue(makeEvent("second", 50));
  assert.equal(queue.dequeue()?.id, "first"); assert.equal(queue.dequeue()?.id, "second");
});
