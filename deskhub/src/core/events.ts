import type { DeskHubEvent, DeskHubMode, PixooView } from "./types.ts";
import { lossAnimation, revealTextAnimation, victoryAnimation } from "../integrations/faceit/animations.ts";

let nextId = 1;

function event(type: string, mode: DeskHubMode, priority: number, text: string,
  color: [number, number, number], durationMs = 2000, scroll = false): DeskHubEvent {
  return { id: `event-${nextId++}`, type, mode, priority, durationMs,
    view: { kind: "text", text, color, scroll } };
}
function viewEvent(type: string, mode: DeskHubMode, priority: number, view: PixooView): DeskHubEvent {
  return { id: `event-${nextId++}`, type, mode, priority, durationMs: 0, view };
}

export const events = {
  yellowFlag: (): DeskHubEvent => event("YellowFlag", "iracing", 100, "YELLOW", [255, 180, 0], 2000, true),
  lowFuel: (): DeskHubEvent => event("LowFuel", "iracing", 90, "FUEL", [255, 60, 0]),
  incident: (): DeskHubEvent => event("IncidentReceived", "iracing", 70, "INC", [255, 0, 0]),
  personalBest: (): DeskHubEvent => event("PersonalBest", "iracing", 50, "PB", [180, 0, 255]),
  positionGained: (position: number): DeskHubEvent =>
    event("PositionGained", "iracing", 30, `P${position}`, [0, 255, 0]),
  faceitMatchWon: (eloGain: number | null): DeskHubEvent => {
    return viewEvent("FaceitMatchWon", "faceit", 70, victoryAnimation());
  },
  faceitMatchLost: (eloDelta: number | null): DeskHubEvent => {
    return viewEvent("FaceitMatchLost", "faceit", 60, lossAnimation());
  },
  faceitEloDelta: (delta: number): DeskHubEvent =>
    viewEvent("FaceitEloDelta", "faceit", 65, revealTextAnimation(`${delta >= 0 ? "+" : ""}${delta}`,
      delta >= 0 ? [0, 255, 0] : [255, 0, 0], "ELO DELTA")),
  faceitCurrentElo: (elo: number): DeskHubEvent =>
    event("FaceitCurrentElo", "faceit", 65, `ELO ${elo}`, [0, 180, 255], 12000, true),
  faceitPlacementProgress: (played: number, total: number): DeskHubEvent =>
    viewEvent("FaceitPlacementProgress", "faceit", 65, revealTextAnimation(`${played}/${total}`, [255, 140, 0], "PLACEMENT")),
  faceitPlaced: (): DeskHubEvent => event("FaceitPlacementComplete", "faceit", 75, "PLACED", [255, 140, 0], 10000, true),
  faceitPlacedElo: (elo: number): DeskHubEvent => event("FaceitPlacedElo", "faceit", 70, String(elo), [255, 255, 255], 3000, false),
};
