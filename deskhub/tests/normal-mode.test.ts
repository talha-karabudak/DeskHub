import assert from "node:assert/strict";
import test from "node:test";
import { formatClock, NormalModeClock } from "../src/core/normal-mode.ts";

test("clock is rendered as four pixels-font characters", () => {
  const date = new Date(2026, 7, 23, 9, 5);
  assert.equal(formatClock(date), "0905");
  const clock = new NormalModeClock(() => date);
  assert.deepEqual(clock.view(), {
    kind: "text",
    text: "0905",
    color: [0, 160, 255],
  });
});
