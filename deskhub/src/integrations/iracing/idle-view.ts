import type { PixooView } from "../../core/types.ts";
import { blueFlagAnimation, spotterFrame, yellowFlagAnimation } from "./animations.ts";

export function iracingIdleView(position: number | undefined, carLeftRight?: number,
  yellowFlag = false, blueFlag = false): PixooView {
  if (yellowFlag) return yellowFlagAnimation();
  if (blueFlag) return blueFlagAnimation();
  if (carLeftRight !== undefined && carLeftRight >= 2 && carLeftRight <= 6) return spotterFrame(carLeftRight);
  return position && position > 0
    ? { kind: "text", text: `P${position}`, color: [0, 200, 255], scroll: false }
    : { kind: "text", text: "RDY", color: [0, 160, 255], scroll: false };
}
