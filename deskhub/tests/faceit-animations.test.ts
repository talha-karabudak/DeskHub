import assert from "node:assert/strict";
import test from "node:test";
import { lossAnimation, revealTextAnimation, victoryAnimation } from "../src/integrations/faceit/animations.ts";
import { faceitIdleView } from "../src/integrations/faceit/idle-view.ts";

for (const [name, animation] of [["victory", victoryAnimation()], ["loss", lossAnimation()],
  ["delta", revealTextAnimation("+25", [0, 255, 0])]] as const) {
  test(`${name} animation contains valid 16x16 RGB frames`, () => {
    assert.ok(animation.frames.length >= 3);
    assert.ok(animation.frames.every((frame) => frame.length === 768 && frame.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)));
  });
}

test("level 10 idle has smooth pulse steps, readable digits, and stable orange accents", () => {
  const view = faceitIdleView(10);
  assert.equal(view.kind, "animation");
  assert.equal(view.frames.length, 13);
  assert.equal(view.frameDurationMs, 0);
  assert.ok(view.frames.every((frame) => frame.some((value, index) => index % 3 === 0 && value === 255)));
  assert.ok(view.frames.every((frame) => frame.some((value, index) => index % 3 === 1 && value === 125)));
  assert.notDeepEqual(view.frames[0], view.frames[6]);
});
