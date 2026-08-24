import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonFaceitStateStore } from "../src/integrations/faceit/state-store.ts";

test("JSON state store saves atomically and loads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "deskhub-faceit-")); const path = join(directory, "faceit-state.json");
  try {
    const store = new JsonFaceitStateStore(path, () => {});
    const state = { playerId: "p1", nickname: "tester", lastSeenMatchId: "A", lastKnownElo: 887,
      processedMatchIds: ["A"], updatedAt: "2026-08-23T00:00:00Z" };
    await store.save(state); assert.deepEqual(await store.load(), state);
    await assert.rejects(readFile(`${path}.tmp`, "utf8"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("corrupted state safely returns null", async () => {
  const directory = await mkdtemp(join(tmpdir(), "deskhub-faceit-")); const path = join(directory, "faceit-state.json");
  try { await writeFile(path, "{broken", "utf8"); assert.equal(await new JsonFaceitStateStore(path, () => {}).load(), null); }
  finally { await rm(directory, { recursive: true, force: true }); }
});
