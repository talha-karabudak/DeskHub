import { DeskHubCore } from "./core/deskhub-core.ts";
import { events } from "./core/events.ts";
import { HttpPixooDisplay } from "./pixoo-display.ts";

const pixoo = new HttpPixooDisplay();
console.log("Bridge status:", await pixoo.getStatus());
const core = new DeskHubCore(pixoo);
core.enqueueMany([events.personalBest(), events.faceitMatchWon(24), events.yellowFlag()]);
await core.whenIdle();
console.log("Milestone 3 complete:", core.state);
