import assert from "node:assert/strict";
import test from "node:test";
import { blueFlagAnimation, lapDeltaCard, lapTimeCard, spotterFrame, startLightAnimation, yellowFlagAnimation }
  from "../src/integrations/iracing/animations.ts";

const validFrame = (frame: number[]): boolean => frame.length === 768
  && frame.every((value) => Number.isInteger(value) && value >= 0 && value <= 255);

test("yellow flag flashes the full display", () => {
  const animation = yellowFlagAnimation();
  assert.ok(animation.frames.every(validFrame));
  assert.ok(animation.frames.some((frame) => frame.every((value, index) => value === [255, 180, 0][index % 3])));
  assert.ok(animation.frames.some((frame) => frame.every((value) => value === 0)));
});

test("blue flag, start lights and spotter frames are valid", () => {
  assert.ok(blueFlagAnimation().frames.every(validFrame));
  assert.ok(startLightAnimation("ready").frames.every(validFrame));
  assert.ok(startLightAnimation("set").frames.every(validFrame));
  assert.ok(startLightAnimation("go").frames.every(validFrame));
  for (const state of [2, 3, 4, 5, 6]) assert.ok(validFrame(spotterFrame(state).pixels));
  assert.ok(lapTimeCard(83.45).frames.every(validFrame));
  assert.ok(lapDeltaCard(-0.6).frames.every(validFrame));
  assert.ok(lapDeltaCard(0.31).frames.every(validFrame));
});
