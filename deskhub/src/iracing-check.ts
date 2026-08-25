import { IRacingSDK } from "irsdk-node";

console.log(`[IRACING] Simulator running: ${await IRacingSDK.IsSimRunning()}`);
