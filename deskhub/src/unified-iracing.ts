import type { UnifiedModeManager } from "./core/mode-manager.ts";
import { events } from "./core/events.ts";
import { IRacingPipeline } from "./integrations/iracing/pipeline.ts";
import type { RaceStateProjector } from "./integrations/iracing/race-state-projector.ts";
import type { IRacingTelemetrySource } from "./integrations/iracing/types.ts";

export function createUnifiedIRacingPipeline(
  source: IRacingTelemetrySource,
  manager: UnifiedModeManager,
  raceState: RaceStateProjector,
  log: (message: string) => void = console.error,
): IRacingPipeline {
  let sessionId: string | null = null;
  let fuelWarning = false;
  return new IRacingPipeline(source, {
    onIRacingTelemetry(snapshot) {
      manager.onIRacingTelemetry(snapshot);
      const { connection, fuel } = raceState.getState();
      if (connection.sessionId !== sessionId || !connection.sessionActive) {
        sessionId = connection.sessionId;
        fuelWarning = false;
      }
      const estimate = fuel.estimatedAtFinish;
      if (estimate === null || estimate >= 0.5) fuelWarning = false;
      if (connection.sessionActive && estimate !== null && estimate < 0 && !fuelWarning) {
        fuelWarning = true;
        manager.enqueueMany([events.lowFuel()]);
      }
    },
    enqueueMany: (events) => manager.enqueueMany(events),
    requestNormal: () => manager.requestNormal(),
    // Bluetooth/HTTP writes must never hold up the next dashboard snapshot.
    setUrgentOverlay: async (view) => {
      void manager.setUrgentOverlay(view).catch((error) => log(`[Pixoo] ${String(error)}`));
    },
    whenIdle: () => manager.whenIdle(),
  }, undefined, undefined, [raceState]);
}
