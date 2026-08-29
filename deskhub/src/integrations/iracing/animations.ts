import type { PixooAnimationView, PixooFrameView } from "../../core/types.ts";

type Color = [number, number, number];
const SIZE = 16;
const blank = (): number[] => new Array(SIZE * SIZE * 3).fill(0);
const fill = (color: Color): number[] => Array.from({ length: SIZE * SIZE }, () => color).flat();
const set = (frame: number[], x: number, y: number, color: Color): void => {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const offset = (y * SIZE + x) * 3;
  frame[offset] = color[0]; frame[offset + 1] = color[1]; frame[offset + 2] = color[2];
};
const FONT: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
  "2": ["110", "001", "010", "100", "111"], "3": ["110", "001", "010", "001", "110"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "110", "001", "110"],
  "6": ["011", "100", "111", "101", "111"], "7": ["111", "001", "010", "100", "100"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "110"],
  "+": ["000", "010", "111", "010", "000"], "-": ["000", "000", "111", "000", "000"],
  ":": ["000", "010", "000", "010", "000"],
};

export function yellowFlagAnimation(): PixooAnimationView {
  const yellow = fill([255, 180, 0]);
  return { kind: "animation", frames: [yellow, blank(), yellow, blank(), yellow, blank(), yellow],
    frameDurationMs: 220, label: "YELLOW" };
}

export function blueFlagAnimation(): PixooAnimationView {
  const edge = (): number[] => {
    const frame = blank();
    for (let y = 0; y < SIZE; y++) for (const x of [0, 1, 14, 15]) set(frame, x, y, [0, 80, 255]);
    return frame;
  };
  return { kind: "animation", frames: [edge(), blank(), edge(), blank(), edge()],
    frameDurationMs: 220, label: "BLUE" };
}

export function lapTimeCard(seconds: number): PixooAnimationView {
  const totalHundredths = Math.round(seconds * 100);
  const minutes = Math.floor(totalHundredths / 6000);
  const wholeSeconds = Math.floor((totalHundredths % 6000) / 100).toString().padStart(2, "0");
  const hundredths = (totalHundredths % 100).toString().padStart(2, "0");
  const frame = blank();
  drawText(frame, `${minutes}:${wholeSeconds}`, 1, [0, 200, 255]);
  drawText(frame, hundredths, 9, [255, 255, 255]);
  return heldCard(frame, "LAP_TIME", 3000);
}

export function lapDeltaCard(seconds: number): PixooAnimationView {
  const absoluteHundredths = Math.round(Math.abs(seconds) * 100);
  const whole = Math.floor(absoluteHundredths / 100);
  const hundredths = (absoluteHundredths % 100).toString().padStart(2, "0");
  const color: Color = seconds <= 0 ? [0, 255, 0] : [255, 80, 0];
  const frame = blank();
  const sign = seconds < 0 ? "-" : seconds > 0 ? "+" : "";
  drawText(frame, `${sign}${whole}`, 1, color);
  drawText(frame, hundredths, 9, color);
  return heldCard(frame, "LAP_DELTA", 2500);
}

export function startLightAnimation(stage: "ready" | "set" | "go"): PixooAnimationView {
  const frame = blank();
  const color: Color = stage === "go" ? [0, 255, 0] : stage === "set" ? [255, 0, 0] : [255, 160, 0];
  const count = stage === "ready" ? 2 : 4;
  for (let light = 0; light < count; light++) {
    const x = 2 + light * 4;
    for (let y = 6; y <= 9; y++) for (let dx = 0; dx < 3; dx++) set(frame, x + dx, y, color);
  }
  return { kind: "animation", frames: [frame, frame, frame, frame], frameDurationMs: 180,
    label: `START_${stage.toUpperCase()}` };
}

export function spotterFrame(value: number): PixooFrameView {
  const frame = blank();
  const left = value === 2 || value === 4 || value === 5;
  const right = value === 3 || value === 4 || value === 6;
  const color: Color = [255, 40, 0];
  if (left) drawInwardArrow(frame, 0, 1, color);
  if (right) drawInwardArrow(frame, 15, -1, color);
  for (let y = 5; y <= 11; y++) { set(frame, 7, y, [0, 160, 255]); set(frame, 8, y, [0, 160, 255]); }
  return { kind: "frame", pixels: frame, label: left && right ? "SPOTTER_BOTH" : left ? "SPOTTER_LEFT" : "SPOTTER_RIGHT" };
}

function drawInwardArrow(frame: number[], edgeX: number, direction: 1 | -1, color: Color): void {
  for (let step = 0; step < 5; step++) {
    const x = edgeX + direction * step;
    const offset = 4 - step;
    set(frame, x, 8 - offset, color);
    set(frame, x, 8 + offset, color);
    set(frame, x - direction, 8 - offset, color);
    set(frame, x - direction, 8 + offset, color);
  }
}

function drawText(frame: number[], text: string, y: number, color: Color): void {
  const width = text.length * 4 - 1;
  let x = Math.floor((SIZE - width) / 2);
  for (const character of text) {
    const glyph = FONT[character];
    if (!glyph) continue;
    glyph.forEach((row, rowIndex) => [...row].forEach((bit, column) => {
      if (bit === "1") set(frame, x + column, y + rowIndex, color);
    }));
    x += 4;
  }
}

function heldCard(frame: number[], label: string, durationMs: number): PixooAnimationView {
  const frameDurationMs = 500;
  return { kind: "animation", frames: Array.from({ length: durationMs / frameDurationMs }, () => frame.slice()),
    frameDurationMs, label };
}
