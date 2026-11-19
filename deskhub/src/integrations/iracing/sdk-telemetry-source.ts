import { GlobalFlags, type TelemetryVarList } from "@irsdk-node/types";
import type { IRacingTelemetry, IRacingTelemetrySource } from "./types.ts";

export interface TelemetrySDK {
  readonly sessionStatusOK: boolean;
  startSDK(): boolean;
  stopSDK(): void;
  waitForData(timeout: number): boolean;
  getTelemetry(): Partial<TelemetryVarList>;
  getSessionConnectionID(): number;
}

export interface TelemetrySDKModule {
  IRacingSDK: {
    new(options: { autoEnableTelemetry: boolean }): TelemetrySDK;
    IsSimRunning(): Promise<boolean>;
  };
}

export interface SDKTelemetrySourceOptions {
  sampleIntervalMs?: number;
  reconnectIntervalMs?: number;
  signal?: AbortSignal;
  log?: (message: string) => void;
  loadSDK?: () => Promise<TelemetrySDKModule>;
}

export class SDKIRacingTelemetrySource implements IRacingTelemetrySource {
  private readonly sampleIntervalMs: number;
  private readonly reconnectIntervalMs: number;
  private readonly signal: AbortSignal | undefined;
  private readonly log: (message: string) => void;
  private readonly loadSDK: () => Promise<TelemetrySDKModule>;

  constructor(options: SDKTelemetrySourceOptions = {}) {
    this.sampleIntervalMs = options.sampleIntervalMs ?? 100;
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? 1000;
    this.signal = options.signal;
    this.log = options.log ?? ((message) => console.log(`[IRACING] ${message}`));
    this.loadSDK = options.loadSDK ?? (() => import("irsdk-node"));
  }

  async *snapshots(): AsyncGenerator<IRacingTelemetry> {
    let sdkModule: TelemetrySDKModule | undefined;
    let sdk: TelemetrySDK | undefined;
    let announcedDisconnected = false;
    const stop = () => {
      const previous = sdk;
      sdk = undefined;
      try {
        previous?.stopSDK();
      } catch (error) {
        this.log(`Telemetry cleanup failed: ${errorMessage(error)}`);
      }
    };
    const disconnected = (error?: unknown): IRacingTelemetry => {
      stop();
      if (!announcedDisconnected) {
        this.log(error === undefined ? "Telemetry unavailable" : `Telemetry unavailable: ${errorMessage(error)}`);
        announcedDisconnected = true;
      }
      return { connected: false };
    };
    this.signal?.addEventListener("abort", stop, { once: true });
    try {
      while (!this.signal?.aborted) {
        let snapshot: IRacingTelemetry | undefined;
        try {
          sdkModule ??= await untilAborted(this.loadSDK(), this.signal);
          if (this.signal?.aborted || !sdkModule) break;
          // The SDK status promise cannot cancel its underlying HTTP request; abort
          // still releases this iterator and ignores any late result or rejection.
          const running = await untilAborted(sdkModule.IRacingSDK.IsSimRunning(), this.signal);
          if (this.signal?.aborted) break;
          if (!running) {
            snapshot = disconnected();
          } else {
            if (!sdk) {
              sdk = new sdkModule.IRacingSDK({ autoEnableTelemetry: true });
              if (!sdk.startSDK()) {
                snapshot = disconnected();
              } else {
                announcedDisconnected = false;
                this.log("Telemetry source connected");
              }
            }
            if (sdk) {
              if (sdk.waitForData(16)) {
                snapshot = mapTelemetry(sdk);
                if (!snapshot.connected) snapshot = disconnected();
              } else if (!sdk.sessionStatusOK) {
                snapshot = disconnected();
              }
            }
          }
        } catch (error) {
          snapshot = disconnected(error);
        }
        if (this.signal?.aborted) break;
        if (snapshot) yield snapshot;
        await sleep(snapshot?.connected === false ? this.reconnectIntervalMs : this.sampleIntervalMs, this.signal);
      }
    } finally {
      this.signal?.removeEventListener("abort", stop);
      stop();
    }
  }
}

function mapTelemetry(sdk: TelemetrySDK): IRacingTelemetry {
  const telemetry = sdk.getTelemetry();
  const flags = numberValue(telemetry.SessionFlags) ?? 0;
  const onTrack = booleanValue(telemetry.IsOnTrack) || booleanValue(telemetry.IsOnTrackCar);
  const sessionNum = numberValue(telemetry.SessionNum);
  return {
    connected: sdk.sessionStatusOK,
    sessionActive: sdk.sessionStatusOK && onTrack,
    sessionId: `${sdk.getSessionConnectionID()}:${sessionNum ?? "unknown"}`,
    position: positiveInteger(numberValue(telemetry.PlayerCarPosition)),
    lap: nonNegativeInteger(numberValue(telemetry.Lap)),
    lapCompleted: nonNegativeInteger(numberValue(telemetry.LapCompleted)),
    lapsRemaining: nonNegativeNumber(numberValue(telemetry.SessionLapsRemainEx)),
    lapCurrentLapTime: positiveNumber(numberValue(telemetry.LapCurrentLapTime)),
    lapLastLapTime: positiveNumber(numberValue(telemetry.LapLastLapTime)),
    lapBestLapTime: positiveNumber(numberValue(telemetry.LapBestLapTime)),
    speed: finiteNumber(numberValue(telemetry.Speed)),
    rpm: finiteNumber(numberValue(telemetry.RPM)),
    gear: integer(numberValue(telemetry.Gear)),
    fuelLevel: nonNegativeNumber(numberValue(telemetry.FuelLevel)),
    fuelLevelPct: nonNegativeNumber(numberValue(telemetry.FuelLevelPct)),
    incidentCount: nonNegativeInteger(numberValue(telemetry.PlayerCarMyIncidentCount)),
    onPitRoad: booleanValue(telemetry.OnPitRoad),
    carLeftRight: integer(numberValue(telemetry.CarLeftRight)),
    yellowFlag: hasFlag(flags, GlobalFlags.Yellow) || hasFlag(flags, GlobalFlags.YellowWaving)
      || hasFlag(flags, GlobalFlags.Caution) || hasFlag(flags, GlobalFlags.CautionWaving),
    blueFlag: hasFlag(flags, GlobalFlags.Blue),
    whiteFlag: hasFlag(flags, GlobalFlags.White),
    startReady: hasFlag(flags, GlobalFlags.StartReady),
    startSet: hasFlag(flags, GlobalFlags.StartSet),
    startGo: hasFlag(flags, GlobalFlags.StartGo),
    checkeredFlag: hasFlag(flags, GlobalFlags.Checkered),
  };
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
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

function untilAborted<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      resolve(undefined);
    };
    pending.then((value) => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
