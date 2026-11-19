import type { DisplayStatus, PixooDisplay, ShowTextOptions } from "./pixoo-display.ts";

/** Keep offline display delivery pending without stopping the dashboard. */
export class OptionalPixooDisplay implements PixooDisplay {
  private connected = false;
  private readonly inner: PixooDisplay;
  private readonly onConnected: () => void;
  private readonly log: (message: string) => void;

  constructor(inner: PixooDisplay, onConnected: () => void, log = console.log) {
    this.inner = inner; this.onConnected = onConnected; this.log = log;
  }

  async getStatus(): Promise<DisplayStatus> { return this.inner.getStatus(); }

  async probe(): Promise<void> {
    try {
      const status = await this.inner.getStatus();
      const restored = status.connected && !this.connected;
      this.connected = status.connected;
      if (restored) {
        this.log("[Pixoo] Connected; restoring current display");
        this.onConnected();
      }
    } catch { this.markDisconnected(); }
  }

  async monitor(signal: AbortSignal, intervalMs = 3000): Promise<void> {
    while (!signal.aborted) {
      await this.probe();
      if (signal.aborted) break;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer); signal.removeEventListener("abort", finish); resolve();
        };
        const timer = setTimeout(finish, intervalMs);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
      });
    }
  }

  async setBrightness(value: number): Promise<void> { await this.write(() => this.inner.setBrightness(value)); }
  async showText(text: string, options?: ShowTextOptions): Promise<void> {
    await this.write(() => this.inner.showText(text, options));
  }
  async showFrame(pixels: number[]): Promise<void> { await this.write(() => this.inner.showFrame(pixels)); }

  private async write(action: () => Promise<void>): Promise<void> {
    if (!this.connected) throw new Error("Pixoo is offline; display delivery remains pending");
    try { await action(); }
    catch (error) { this.markDisconnected(); throw error; }
  }

  private markDisconnected(): void {
    if (this.connected) this.log("[Pixoo] Offline; Race Companion continues, reconnecting in background");
    this.connected = false;
  }
}
