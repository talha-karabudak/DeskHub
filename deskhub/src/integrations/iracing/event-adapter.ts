import type { DeskHubEvent } from "../../core/types.ts";
import { events } from "../../core/events.ts";
import type { IRacingDomainEvent } from "./types.ts";

export class IRacingEventAdapter {
  toDeskHub(event: IRacingDomainEvent): DeskHubEvent | undefined {
    switch (event.type) {
      case "SESSION_ACTIVE": return undefined;
      case "PERSONAL_BEST": return events.personalBest();
      case "POSITION_GAINED": return events.positionGained(event.to);
      case "POSITION_LOST": return events.positionLost(event.to);
      case "INCIDENT_RECEIVED": return events.incident(event.delta);
      case "YELLOW_FLAG": return events.yellowFlag();
      case "BLUE_FLAG": return events.blueFlag();
      case "FINISH": return events.finish(event.position);
    }
  }
}
