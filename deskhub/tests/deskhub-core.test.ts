import assert from "node:assert/strict";
import test from "node:test";
import { DeskHubCore } from "../src/core/deskhub-core.ts";
import type { DeskHubEvent } from "../src/core/types.ts";
import type { DisplayStatus, PixooDisplay, ShowTextOptions } from "../src/pixoo-display.ts";

class FakeDisplay implements PixooDisplay {
  readonly calls: string[] = [];
  readonly frames: number[][] = [];
  async getStatus(): Promise<DisplayStatus> {
    return { status: "ok", connected: true, device_address: "test", serial_port: "COM1" };
  }
  async setBrightness(_value: number): Promise<void> {}
  async showFrame(pixels: number[]): Promise<void> { this.frames.push(pixels); }
  async showText(text: string, _options?: ShowTextOptions): Promise<void> { this.calls.push(text); }
}

function makeEvent(id: string, priority: number): DeskHubEvent {
  return { id, type: id, mode: "iracing", priority, durationMs: 0,
    view: { kind: "text", text: id } };
}

test("core processes priority order and returns to READY", async () => {
  const display = new FakeDisplay();
  const core = new DeskHubCore(display, async () => {});
  core.enqueueMany([makeEvent("PB", 50), makeEvent("YELLOW", 100), makeEvent("WIN", 70)]);
  await core.whenIdle();
  assert.deepEqual(display.calls, ["YELLOW", "WIN", "PB", "RDY"]);
  assert.equal(core.state.mode, "normal");
  assert.equal(core.state.processing, false);
  assert.equal(core.state.queueLength, 0);
});

test("urgent overlay suppresses an event animation until it clears", async () => {
  const display = new FakeDisplay();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let firstSleep = true;
  const core = new DeskHubCore(display, async () => {
    if (firstSleep) { firstSleep = false; await blocked; }
  });
  const baseA = new Array(768).fill(10);
  const baseB = new Array(768).fill(20);
  const overlay = new Array(768).fill(99);
  core.enqueue({ id: "animation", type: "animation", mode: "iracing", priority: 50, durationMs: 0,
    view: { kind: "animation", frames: [baseA, baseB], frameDurationMs: 100, label: "animation" } });
  await Promise.resolve();
  await Promise.resolve();
  await core.setUrgentOverlay({ kind: "frame", pixels: overlay, label: "SPOTTER_LEFT" });
  release();
  await core.whenIdle();
  assert.deepEqual(display.frames, [baseA, overlay]);
  await core.setUrgentOverlay(undefined);
  assert.equal(display.calls.at(-1), "RDY");
});

test("custom normal view is restored after events", async () => {
  const display = new FakeDisplay();
  const core = new DeskHubCore(
    display,
    async () => {},
    () => ({ kind: "text", text: "1234", color: [0, 160, 255] }),
  );
  core.enqueue(makeEvent("PB", 50));
  await core.whenIdle();
  assert.deepEqual(display.calls, ["PB", "1234"]);
  assert.equal(core.state.pixoo.screen, "1234");
});
