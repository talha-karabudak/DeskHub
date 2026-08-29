import type { DeskHubEvent } from "../../core/types.ts";
import { events } from "../../core/events.ts";
import type { IRacingDomainEvent } from "./types.ts";

export class IRacingEventAdapter {
  toDeskHub(event: IRacingDomainEvent): DeskHubEvent[] {
    switch (event.type) {
      case "SESSION_ACTIVE": return [];
      case "PERSONAL_BEST": return [events.personalBest(), events.lap(), events.lapTime(event.current),
        events.lapDelta(event.current - event.previous)];
      case "LAP_COMPLETED": return [events.lap(), events.lapTime(event.lapTime),
        ...(event.delta === undefined ? [] : [events.lapDelta(event.delta)])];
      case "POSITION_GAINED": return [events.positionGained(event.to)];
      case "POSITION_LOST": return [events.positionLost(event.to)];
      case "INCIDENT_RECEIVED": return [events.incident(event.total)];
      case "PIT_ENTRY": return [events.pitEntry()];
      case "START_READY": return [events.startReady()];
      case "START_SET": return [events.startSet()];
      case "START_GO": return [events.startGo()];
      case "LAST_LAP": return [events.lastLap()];
      case "DISCONNECTED": return [events.disconnected()];
      case "YELLOW_FLAG": return [events.yellowFlag()];
      case "BLUE_FLAG": return [events.blueFlag()];
      case "FINISH": return [events.finish(event.position)];
    }
  }
}
