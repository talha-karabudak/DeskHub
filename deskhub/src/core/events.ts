import type { DeskHubEvent, DeskHubMode, PixooView } from "./types.ts";
import { lossAnimation, revealTextAnimation, victoryAnimation } from "../integrations/faceit/animations.ts";
import { blueFlagAnimation, lapDeltaCard, lapTimeCard, startLightAnimation, yellowFlagAnimation }
  from "../integrations/iracing/animations.ts";

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
  yellowFlag: (): DeskHubEvent => viewEvent("YellowFlag", "iracing", 100, yellowFlagAnimation()),
  lowFuel: (): DeskHubEvent => event("LowFuel", "iracing", 90, "FUEL", [255, 60, 0]),
  incident: (total: number): DeskHubEvent => event("IncidentReceived", "iracing", 70, `${total}X`, [255, 0, 0]),
  blueFlag: (): DeskHubEvent => viewEvent("BlueFlag", "iracing", 60, blueFlagAnimation()),
  personalBest: (): DeskHubEvent => event("PersonalBest", "iracing", 55, "PB", [180, 0, 255]),
  lap: (): DeskHubEvent => event("LapCompleted", "iracing", 50, "LAP", [255, 255, 255], 1200),
  lapTime: (seconds: number): DeskHubEvent => viewEvent("LapTime", "iracing", 49, lapTimeCard(seconds)),
  lapDelta: (seconds: number): DeskHubEvent => viewEvent("LapDelta", "iracing", 48, lapDeltaCard(seconds)),
  pitEntry: (): DeskHubEvent => event("PitEntry", "iracing", 65, "PIT", [255, 160, 0]),
  disconnected: (): DeskHubEvent => event("IRacingDisconnected", "iracing", 95, "DISC", [255, 0, 0], 2500, true),
  startReady: (): DeskHubEvent => viewEvent("StartReady", "iracing", 85, startLightAnimation("ready")),
  startSet: (): DeskHubEvent => viewEvent("StartSet", "iracing", 86, startLightAnimation("set")),
  startGo: (): DeskHubEvent => viewEvent("StartGo", "iracing", 87, startLightAnimation("go")),
  lastLap: (): DeskHubEvent => event("LastLap", "iracing", 80, "LAST", [255, 255, 255]),
  positionGained: (position: number): DeskHubEvent =>
    event("PositionGained", "iracing", 30, `P${position}`, [0, 255, 0]),
  positionLost: (position: number): DeskHubEvent =>
    event("PositionLost", "iracing", 30, `P${position}`, [255, 80, 0]),
  finish: (position?: number): DeskHubEvent =>
    event("Finish", "iracing", 80, position ? `P${position}` : "FIN", [255, 255, 255]),
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
