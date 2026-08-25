import type { PixooAnimationView } from "../../core/types.ts";
import type { FaceitPlacementState } from "./types.ts";
import { revealTextAnimation } from "./animations.ts";

export function levelColor(level: number): [number, number, number] {
  const normalized = Math.max(1, Math.min(10, level));
  const progress = (normalized - 1) / 9;
  return [Math.round(255 * progress), Math.round(220 * (1 - progress)), 0];
}

const DIGITS: Record<string, string[]> = {
  "1": ["010", "110", "010", "010", "111"], "2": ["110", "001", "010", "100", "111"],
  "3": ["110", "001", "010", "001", "110"], "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "110", "001", "110"], "6": ["011", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"], "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "110"], "0": ["111", "101", "101", "101", "111"],
};

function badgeFrame(level: number, intensity: number): number[] {
  const safeLevel = Math.max(1, Math.min(10, level));
  const pixels = new Array<number>(16 * 16 * 3).fill(0);
  const base = levelColor(safeLevel);
  const ring: [number, number, number] = base.map((channel) => Math.round(channel * intensity)) as [number, number, number];
  const set = (x: number, y: number, color: [number, number, number]) => {
    const offset = (y * 16 + x) * 3; pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2];
  };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const distance = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2);
    if (distance >= 6.2 && distance <= 7.5) set(x, y, ring);
    else if (distance < 6.2) set(x, y, [18, 8, 4]);
  }
  const text = String(safeLevel);
  // Both one- and two-digit FACEIT levels fit at 2x scale on a 16x16 panel.
  // Keeping level 10 large prevents the adjacent "1" and "0" reading as an 8.
  const scale = 2;
  const width = text.length * 4 * scale - scale;
  let cursor = Math.floor((16 - width) / 2);
  const top = Math.floor((16 - 5 * scale) / 2);
  for (const digit of text) {
    DIGITS[digit].forEach((row, ry) => [...row].forEach((bit, rx) => {
      if (bit === "1") for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) set(cursor + rx * scale + sx, top + ry * scale + sy, [255, 255, 255]);
    }));
    cursor += 4 * scale;
  }
  if (safeLevel === 10) for (const [x, y] of [[7, 0], [8, 0], [15, 7], [15, 8], [7, 15], [8, 15], [0, 7], [0, 8]])
    set(x, y, [255, 125, 0]);
  return pixels;
}

export function faceitIdleView(level: number | undefined): PixooAnimationView {
  const safeLevel = Math.max(1, Math.min(10, level ?? 1));
  const pulse = [0.68, 0.73, 0.79, 0.86, 0.93, 0.98, 1, 0.98, 0.93, 0.86, 0.79, 0.73, 0.68];
  return { kind: "animation", frames: pulse.map((intensity) => badgeFrame(safeLevel, intensity)),
    frameDurationMs: 0, label: `LEVEL ${safeLevel}` };
}

export function faceitPlacementIdleView(placement: FaceitPlacementState | null): PixooAnimationView {
  const progress = placement ?? { played: 0, total: 10 };
  return revealTextAnimation(`${progress.played}/${progress.total}`, [255, 140, 0], "PLACEMENT");
}
