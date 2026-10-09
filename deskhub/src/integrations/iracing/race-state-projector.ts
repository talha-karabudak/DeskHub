import { UNLIMITED_LAPS_COUNT } from "@irsdk-node/types";
import type { RaceCompanionLap, RaceCompanionState } from "./race-companion-types.ts";
import type { IRacingTelemetry, IRacingTelemetryObserver } from "./types.ts";

const MAX_RECENT_LAPS = 5;
const MAX_FUEL_CONSUMPTIONS = 5;
const MIN_FUEL_CONSUMPTIONS = 2;

export class RaceStateProjector implements IRacingTelemetryObserver {
  private state = emptyState();
  private activeSessionId: string | null = null;
  private sessionInitialized = false;
  private previousCompletedLap: number | null = null;
  private completedLaps = new Set<number>();
  private previousFuelSample: number | null = null;
  private fuelConsumptions: number[] = [];
  private incidentBaseline: number | null = null;

  update(snapshot: IRacingTelemetry): void {
    const sessionId = validSessionId(snapshot.sessionId);
    if (!snapshot.connected) {
      this.resetSession();
      this.state.connection = { connected: false, sessionActive: false, sessionId: null };
      return;
    }

    if (!snapshot.sessionActive) {
      this.resetSession();
      this.state.connection = { connected: true, sessionActive: false, sessionId };
      return;
    }

    if (!this.sessionInitialized || sessionId !== this.activeSessionId) {
      this.resetSession();
      this.sessionInitialized = true;
      this.activeSessionId = sessionId;
      this.previousCompletedLap = validCounter(snapshot.lapCompleted);
      this.incidentBaseline = validCounter(snapshot.incidentCount);
    }

    this.state.connection = { connected: true, sessionActive: true, sessionId };

    const position = validPositiveInteger(snapshot.position);
    if (position !== null) {
      if (this.state.position.start === null) this.state.position.start = position;
    }
    this.state.position.current = position;
    this.state.position.gainLoss = this.state.position.start !== null && this.state.position.current !== null
      ? this.state.position.start - this.state.position.current : null;

    this.state.laps.current = validCounter(snapshot.lap);
    this.state.laps.remaining = validRemainingLaps(snapshot.lapsRemaining);
    const last = validPositiveNumber(snapshot.lapLastLapTime);
    const best = validPositiveNumber(snapshot.lapBestLapTime);
    if (last !== null) this.state.laps.last = last;
    if (best !== null) this.state.laps.best = best;

    const completedLap = validCounter(snapshot.lapCompleted);
    if (completedLap !== null && this.previousCompletedLap !== null && completedLap > this.previousCompletedLap) {
      this.captureCompletedLap(completedLap, last, validNonNegativeNumber(snapshot.fuelLevel),
        validCounter(snapshot.incidentCount));
    }
    if (completedLap !== null) this.previousCompletedLap = completedLap;
    if (this.incidentBaseline === null) this.incidentBaseline = validCounter(snapshot.incidentCount);

    this.recalculateLapDeltas();
    this.state.fuel.remaining = validNonNegativeNumber(snapshot.fuelLevel);
    this.recalculateFuelEstimates();
  }

  getState(): RaceCompanionState {
    return {
      connection: { ...this.state.connection },
      position: { ...this.state.position },
      laps: { ...this.state.laps, recent: this.state.laps.recent.map((lap) => ({ ...lap })) },
      fuel: { ...this.state.fuel },
    };
  }

  private captureCompletedLap(
    lapNumber: number,
    lapTime: number | null,
    fuel: number | null,
    incidents: number | null,
  ): void {
    if (!this.completedLaps.has(lapNumber)) {
      this.completedLaps.add(lapNumber);
      if (lapTime !== null) {
        const incidentDelta = incidents !== null && this.incidentBaseline !== null
          ? Math.max(0, incidents - this.incidentBaseline) : 0;
        this.state.laps.recent.push({ lapNumber, lapTime, deltaToBest: null, incidentDelta });
        this.state.laps.recent = this.state.laps.recent.slice(-MAX_RECENT_LAPS);
      }
      this.incidentBaseline = incidents;
    }

    if (fuel !== null) {
      if (this.previousFuelSample !== null) {
        const consumed = this.previousFuelSample - fuel;
        if (consumed > 0) {
          this.fuelConsumptions.push(consumed);
          this.fuelConsumptions = this.fuelConsumptions.slice(-MAX_FUEL_CONSUMPTIONS);
        }
      }
      this.previousFuelSample = fuel;
    }
  }

  private recalculateLapDeltas(): void {
    const best = this.state.laps.best;
    this.state.laps.recent = this.state.laps.recent.map((lap): RaceCompanionLap => ({
      ...lap,
      deltaToBest: best === null ? null : lap.lapTime - best,
    }));
  }

  private recalculateFuelEstimates(): void {
    if (this.fuelConsumptions.length < MIN_FUEL_CONSUMPTIONS) {
      this.state.fuel.averagePerLap = null;
      this.state.fuel.estimatedLaps = null;
      this.state.fuel.estimatedAtFinish = null;
      return;
    }
    const average = median(this.fuelConsumptions);
    const remaining = this.state.fuel.remaining;
    const remainingLaps = this.state.laps.remaining;
    this.state.fuel.averagePerLap = average;
    this.state.fuel.estimatedLaps = remaining === null ? null : remaining / average;
    this.state.fuel.estimatedAtFinish = remaining === null || remainingLaps === null
      ? null : remaining - remainingLaps * average;
  }

  private resetSession(): void {
    const connection = this.state.connection;
    this.state = emptyState();
    this.state.connection = { ...connection, sessionActive: false };
    this.activeSessionId = null;
    this.sessionInitialized = false;
    this.previousCompletedLap = null;
    this.completedLaps = new Set();
    this.previousFuelSample = null;
    this.fuelConsumptions = [];
    this.incidentBaseline = null;
  }
}

function emptyState(): RaceCompanionState {
  return {
    connection: { connected: false, sessionActive: false, sessionId: null },
    position: { current: null, start: null, gainLoss: null },
    laps: { current: null, remaining: null, last: null, best: null, recent: [] },
    fuel: { remaining: null, averagePerLap: null, estimatedLaps: null, estimatedAtFinish: null },
  };
}

function validSessionId(value: string | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function validPositiveInteger(value: number | undefined): number | null {
  return Number.isInteger(value) && value! > 0 ? value! : null;
}
function validCounter(value: number | undefined): number | null {
  return Number.isInteger(value) && value! >= 0 ? value! : null;
}
function validPositiveNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
function validNonNegativeNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function validRemainingLaps(value: number | undefined): number | null {
  const remaining = validNonNegativeNumber(value);
  return remaining === UNLIMITED_LAPS_COUNT ? null : remaining;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
