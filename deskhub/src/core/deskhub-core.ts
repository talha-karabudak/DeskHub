import type { PixooDisplay } from "../pixoo-display.ts";
import { PixooEventQueue } from "./event-queue.ts";
import type { DeskHubEvent, DeskHubState, PixooTextView, PixooView } from "./types.ts";

type Sleep = (milliseconds: number) => Promise<void>;
const defaultSleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const defaultNormalView = (): PixooTextView => ({
  kind: "text", text: "RDY", color: [0, 160, 255],
});

export class DeskHubCore {
  private readonly queue = new PixooEventQueue();
  private pumpPromise: Promise<void> | undefined;
  private normalRenderPromise: Promise<void> | undefined;
  private readonly sleep: Sleep;
  private readonly display: PixooDisplay;
  private readonly normalView: () => PixooView;
  readonly state: DeskHubState = {
    mode: "normal", pixoo: { screen: "READY", priority: 0 }, queueLength: 0, processing: false,
  };

  constructor(
    display: PixooDisplay,
    sleep: Sleep = defaultSleep,
    normalView: () => PixooView = defaultNormalView,
  ) {
    this.display = display;
    this.sleep = sleep;
    this.normalView = normalView;
  }

  enqueue(event: DeskHubEvent): void {
    this.queue.enqueue(event);
    this.state.queueLength = this.queue.length;
    this.startPump();
  }

  enqueueMany(events: DeskHubEvent[]): void {
    for (const item of events) this.queue.enqueue(item);
    this.state.queueLength = this.queue.length;
    this.startPump();
  }

  async whenIdle(): Promise<void> { await this.pumpPromise; }

  async showNormal(): Promise<void> {
    if (this.state.processing || this.queue.length > 0) return;
    if (this.normalRenderPromise) { await this.normalRenderPromise; return; }
    const view = this.normalView();
    this.state.mode = "normal";
    this.state.pixoo = { screen: view.kind === "text" ? view.text : view.label, priority: 0 };
    this.normalRenderPromise = this.render(view).finally(() => { this.normalRenderPromise = undefined; });
    await this.normalRenderPromise;
  }

  private startPump(): void {
    if (this.pumpPromise) return;
    this.pumpPromise = this.pump().finally(() => {
      this.pumpPromise = undefined;
      if (this.queue.length > 0) this.startPump();
    });
  }

  private async pump(): Promise<void> {
    if (this.normalRenderPromise) await this.normalRenderPromise;
    this.state.processing = true;
    try {
      let current: DeskHubEvent | undefined;
      while ((current = this.queue.dequeue())) {
        this.state.queueLength = this.queue.length;
        this.state.mode = current.mode;
        this.state.pixoo = { screen: this.viewLabel(current.view), priority: current.priority };
        if (current.view.kind === "text") {
          await this.display.showText(current.view.text, { color: current.view.color, scroll: current.view.scroll,
            duration: current.durationMs / 1000 });
          if (!current.view.scroll) await this.sleep(current.durationMs);
        } else {
          await this.render(current.view);
        }
      }
      await this.showNormalAfterEvents();
      delete this.state.lastError;
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.state.processing = false;
      this.state.queueLength = this.queue.length;
    }
  }

  private async showNormalAfterEvents(): Promise<void> {
    const view = this.normalView();
    this.state.mode = "normal";
    this.state.pixoo = { screen: view.kind === "text" ? view.text : view.label, priority: 0 };
    await this.render(view);
  }

  private async render(view: PixooView): Promise<void> {
    if (view.kind === "frame") await this.display.showFrame(view.pixels);
    else if (view.kind === "animation") {
      for (const frame of view.frames) { await this.display.showFrame(frame); await this.sleep(view.frameDurationMs); }
    } else await this.display.showText(view.text, { color: view.color, scroll: view.scroll });
  }

  private viewLabel(view: PixooView): string { return view.kind === "text" ? view.text : view.label; }
}
