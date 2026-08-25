import type { DeskHubEvent } from "../../core/types.ts";
import { events } from "../../core/events.ts";
import type { FaceitMatchResult } from "./types.ts";

export class FaceitEventAdapter {
  private readonly processedMatches = new Set<string>();

  toEvent(result: FaceitMatchResult): DeskHubEvent | undefined {
    return this.toEvents(result)?.[0];
  }

  toEvents(result: FaceitMatchResult): DeskHubEvent[] | undefined {
    if (!result.matchId) throw new Error("FACEIT matchId is required");
    if (result.eloDelta !== null && !Number.isInteger(result.eloDelta)) {
      throw new Error("FACEIT eloDelta must be an integer or null");
    }
    if (this.processedMatches.has(result.matchId)) return undefined;
    this.processedMatches.add(result.matchId);
    if (result.placementCompleted) return [events.faceitPlaced(), events.faceitPlacedElo(result.eloAfter ?? result.eloBefore)];
    const resultEvent = result.won
      ? events.faceitMatchWon(result.eloDelta)
      : events.faceitMatchLost(result.eloDelta);
    if (result.phase === "placement" && result.placement) {
      return [resultEvent, events.faceitPlacementProgress(result.placement.played, result.placement.total)];
    }
    return result.eloDelta === null ? [resultEvent] : [resultEvent, events.faceitEloDelta(result.eloDelta)];
  }
}
