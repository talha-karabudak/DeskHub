import assert from "node:assert/strict";
import test from "node:test";
import { FaceitEventAdapter } from "../src/integrations/faceit/faceit-event-adapter.ts";

test("FACEIT win becomes a green priority event", () => {
  const adapter = new FaceitEventAdapter();
  const event = adapter.toEvent({
    matchId: "match-1", won: true, eloBefore: 1620, eloAfter: 1644,
    eloDelta: 24, finishedAt: "2026-08-23T10:00:00Z",
  });
  assert.equal(event?.type, "FaceitMatchWon");
  assert.equal(event?.priority, 70);
  assert.equal(event?.view.text, "VICTORY");
  assert.deepEqual(event?.view.color, [0, 255, 0]);
});

test("duplicate FACEIT match is ignored", () => {
  const adapter = new FaceitEventAdapter();
  const result = {
    matchId: "match-1", won: false, eloBefore: 1644, eloAfter: 1626,
    eloDelta: -18, finishedAt: "2026-08-23T10:00:00Z",
  };
  assert.ok(adapter.toEvent(result));
  assert.equal(adapter.toEvent(result), undefined);
});

test("known delta becomes a short result and delta sequence", () => {
  const sequence = new FaceitEventAdapter().toEvents({ matchId: "match-2", won: true,
    eloBefore: 887, eloAfter: 912, eloDelta: 25, finishedAt: "2026-08-23T10:00:00Z" });
  assert.deepEqual(sequence?.map((item) => item.view.text), ["VICTORY", "+25"]);
  assert.deepEqual(sequence?.map((item) => item.durationMs), [12000, 3000]);
});

test("unknown delta never renders zero or current total ELO", () => {
  const sequence = new FaceitEventAdapter().toEvents({ matchId: "match-3", won: false,
    eloBefore: 887, eloAfter: null, eloDelta: null, finishedAt: "2026-08-23T10:00:00Z" });
  assert.deepEqual(sequence?.map((item) => item.view.text), ["LOSS"]);
});
