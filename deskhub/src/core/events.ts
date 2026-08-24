import type { DeskHubEvent, DeskHubMode } from "./types.ts";

let nextId = 1;

function event(type: string, mode: DeskHubMode, priority: number, text: string,
  color: [number, number, number], durationMs = 2000, scroll = false): DeskHubEvent {
  return { id: `event-${nextId++}`, type, mode, priority, durationMs,
    view: { kind: "text", text, color, scroll } };
}

export const events = {
  yellowFlag: (): DeskHubEvent => event("YellowFlag", "iracing", 100, "YELLOW", [255, 180, 0], 2000, true),
  lowFuel: (): DeskHubEvent => event("LowFuel", "iracing", 90, "FUEL", [255, 60, 0]),
  incident: (): DeskHubEvent => event("IncidentReceived", "iracing", 70, "INC", [255, 0, 0]),
  personalBest: (): DeskHubEvent => event("PersonalBest", "iracing", 50, "PB", [180, 0, 255]),
  positionGained: (position: number): DeskHubEvent =>
    event("PositionGained", "iracing", 30, `P${position}`, [0, 255, 0]),
  faceitMatchWon: (eloGain: number | null): DeskHubEvent => {
    return event("FaceitMatchWon", "faceit", 70, "VICTORY", [0, 255, 0], 12000, true);
  },
  faceitMatchLost: (eloDelta: number | null): DeskHubEvent => {
    return event("FaceitMatchLost", "faceit", 60, "LOSS", [255, 0, 0], 3000, false);
  },
  faceitEloDelta: (delta: number): DeskHubEvent =>
    event("FaceitEloDelta", "faceit", 65, `${delta >= 0 ? "+" : ""}${delta}`,
      delta >= 0 ? [0, 255, 0] : [255, 0, 0], 3000, false),
  faceitCurrentElo: (elo: number): DeskHubEvent =>
    event("FaceitCurrentElo", "faceit", 65, `ELO ${elo}`, [0, 180, 255], 12000, true),
};
