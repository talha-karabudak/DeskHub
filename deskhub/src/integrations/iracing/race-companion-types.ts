export interface RaceCompanionLap {
  lapNumber: number;
  lapTime: number;
  deltaToBest: number | null;
  incidentDelta: number;
}

export interface RaceCompanionState {
  connection: {
    connected: boolean;
    sessionActive: boolean;
    sessionId: string | null;
  };
  position: {
    current: number | null;
    start: number | null;
    gainLoss: number | null;
  };
  laps: {
    current: number | null;
    remaining: number | null;
    last: number | null;
    best: number | null;
    recent: RaceCompanionLap[];
  };
  fuel: {
    remaining: number | null;
    averagePerLap: number | null;
    estimatedLaps: number | null;
    estimatedAtFinish: number | null;
  };
}
