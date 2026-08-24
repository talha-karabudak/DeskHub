import type {
  FaceitDataClient,
  FaceitHistoryItem,
  FaceitHistoryResponse,
  FaceitPlayer,
} from "./types.ts";

type Fetch = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;
const defaultSleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class FaceitApiError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(message: string, status?: number, retryable = false) {
    super(message);
    this.name = "FaceitApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

export interface FaceitApiClientOptions {
  apiKey: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseUrl?: string;
  fetch?: Fetch;
  sleep?: Sleep;
}

export class FaceitApiClient implements FaceitDataClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: Fetch;
  private readonly sleep: Sleep;

  constructor(options: FaceitApiClientOptions) {
    if (!options.apiKey) throw new Error("FACEIT_API_KEY is missing");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseUrl = options.baseUrl ?? "https://open.faceit.com/data/v4";
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  getPlayerByNickname(nickname: string): Promise<FaceitPlayer> {
    return this.get("/players", { nickname, game: "cs2" });
  }

  getPlayerById(playerId: string): Promise<FaceitPlayer> {
    return this.get(`/players/${encodeURIComponent(playerId)}`);
  }

  getMatchHistory(playerId: string, limit = 1): Promise<FaceitHistoryResponse> {
    return this.get(`/players/${encodeURIComponent(playerId)}/history`, {
      game: "cs2", offset: "0", limit: String(limit),
    });
  }

  getMatch(matchId: string): Promise<FaceitHistoryItem> {
    return this.get(`/matches/${encodeURIComponent(matchId)}`);
  }

  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.ok) return await response.json() as T;
        const error = this.responseError(response);
        if (!error.retryable || attempt === this.maxAttempts) throw error;
        await this.sleep(this.retryDelayMs(response, attempt));
      } catch (error) {
        lastError = error;
        if (error instanceof FaceitApiError && !error.retryable) throw error;
        if (attempt === this.maxAttempts) {
          if (error instanceof FaceitApiError) throw error;
          throw new FaceitApiError(
            error instanceof Error ? `FACEIT network request failed: ${error.message}` : "FACEIT network request failed",
            undefined,
            true,
          );
        }
        await this.sleep(250 * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  }

  private responseError(response: Response): FaceitApiError {
    if (response.status === 401 || response.status === 403) {
      return new FaceitApiError("FACEIT authentication failed", response.status, false);
    }
    if (response.status === 404) {
      return new FaceitApiError("FACEIT player or resource was not found", 404, false);
    }
    if (response.status === 429) {
      return new FaceitApiError("FACEIT rate limit exceeded", 429, true);
    }
    const retryable = response.status >= 500;
    return new FaceitApiError(`FACEIT API returned HTTP ${response.status}`, response.status, retryable);
  }

  private retryDelayMs(response: Response, attempt: number): number {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
      const dateDelay = Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(dateDelay) && dateDelay > 0) return dateDelay;
    }
    return 500 * 2 ** (attempt - 1);
  }
}
