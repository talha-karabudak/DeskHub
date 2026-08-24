import { HttpPixooDisplay } from "./pixoo-display.ts";

const pixoo = new HttpPixooDisplay();
const status = await pixoo.getStatus();
console.log("Pixoo bridge:", status);

await pixoo.showText("DESKHUB", {
  scroll: true,
  duration: 15,
  fps: 4,
  color: [0, 255, 255],
});

console.log("Milestone 2 complete: DESKHUB sent from TypeScript.");
