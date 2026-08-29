export interface IRacingTelemetry {
  connected: boolean;
  sessionId?: string;
  sessionActive?: boolean;
  sessionType?: string;
  position?: number;
  lap?: number;
  lapCompleted?: number;
  lapCurrentLapTime?: number;
  lapLastLapTime?: number;
  lapBestLapTime?: number;
  speed?: number;
  rpm?: number;
  gear?: number;
  fuelLevel?: number;
  fuelLevelPct?: number;
  incidentCount?: number;
  onPitRoad?: boolean;
  carLeftRight?: number;
  yellowFlag?: boolean;
  blueFlag?: boolean;
  whiteFlag?: boolean;
  startReady?: boolean;
  startSet?: boolean;
  startGo?: boolean;
  checkeredFlag?: boolean;
}

export type IRacingDomainEvent =
  | { type: "SESSION_ACTIVE"; position?: number }
  | { type: "PERSONAL_BEST"; previous: number; current: number }
  | { type: "LAP_COMPLETED"; lapTime: number; delta?: number }
  | { type: "POSITION_GAINED"; from: number; to: number }
  | { type: "POSITION_LOST"; from: number; to: number }
  | { type: "INCIDENT_RECEIVED"; delta: number; total: number }
  | { type: "PIT_ENTRY" }
  | { type: "START_READY" }
  | { type: "START_SET" }
  | { type: "START_GO" }
  | { type: "LAST_LAP" }
  | { type: "DISCONNECTED" }
  | { type: "YELLOW_FLAG" }
  | { type: "BLUE_FLAG" }
  | { type: "FINISH"; position?: number };

export interface IRacingTelemetrySource {
  snapshots(): AsyncIterable<IRacingTelemetry>;
}
