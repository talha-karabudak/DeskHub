import assert from "node:assert/strict";
import test from "node:test";
import { faceitIdleView, levelColor } from "../src/integrations/faceit/idle-view.ts";

test("FACEIT idle view shows the last known level", () => {
  const view = faceitIdleView(8);
  assert.equal(view.kind, "frame");
  assert.equal(view.label, "LEVEL 8");
  assert.equal(view.pixels.length, 768);
  assert.ok(view.pixels.some((channel) => channel > 0));
});

test("level color becomes redder toward level 10", () => {
  const level8 = levelColor(8);
  const level9 = levelColor(9);
  const level10 = levelColor(10);
  assert.ok(level8[0] < level9[0]);
  assert.ok(level9[0] < level10[0]);
  assert.deepEqual(level10, [255, 0, 0]);
});
