import assert from "node:assert/strict";
import test from "node:test";
import { FaceitPoller } from "../src/integrations/faceit/poller.ts";
import { DeskHubCore } from "../src/core/deskhub-core.ts";
import type { PixooDisplay } from "../src/pixoo-display.ts";

const display: PixooDisplay = { async getStatus() { return { status: "ok", connected: true, device_address: "x", serial_port: "x" }; },
  async setBrightness() {}, async showText() {}, async showFrame() {} };
const source = { async latestResult() { return null; } };

test("adaptive poller uses active interval when process hint is active", async () => {
  const poller = new FaceitPoller(source, new DeskHubCore(display), { activeIntervalMs: 60_000, idleIntervalMs: 300_000,
    activityHint: { async isActive() { return true; } } });
  assert.equal(await poller.nextIntervalMs(), 60_000);
});

test("adaptive poller still schedules idle reconciliation when hint is false", async () => {
  const poller = new FaceitPoller(source, new DeskHubCore(display), { activeIntervalMs: 60_000, idleIntervalMs: 300_000,
    activityHint: { async isActive() { return false; } } });
  assert.equal(await poller.nextIntervalMs(), 300_000);
});
