import type { PixooTextView } from "./types.ts";

export function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}${minutes}`;
}

export class NormalModeClock {
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  view(): PixooTextView {
    return {
      kind: "text",
      text: formatClock(this.now()),
      color: [0, 160, 255],
    };
  }
}
