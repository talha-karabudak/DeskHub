export interface FaceitConfig {
  apiKey: string;
  nickname: string;
  activePollIntervalMs: number;
  idlePollIntervalMs: number;
  requestTimeoutMs: number;
  phaseMode: "auto" | "ranked" | "placement";
  placementPlayed: number;
  placementTotal: number;
  idleAnimationIntervalMs: number;
}

function positiveInteger(value: string | undefined, fallback: number, name: string, allowZero = false): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) throw new Error(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  return parsed;
}

export function loadFaceitConfig(env: NodeJS.ProcessEnv = process.env): FaceitConfig {
  const apiKey = env.FACEIT_API_KEY?.trim();
  const nickname = env.FACEIT_NICKNAME?.trim();
  if (!apiKey) throw new Error("FACEIT_API_KEY is missing");
  if (!nickname) throw new Error("FACEIT_NICKNAME is missing");
  const phaseMode = (env.FACEIT_PHASE ?? "auto") as FaceitConfig["phaseMode"];
  if (!["auto", "ranked", "placement"].includes(phaseMode)) throw new Error("FACEIT_PHASE must be auto, ranked, or placement");
  const activePollIntervalMs = positiveInteger(env.FACEIT_ACTIVE_POLL_INTERVAL_MS ?? env.FACEIT_POLL_INTERVAL_MS, 60_000, "FACEIT_ACTIVE_POLL_INTERVAL_MS");
  const idlePollIntervalMs = positiveInteger(env.FACEIT_IDLE_POLL_INTERVAL_MS, 300_000, "FACEIT_IDLE_POLL_INTERVAL_MS");
  if (activePollIntervalMs < 30_000) throw new Error("FACEIT_ACTIVE_POLL_INTERVAL_MS must be at least 30000");
  if (idlePollIntervalMs < 60_000) throw new Error("FACEIT_IDLE_POLL_INTERVAL_MS must be at least 60000");
  return {
    apiKey,
    nickname,
    activePollIntervalMs,
    idlePollIntervalMs,
    requestTimeoutMs: positiveInteger(env.FACEIT_REQUEST_TIMEOUT_MS, 8_000, "FACEIT_REQUEST_TIMEOUT_MS"),
    phaseMode,
    placementPlayed: positiveInteger(env.FACEIT_PLACEMENT_PLAYED, 0, "FACEIT_PLACEMENT_PLAYED", true),
    placementTotal: positiveInteger(env.FACEIT_PLACEMENT_TOTAL, 10, "FACEIT_PLACEMENT_TOTAL"),
    idleAnimationIntervalMs: positiveInteger(env.FACEIT_IDLE_ANIMATION_INTERVAL_MS, 4_500, "FACEIT_IDLE_ANIMATION_INTERVAL_MS"),
  };
}
