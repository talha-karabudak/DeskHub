export interface FaceitConfig {
  apiKey: string;
  nickname: string;
  pollIntervalMs: number;
  requestTimeoutMs: number;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function loadFaceitConfig(env: NodeJS.ProcessEnv = process.env): FaceitConfig {
  const apiKey = env.FACEIT_API_KEY?.trim();
  const nickname = env.FACEIT_NICKNAME?.trim();
  if (!apiKey) throw new Error("FACEIT_API_KEY is missing");
  if (!nickname) throw new Error("FACEIT_NICKNAME is missing");
  const pollIntervalMs = positiveInteger(env.FACEIT_POLL_INTERVAL_MS, 60_000, "FACEIT_POLL_INTERVAL_MS");
  if (pollIntervalMs < 30_000) throw new Error("FACEIT_POLL_INTERVAL_MS must be at least 30000");
  return {
    apiKey,
    nickname,
    pollIntervalMs,
    requestTimeoutMs: positiveInteger(env.FACEIT_REQUEST_TIMEOUT_MS, 8_000, "FACEIT_REQUEST_TIMEOUT_MS"),
  };
}
