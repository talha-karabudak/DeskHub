import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const pixooDefaults = {
  position: true, lap: true, pb: true, incident: true, yellow: true, blue: true,
  spotter: true, start: true, pit: true, lastLap: true, finish: true, fuel: false,
};

export type PixooSettings = typeof pixooDefaults;

export function parsePixooSettings(input: unknown): PixooSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a settings object");
  const settings = { ...pixooDefaults };
  for (const [name, enabled] of Object.entries(input)) {
    if (!Object.hasOwn(settings, name) || typeof enabled !== "boolean") throw new Error("Invalid Pixoo setting");
    settings[name as keyof PixooSettings] = enabled;
  }
  return settings;
}

export function loadPixooSettings(path: string): PixooSettings {
  try {
    return parsePixooSettings(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("[Pixoo] Settings could not be read:", error);
    return { ...pixooDefaults };
  }
}

export function savePixooSettings(path: string, settings: PixooSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + ".tmp", JSON.stringify(settings, null, 2) + "\n");
  renameSync(path + ".tmp", path);
}

export const pixooEventSetting: Partial<Record<string, keyof PixooSettings>> = {
  PositionGained: "position", PositionLost: "position",
  LapCompleted: "lap", LapTime: "lap", LapDelta: "lap", PersonalBest: "pb",
  IncidentReceived: "incident", YellowFlag: "yellow", BlueFlag: "blue",
  StartReady: "start", StartSet: "start", StartGo: "start", PitEntry: "pit",
  LastLap: "lastLap", Finish: "finish", LowFuel: "fuel",
};
