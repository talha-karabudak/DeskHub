import { IRacingSDK } from "irsdk-node";
import { GlobalFlags, SessionState } from "@irsdk-node/types";

const sdk = new IRacingSDK({ autoEnableTelemetry: true });
if (!sdk.startSDK()) {
  console.error("[IRACING] SDK start failed");
  process.exitCode = 1;
} else {
  console.log("[IRACING] Inspector connected; sampling at 1 Hz (Ctrl+C to stop)");
  const timer = setInterval(inspect, 1000);
  inspect();

  const stop = () => {
    clearInterval(timer);
    sdk.stopSDK();
    process.exit();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

function inspect(): void {
  if (!sdk.waitForData(16)) {
    console.log(JSON.stringify({ connected: false }));
    return;
  }

  const telemetry = sdk.getTelemetry();
  const sessionNum = numberValue(telemetry.SessionNum);
  const state = numberValue(telemetry.SessionState);
  const flags = numberValue(telemetry.SessionFlags) ?? 0;
  const session = sdk.getSessionInfo()?.Sessions.find((item) => item.SessionNum === sessionNum);

  console.log(JSON.stringify({
    connected: sdk.sessionStatusOK,
    sessionType: session?.SessionType,
    sessionNum,
    playerCarIdx: numberValue(telemetry.PlayerCarIdx),
    lap: numberValue(telemetry.Lap),
    lapCurrentLapTime: numberValue(telemetry.LapCurrentLapTime),
    lapLastLapTime: numberValue(telemetry.LapLastLapTime),
    lapBestLapTime: numberValue(telemetry.LapBestLapTime),
    incidentCount: numberValue(telemetry.PlayerCarMyIncidentCount),
    rawFlags: `0x${flags.toString(16).padStart(8, "0")}`,
    yellow: hasFlag(flags, GlobalFlags.Yellow) || hasFlag(flags, GlobalFlags.YellowWaving)
      || hasFlag(flags, GlobalFlags.Caution) || hasFlag(flags, GlobalFlags.CautionWaving),
    blue: hasFlag(flags, GlobalFlags.Blue),
    checkered: hasFlag(flags, GlobalFlags.Checkered),
    onPitRoad: booleanValue(telemetry.OnPitRoad),
    isOnTrack: booleanValue(telemetry.IsOnTrack) || booleanValue(telemetry.IsOnTrackCar),
    position: numberValue(telemetry.PlayerCarPosition),
    classPosition: numberValue(telemetry.PlayerCarClassPosition),
    sessionState: state,
    sessionStateName: state === undefined ? undefined : SessionState[state],
  }));
}

interface Variable<T> { value?: T[] }
function numberValue(variable: Variable<number> | undefined): number | undefined {
  return variable?.value?.[0];
}
function booleanValue(variable: Variable<boolean> | undefined): boolean {
  return variable?.value?.[0] === true;
}
function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}
