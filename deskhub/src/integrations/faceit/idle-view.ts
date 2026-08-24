import type { PixooFrameView } from "../../core/types.ts";

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

export function faceitIdleView(level: number | undefined): PixooFrameView {
  const safeLevel = Math.max(1, Math.min(10, level ?? 1));
  const pixels = new Array<number>(16 * 16 * 3).fill(0);
  const ring = levelColor(safeLevel);
  const set = (x: number, y: number, color: [number, number, number]) => {
    const offset = (y * 16 + x) * 3; pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2];
  };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const distance = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2);
    if (distance >= 6.2 && distance <= 7.5) set(x, y, ring);
    else if (distance < 6.2) set(x, y, [18, 8, 4]);
  }
  const text = String(safeLevel);
  const scale = text.length === 1 ? 2 : 1;
  const width = text.length * 4 * scale - scale;
  let cursor = Math.floor((16 - width) / 2);
  const top = Math.floor((16 - 5 * scale) / 2);
  for (const digit of text) {
    DIGITS[digit].forEach((row, ry) => [...row].forEach((bit, rx) => {
      if (bit === "1") for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) set(cursor + rx * scale + sx, top + ry * scale + sy, [255, 255, 255]);
    }));
    cursor += 4 * scale;
  }
  return { kind: "frame", pixels, label: `LEVEL ${safeLevel}` };
}
