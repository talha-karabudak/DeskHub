import assert from "node:assert/strict";
import test from "node:test";
import { UnifiedModeManager } from "../src/core/mode-manager.ts";
import { events } from "../src/core/events.ts";
import { pixooDefaults } from "../src/integrations/iracing/pixoo-settings.ts";
import type { DeskHubEvent } from "../src/core/types.ts";
import type { DisplayStatus, PixooDisplay, ShowTextOptions } from "../src/pixoo-display.ts";

class FakeDisplay implements PixooDisplay {
  readonly texts: string[] = [];
  readonly frames: number[][] = [];
  async getStatus(): Promise<DisplayStatus> { return { status: "ok", connected: true, device_address: "test", serial_port: "COM1" }; }
  async setBrightness(): Promise<void> {}
  async showFrame(pixels: number[]): Promise<void> { this.frames.push(pixels); }
  async showText(text: string, _options?: ShowTextOptions): Promise<void> { this.texts.push(text); }
}

const activeRace = { connected: true, sessionActive: true, sessionId: "race", position: 7 } as const;
const disconnected = { connected: false } as const;
const event = (id: string, mode: "normal" | "faceit" | "iracing"): DeskHubEvent => ({
  id, type: id, mode, priority: 50, durationMs: 0, view: { kind: "text", text: id },
});

function setup() {
  const display = new FakeDisplay();
  const logs: string[] = [];
  const manager = new UnifiedModeManager(display, {
    normalView: () => ({ kind: "text", text: "1200" }),
    faceitView: () => ({ kind: "text", text: "LVL8" }),
    sleep: async () => {},
    log: (line) => logs.push(line),
  });
  return { display, logs, manager };
}

test("iPad selections hide position, lap cards and spotter while keeping PB", async () => {
  const { display, manager } = setup();
  manager.setPixooSettings({ ...pixooDefaults, position: false, lap: false, spotter: false });
  manager.onIRacingTelemetry({ ...activeRace, carLeftRight: 2 });
  await manager.setUrgentOverlay({ kind: "text", text: "SPOTTER" });
  manager.enqueueMany([events.lap(), events.positionGained(6), events.personalBest()]);
  await manager.whenIdle();
  assert.deepEqual(display.texts, ["PB"]);
  assert.ok(display.frames.length > 0);
  assert.ok(display.frames.every((frame) => frame.every((pixel) => pixel === 0)));
  manager.setPixooSettings(pixooDefaults);
  manager.onIRacingTelemetry(activeRace);
  await manager.setUrgentOverlay(undefined);
  await manager.whenIdle();
  assert.equal(display.texts.at(-1), "P7");
});

test("mode selection follows IRACING > FACEIT > NORMAL", async () => {
  const { manager } = setup();
  assert.equal(manager.currentMode, "normal");
  manager.setFaceitActive(true);
  assert.equal(manager.currentMode, "faceit");
  manager.onIRacingTelemetry(activeRace);
  assert.equal(manager.currentMode, "iracing");
  manager.setFaceitActive(false);
  assert.equal(manager.currentMode, "iracing");
  manager.onIRacingTelemetry(disconnected);
  assert.equal(manager.currentMode, "normal");
  await manager.whenIdle();
});

test("all six mode transitions select the current idle without duplicate loops", async () => {
  const { display, logs, manager } = setup();
  manager.setFaceitActive(true); // NORMAL -> FACEIT
  manager.setFaceitActive(false); // FACEIT -> NORMAL
  manager.onIRacingTelemetry(activeRace); // NORMAL -> IRACING
  manager.onIRacingTelemetry(disconnected); // IRACING -> NORMAL
  manager.setFaceitActive(true); manager.onIRacingTelemetry(activeRace); // FACEIT -> IRACING
  manager.onIRacingTelemetry(disconnected); // IRACING -> FACEIT
  await manager.whenIdle();
  assert.deepEqual(logs.filter((line) => line.startsWith("[MODE]")), [
    "[MODE] NORMAL -> FACEIT", "[MODE] FACEIT -> NORMAL", "[MODE] NORMAL -> IRACING",
    "[MODE] IRACING -> NORMAL", "[MODE] NORMAL -> FACEIT", "[MODE] FACEIT -> IRACING",
    "[MODE] IRACING -> FACEIT",
  ]);
  assert.equal(manager.currentMode, "faceit");
  assert.equal(display.texts.at(-1), "LVL8");
});

test("a mode transition replaces an idle write that was already in flight", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  class BlockingDisplay extends FakeDisplay {
    private first = true;
    override async showText(text: string, options?: ShowTextOptions): Promise<void> {
      await super.showText(text, options);
      if (this.first) { this.first = false; await blocked; }
    }
  }
  const display = new BlockingDisplay();
  const manager = new UnifiedModeManager(display, {
    normalView: () => ({ kind: "text", text: "1200" }),
    faceitView: () => ({ kind: "text", text: "LVL8" }),
    sleep: async () => {}, log: () => {},
  });
  const initial = manager.core.showNormal();
  await Promise.resolve();
  manager.setFaceitActive(true);
  release();
  await initial; await manager.whenIdle();
  assert.deepEqual(display.texts, ["1200", "LVL8"]);
});

test("events restore the current mode idle", async () => {
  const normal = setup();
  normal.manager.enqueueMany([event("NORMAL-EVENT", "normal")]);
  await normal.manager.whenIdle();
  assert.deepEqual(normal.display.texts, ["NORMAL-EVENT", "1200"]);

  const faceit = setup();
  faceit.manager.setFaceitActive(true); await faceit.manager.whenIdle(); faceit.display.texts.length = 0;
  assert.equal(await faceit.manager.deliver([event("WIN", "faceit")]), true);
  await faceit.manager.whenIdle();
  assert.deepEqual(faceit.display.texts, ["WIN", "LVL8"]);

  const iracing = setup();
  iracing.manager.onIRacingTelemetry(activeRace); await iracing.manager.whenIdle(); iracing.display.texts.length = 0;
  iracing.manager.enqueueMany([event("PB", "iracing")]);
  await iracing.manager.whenIdle();
  assert.deepEqual(iracing.display.texts, ["PB", "P7"]);
});

test("FACEIT delivery is deferred during a race and released exactly once afterwards", async () => {
  const { display, logs, manager } = setup();
  manager.setFaceitActive(true);
  manager.onIRacingTelemetry(activeRace);
  await manager.whenIdle(); display.texts.length = 0;
  let settled = false;
  const delivery = manager.deliver([event("WIN", "faceit")]).then((value) => { settled = true; return value; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(display.texts.includes("WIN"), false);
  manager.onIRacingTelemetry(disconnected);
  assert.equal(await delivery, true);
  await manager.whenIdle();
  assert.equal(display.texts.filter((text) => text === "WIN").length, 1);
  assert.equal(display.texts.at(-1), "LVL8");
  assert.ok(logs.includes("[FACEIT] Event deferred"));
  assert.ok(logs.includes("[FACEIT] Releasing deferred result"));
  assert.equal(await manager.deliver([event("WIN", "faceit")]), true);
  assert.equal(display.texts.filter((text) => text === "WIN").length, 1);
});

test("iRacing disconnect clears urgent overlay and returns to the selected idle", async () => {
  const { display, manager } = setup();
  manager.onIRacingTelemetry({ ...activeRace, carLeftRight: 2 });
  await manager.whenIdle();
  const beforeOverlay = display.frames.length;
  await manager.setUrgentOverlay({ kind: "frame", pixels: new Array(768).fill(99), label: "LEFT" });
  assert.equal(display.frames.length, beforeOverlay + 1);
  manager.onIRacingTelemetry(disconnected);
  await manager.whenIdle();
  assert.equal(manager.currentMode, "normal");
  assert.equal(display.texts.at(-1), "1200");
});

test("shutdown resolves a deferred FACEIT delivery without leaving work running", async () => {
  const { manager } = setup();
  manager.onIRacingTelemetry(activeRace);
  const delivery = manager.deliver([event("LOSS", "faceit")]);
  await manager.stop();
  assert.equal(await delivery, false);
});
