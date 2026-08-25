import type { PixooTextView } from "../../core/types.ts";

export function iracingIdleView(position: number | undefined): PixooTextView {
  return position && position > 0
    ? { kind: "text", text: `P${position}`, color: [0, 200, 255], scroll: false }
    : { kind: "text", text: "RDY", color: [0, 160, 255], scroll: false };
}
