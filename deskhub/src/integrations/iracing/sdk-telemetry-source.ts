import { IRacingSDK } from "irsdk-node";
import { GlobalFlags } from "@irsdk-node/types";
import type { IRacingTelemetry, IRacingTelemetrySource } from "./types.ts";

export interface SDKTelemetrySourceOptions {
  sampleIntervalMs?: number;
  reconnectIntervalMs?: number;
  signal?: AbortSignal;
  log?: (message: string) => void;
}

export class SDKIRacingTelemetrySource implements IRacingTelemetrySource {
  private readonly sampleIntervalMs: number;
  private readonly reconnectIntervalMs: number;
  private readonly signal: AbortSignal | undefined;
  private readonly log: (message: string) => void;

  constructor(options: SDKTelemetrySourceOptions = {}) {
    this.sampleIntervalMs = options.sampleIntervalMs ?? 100;
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? 1000;
    this.signal = options.signal;
    this.log = options.log ?? ((message) => console.log(`[IRACING] ${message}`));
  }

  async *snapshots(): AsyncIterable<IRacingTelemetry> {
    let sdk: IRacingSDK | undefined;
    let announcedDisconnected = false;
    while (!this.signal?.aborted) {
      if (!await IRacingSDK.IsSimRunning()) {
        if (sdk) { sdk.stopSDK(); sdk = undefined; }
        if (!announcedDisconnected) { this.log("Telemetry unavailable"); announcedDisconnected = true; }
        yield { connected: false };
        await sleep(this.reconnectIntervalMs, this.signal);
        continue;
      }
      if (!sdk) {
        sdk = new IRacingSDK({ autoEnableTelemetry: true });
        if (!sdk.startSDK()) {
          yield { connected: false };
          await sleep(this.reconnectIntervalMs, this.signal);
          sdk = undefined;
          continue;
        }
        announcedDisconnected = false;
        this.log("Telemetry source connected");
      }
      if (!sdk.waitForData(16)) {
        sdk.stopSDK(); sdk = undefined;
        yield { connected: false };
        continue;
      }
      const telemetry = sdk.getTelemetry();
      const flags = numberValue(telemetry.SessionFlags) ?? 0;
      const onTrack = booleanValue(telemetry.IsOnTrack) || booleanValue(telemetry.IsOnTrackCar);
      const sessionNum = numberValue(telemetry.SessionNum);
      yield {
        connected: sdk.sessionStatusOK,
        sessionActive: sdk.sessionStatusOK && onTrack,
        sessionId: `${sdk.getSessionConnectionID()}:${sessionNum ?? "unknown"}`,
        position: positiveInteger(numberValue(telemetry.PlayerCarPosition)),
        lap: nonNegativeInteger(numberValue(telemetry.Lap)),
        lapCurrentLapTime: positiveNumber(numberValue(telemetry.LapCurrentLapTime)),
        lapLastLapTime: positiveNumber(numberValue(telemetry.LapLastLapTime)),
        lapBestLapTime: positiveNumber(numberValue(telemetry.LapBestLapTime)),
        speed: finiteNumber(numberValue(telemetry.Speed)),
        rpm: finiteNumber(numberValue(telemetry.RPM)),
        gear: integer(numberValue(telemetry.Gear)),
        fuelLevel: nonNegativeNumber(numberValue(telemetry.FuelLevel)),
        incidentCount: nonNegativeInteger(numberValue(telemetry.PlayerCarMyIncidentCount)),
        onPitRoad: booleanValue(telemetry.OnPitRoad),
        yellowFlag: hasFlag(flags, GlobalFlags.Yellow) || hasFlag(flags, GlobalFlags.YellowWaving)
          || hasFlag(flags, GlobalFlags.Caution) || hasFlag(flags, GlobalFlags.CautionWaving),
        blueFlag: hasFlag(flags, GlobalFlags.Blue),
        checkeredFlag: hasFlag(flags, GlobalFlags.Checkered),
      };
      await sleep(this.sampleIntervalMs, this.signal);
    }
    sdk?.stopSDK();
  }
}

interface Variable<T> { value?: T[] }
function numberValue(variable: Variable<number> | undefined): number | undefined { return variable?.value?.[0]; }
function booleanValue(variable: Variable<boolean> | undefined): boolean { return variable?.value?.[0] === true; }
function hasFlag(flags: number, flag: number): boolean { return (flags & flag) !== 0; }
function finiteNumber(value: number | undefined): number | undefined { return Number.isFinite(value) ? value : undefined; }
function positiveNumber(value: number | undefined): number | undefined { return Number.isFinite(value) && value! > 0 ? value : undefined; }
function nonNegativeNumber(value: number | undefined): number | undefined { return Number.isFinite(value) && value! >= 0 ? value : undefined; }
function integer(value: number | undefined): number | undefined { return Number.isInteger(value) ? value : undefined; }
function positiveInteger(value: number | undefined): number | undefined { return Number.isInteger(value) && value! > 0 ? value : undefined; }
function nonNegativeInteger(value: number | undefined): number | undefined { return Number.isInteger(value) && value! >= 0 ? value : undefined; }
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
