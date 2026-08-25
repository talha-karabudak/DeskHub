import type { IRacingDomainEvent, IRacingTelemetry } from "./types.ts";

export interface IRacingDetectorOptions { maxPositionJump?: number }

export class IRacingEventDetector {
  private previous: IRacingTelemetry | undefined;
  private readonly maxPositionJump: number;

  constructor(options: IRacingDetectorOptions = {}) {
    this.maxPositionJump = options.maxPositionJump ?? 3;
  }

  update(current: IRacingTelemetry): IRacingDomainEvent[] {
    if (!current.connected || !current.sessionActive) {
      this.previous = undefined;
      return [];
    }
    const previous = this.previous;
    this.previous = current;
    if (!previous || previous.sessionId !== current.sessionId) {
      return [{ type: "SESSION_ACTIVE", position: validPosition(current.position) }];
    }

    const result: IRacingDomainEvent[] = [];
    const oldBest = validLapTime(previous.lapBestLapTime);
    const newBest = validLapTime(current.lapBestLapTime);
    if (oldBest !== undefined && newBest !== undefined && newBest < oldBest) {
      result.push({ type: "PERSONAL_BEST", previous: oldBest, current: newBest });
    }

    const from = validPosition(previous.position);
    const to = validPosition(current.position);
    if (from !== undefined && to !== undefined && from !== to && Math.abs(from - to) <= this.maxPositionJump) {
      result.push(to < from ? { type: "POSITION_GAINED", from, to } : { type: "POSITION_LOST", from, to });
    }

    const oldIncidents = validCounter(previous.incidentCount);
    const newIncidents = validCounter(current.incidentCount);
    if (oldIncidents !== undefined && newIncidents !== undefined && newIncidents > oldIncidents) {
      result.push({ type: "INCIDENT_RECEIVED", delta: newIncidents - oldIncidents, total: newIncidents });
    }
    if (!previous.yellowFlag && current.yellowFlag) result.push({ type: "YELLOW_FLAG" });
    if (!previous.blueFlag && current.blueFlag) result.push({ type: "BLUE_FLAG" });
    if (!previous.checkeredFlag && current.checkeredFlag) result.push({ type: "FINISH", position: to });
    return result;
  }
}

function validLapTime(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
function validPosition(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value! > 0 ? value : undefined;
}
function validCounter(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value! >= 0 ? value : undefined;
}
