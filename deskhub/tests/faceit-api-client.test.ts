import assert from "node:assert/strict";
import test from "node:test";
import { FaceitApiClient, FaceitApiError } from "../src/integrations/faceit/api-client.ts";
import { loadFaceitConfig } from "../src/integrations/faceit/config.ts";

function response(status = 200, headers?: HeadersInit): Response {
  const body = status === 200 ? JSON.stringify({ player_id: "p1", nickname: "tester", games: { cs2: { skill_level: 8, faceit_elo: 1620 } } }) : "";
  return new Response(body, { status, headers });
}

test("429 honors Retry-After and retries successfully", async () => {
  let calls = 0;
  const delays: number[] = [];
  const client = new FaceitApiClient({ apiKey: "secret", maxAttempts: 3,
    fetch: async () => ++calls === 1 ? response(429, { "Retry-After": "1" }) : response(),
    sleep: async (ms) => { delays.push(ms); } });
  assert.equal((await client.getPlayerByNickname("tester")).player_id, "p1");
  assert.equal(calls, 2);
  assert.deepEqual(delays, [1000]);
});

test("500 uses bounded retries", async () => {
  let calls = 0;
  const client = new FaceitApiClient({ apiKey: "secret", maxAttempts: 3,
    fetch: async () => { calls++; return response(500); }, sleep: async () => {} });
  await assert.rejects(client.getPlayerByNickname("tester"), (error: unknown) =>
    error instanceof FaceitApiError && error.status === 500 && error.retryable);
  assert.equal(calls, 3);
});

test("authentication errors are never retried", async () => {
  let calls = 0;
  const client = new FaceitApiClient({ apiKey: "secret", fetch: async () => { calls++; return response(401); }, sleep: async () => {} });
  await assert.rejects(client.getPlayerByNickname("tester"), /authentication failed/);
  assert.equal(calls, 1);
});

test("configuration fails clearly when credentials are absent", () => {
  assert.throws(() => loadFaceitConfig({}), /FACEIT_API_KEY is missing/);
  assert.throws(() => loadFaceitConfig({ FACEIT_API_KEY: "x" }), /FACEIT_NICKNAME is missing/);
});
