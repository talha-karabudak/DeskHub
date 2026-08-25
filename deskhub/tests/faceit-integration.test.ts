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
  assert.equal(event?.view.kind, "animation");
  assert.equal(event?.view.kind === "animation" ? event.view.label : undefined, "VICTORY");
  assert.ok(event?.view.kind === "animation" && event.view.frames.some((frame) =>
    frame.some((value, index) => index % 3 === 1 && value === 255)));
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
  assert.deepEqual(sequence?.map((item) => item.view.kind === "text" ? item.view.text : item.view.label), ["VICTORY", "ELO DELTA"]);
  assert.ok(sequence?.every((item) => item.view.kind === "animation"));
});

test("unknown delta never renders zero or current total ELO", () => {
  const sequence = new FaceitEventAdapter().toEvents({ matchId: "match-3", won: false,
    eloBefore: 887, eloAfter: null, eloDelta: null, finishedAt: "2026-08-23T10:00:00Z" });
  assert.deepEqual(sequence?.map((item) => item.view.kind === "text" ? item.view.text : item.view.label), ["LOSS"]);
});

test("placement result renders progress instead of fake ELO", () => {
  const sequence = new FaceitEventAdapter().toEvents({ matchId: "placement-1", won: true,
    eloBefore: 0, eloAfter: null, eloDelta: null, finishedAt: "2026-08-23T10:00:00Z",
    phase: "placement", placement: { played: 4, wins: 3, losses: 1, total: 10 } });
  assert.deepEqual(sequence?.map((item) => item.view.kind === "text" ? item.view.text : item.view.label), ["VICTORY", "PLACEMENT"]);
});
