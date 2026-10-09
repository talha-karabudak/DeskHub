import assert from "node:assert/strict";
import test from "node:test";
import { RaceStateProjector } from "../src/integrations/iracing/race-state-projector.ts";
import { RaceCompanionServer } from "../src/race-companion/server.ts";

test("health and race state are JSON, no-store, and unknown routes are 404", async (context) => {
  const projector = new RaceStateProjector();
  projector.update({ connected: true, sessionActive: true, sessionId: "race", position: 4 });
  const server = new RaceCompanionServer(() => projector.getState(), { port: 0 });
  const address = await server.start();
  context.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.deepEqual(await health.json(), { ok: true });

  const race = await fetch(`${baseUrl}/api/race/state`);
  assert.equal(race.status, 200);
  assert.equal(race.headers.get("cache-control"), "no-store");
  const state = await race.json();
  assert.equal(state.position.current, 4);

  const missing = await fetch(`${baseUrl}/missing`);
  assert.equal(missing.status, 404);
});

test("race dashboard and its static assets are served from the same origin", async (context) => {
  const projector = new RaceStateProjector();
  const server = new RaceCompanionServer(() => projector.getState(), { port: 0 });
  const address = await server.start();
  context.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const page = await fetch(`${baseUrl}/race`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
  assert.match(await page.text(), /Race Companion/);

  const css = await fetch(`${baseUrl}/race/styles.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type") ?? "", /^text\/css/);

  const script = await fetch(`${baseUrl}/race/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(await script.text(), /\/api\/race\/state/);

  const manifest = await fetch(`${baseUrl}/race/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get("content-type") ?? "", /^application\/manifest\+json/);
  assert.deepEqual((await manifest.json()).display, "standalone");

  const icon = await fetch(`${baseUrl}/race/icon.svg`);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get("content-type") ?? "", /^image\/svg\+xml/);

  const api = await fetch(`${baseUrl}/api/race/state`);
  assert.equal(api.status, 200);
  assert.match(api.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await api.json(), projector.getState());
});

test("server on an ephemeral port closes gracefully", async () => {
  const projector = new RaceStateProjector();
  const server = new RaceCompanionServer(() => projector.getState(), { host: "127.0.0.1", port: 0 });
  const address = await server.start();
  assert.ok(address.port > 0);
  await server.close();
  await server.close();
  await assert.rejects(fetch(`http://127.0.0.1:${address.port}/api/health`));
});
