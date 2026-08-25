export interface IRacingTelemetry {
  connected: boolean;
  sessionId?: string;
  sessionActive?: boolean;
  sessionType?: string;
  position?: number;
  lap?: number;
  lapCurrentLapTime?: number;
  lapLastLapTime?: number;
  lapBestLapTime?: number;
  speed?: number;
  rpm?: number;
  gear?: number;
  fuelLevel?: number;
  incidentCount?: number;
  onPitRoad?: boolean;
  yellowFlag?: boolean;
  blueFlag?: boolean;
  checkeredFlag?: boolean;
}

export type IRacingDomainEvent =
  | { type: "SESSION_ACTIVE"; position?: number }
  | { type: "PERSONAL_BEST"; previous: number; current: number }
  | { type: "POSITION_GAINED"; from: number; to: number }
  | { type: "POSITION_LOST"; from: number; to: number }
  | { type: "INCIDENT_RECEIVED"; delta: number; total: number }
  | { type: "YELLOW_FLAG" }
  | { type: "BLUE_FLAG" }
  | { type: "FINISH"; position?: number };

export interface IRacingTelemetrySource {
  snapshots(): AsyncIterable<IRacingTelemetry>;
}
