import { DeskHubCore } from "./core/deskhub-core.ts";
import { events } from "./core/events.ts";
import { NormalModeClock } from "./core/normal-mode.ts";
import { HttpPixooDisplay } from "./pixoo-display.ts";

const pixoo = new HttpPixooDisplay();
console.log("Bridge status:", await pixoo.getStatus());

const normalMode = new NormalModeClock();
const core = new DeskHubCore(pixoo, undefined, () => normalMode.view());

await core.showNormal();
await new Promise((resolve) => setTimeout(resolve, 2000));
core.enqueue(events.faceitMatchWon(24));
await core.whenIdle();

console.log("Milestone 4 complete:", core.state);
