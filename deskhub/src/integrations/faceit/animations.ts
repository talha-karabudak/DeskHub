import type { PixooAnimationView } from "../../core/types.ts";

type Color = [number, number, number];
const SIZE = 16;
const blank = (): number[] => new Array(SIZE * SIZE * 3).fill(0);
const set = (frame: number[], x: number, y: number, color: Color): void => {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const offset = (y * SIZE + x) * 3; frame[offset] = color[0]; frame[offset + 1] = color[1]; frame[offset + 2] = color[2];
};
const line = (frame: number[], x0: number, y0: number, x1: number, y1: number, color: Color): void => {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1; const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) { set(frame, x0, y0, color); if (x0 === x1 && y0 === y1) break; const twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; } if (twice <= dx) { error += dx; y0 += sy; } }
};

const FONT: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
  "2": ["110", "001", "010", "100", "111"], "3": ["110", "001", "010", "001", "110"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "110", "001", "110"],
  "6": ["011", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "110"],
  "+": ["000", "010", "111", "010", "000"], "-": ["000", "000", "111", "000", "000"],
  "/": ["001", "001", "010", "100", "100"],
};
const drawText = (frame: number[], text: string, color: Color, visibleCharacters = text.length): void => {
  const width = text.length * 4 - 1; let x = Math.floor((16 - width) / 2);
  for (let index = 0; index < Math.min(text.length, visibleCharacters); index++) {
    FONT[text[index]].forEach((row, y) => [...row].forEach((bit, column) => { if (bit === "1") set(frame, x + column, 5 + y, color); })); x += 4;
  }
};

export function victoryAnimation(): PixooAnimationView {
  const frames: number[][] = [];
  for (let step = 0; step < 6; step++) { const frame = blank(); const endX = 5 + step * 2;
    line(frame, 2, 8, Math.min(6, endX), Math.min(12, 8 + step), [0, 255, 70]);
    if (step >= 2) line(frame, 6, 12, endX, Math.max(3, 12 - (endX - 6)), [0, 255, 70]); frames.push(frame); }
  frames.push(frames.at(-1)!.slice(), frames.at(-1)!.slice());
  return { kind: "animation", frames, frameDurationMs: 0, label: "VICTORY" };
}

export function lossAnimation(): PixooAnimationView {
  const frames: number[][] = [];
  for (let step = 1; step <= 6; step++) { const frame = blank(); line(frame, 8 - step, 8 - step, 8 + step, 8 + step, [255, 25, 10]);
    line(frame, 8 + step, 8 - step, 8 - step, 8 + step, [255, 25, 10]); frames.push(frame); }
  frames.push(frames.at(-1)!.slice(), frames.at(-1)!.slice());
  return { kind: "animation", frames, frameDurationMs: 0, label: "LOSS" };
}

export function revealTextAnimation(text: string, color: Color, label = text): PixooAnimationView {
  const frames: number[][] = [];
  for (let visible = 1; visible <= text.length; visible++) { const frame = blank(); drawText(frame, text, color, visible); frames.push(frame); }
  frames.push(frames.at(-1)!.slice(), frames.at(-1)!.slice(), frames.at(-1)!.slice());
  return { kind: "animation", frames, frameDurationMs: 0, label };
}
