import type { PixooDisplay } from "../pixoo-display.ts";
import { PixooEventQueue } from "./event-queue.ts";
import type { DeskHubEvent, DeskHubMode, DeskHubState, PixooTextView, PixooView } from "./types.ts";

type Sleep = (milliseconds: number) => Promise<void>;
const defaultSleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const defaultNormalView = (): PixooTextView => ({ kind: "text", text: "RDY", color: [0, 160, 255] });

export interface DeskHubCoreOptions {
  idleMode?: () => DeskHubMode;
  canRenderEvent?: (event: DeskHubEvent) => boolean;
  retainBlockedEvent?: (event: DeskHubEvent) => boolean;
}

interface DeliveryBatch { ids: Set<string>; resolve: (delivered: boolean) => void }

export class DeskHubCore {
  private readonly queue = new PixooEventQueue();
  private pumpPromise: Promise<void> | undefined;
  private normalRenderPromise: Promise<void> | undefined;
  private urgentOverlay: PixooView | undefined;
  private readonly acceptedIds = new Set<string>();
  private readonly completedIds = new Set<string>();
  private readonly deliveryBatches = new Set<DeliveryBatch>();
  private readonly sleep: Sleep;
  private readonly display: PixooDisplay;
  private readonly normalView: () => PixooView;
  private readonly idleMode: () => DeskHubMode;
  private readonly canRenderEvent: (event: DeskHubEvent) => boolean;
  private readonly retainBlockedEvent: (event: DeskHubEvent) => boolean;
  private stopped = false;
  readonly state: DeskHubState = {
    mode: "normal", pixoo: { screen: "READY", priority: 0 }, queueLength: 0, processing: false,
  };

  constructor(display: PixooDisplay, sleep: Sleep = defaultSleep, normalView: () => PixooView = defaultNormalView,
    options: DeskHubCoreOptions = {}) {
    this.display = display;
    this.sleep = sleep;
    this.normalView = normalView;
    this.idleMode = options.idleMode ?? (() => "normal");
    this.canRenderEvent = options.canRenderEvent ?? (() => true);
    this.retainBlockedEvent = options.retainBlockedEvent ?? (() => true);
  }

  enqueue(event: DeskHubEvent): void {
    if (this.stopped || this.acceptedIds.has(event.id) || this.completedIds.has(event.id)) return;
    this.queue.enqueue(event); this.acceptedIds.add(event.id);
    this.state.queueLength = this.queue.length; this.startPump();
  }

  enqueueMany(events: DeskHubEvent[]): void {
    if (this.stopped) return;
    for (const item of events) {
      if (this.acceptedIds.has(item.id) || this.completedIds.has(item.id)) continue;
      this.queue.enqueue(item); this.acceptedIds.add(item.id);
    }
    this.state.queueLength = this.queue.length; this.startPump();
  }

  deliver(events: DeskHubEvent[]): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false);
    const pending = events.filter((event) => !this.completedIds.has(event.id));
    if (pending.length === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const batch = { ids: new Set(pending.map((event) => event.id)), resolve };
      this.deliveryBatches.add(batch); this.enqueueMany(pending); this.settleDeliveryBatches();
    });
  }

  async whenIdle(): Promise<void> {
    while (this.pumpPromise || this.normalRenderPromise) {
      await Promise.all([this.pumpPromise, this.normalRenderPromise]);
    }
  }

  async setUrgentOverlay(view: PixooView | undefined): Promise<void> {
    if (this.stopped) return;
    this.urgentOverlay = view;
    if (view) await this.renderDirect(view); else this.requestNormal();
  }

  notifyModeChanged(): void {
    if (this.stopped) return;
    delete this.state.lastError; this.startPump(); this.requestNormal();
  }

  refreshDisplay(): void {
    if (this.stopped) return;
    this.notifyModeChanged();
    if (this.urgentOverlay) {
      void this.renderDirect(this.urgentOverlay).catch((error) => {
        this.state.lastError = error instanceof Error ? error.message : String(error);
      });
    }
  }

  discardMode(mode: DeskHubMode): void {
    this.discardEvents((event) => event.mode === mode);
  }

  discardEvents(predicate: (event: DeskHubEvent) => boolean): void {
    for (const event of this.queue.remove(predicate)) this.acceptedIds.delete(event.id);
    this.state.queueLength = this.queue.length;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const batch of this.deliveryBatches) batch.resolve(false);
    this.deliveryBatches.clear();
    await this.whenIdle().catch(() => {});
  }

  async showNormal(): Promise<void> {
    if (this.stopped || this.state.processing || this.queue.has(this.canRenderEvent)) return;
    if (this.normalRenderPromise) {
      await this.normalRenderPromise;
      const desired = this.normalView();
      if (!this.stopped && !this.state.processing && !this.queue.has(this.canRenderEvent)
          && (this.state.mode !== this.idleMode() || this.state.pixoo.screen !== this.viewLabel(desired))) {
        await this.showNormal();
      }
      return;
    }
    const view = this.normalView(); this.setIdleState(view);
    this.normalRenderPromise = this.render(view).then(() => undefined).finally(() => { this.normalRenderPromise = undefined; });
    await this.normalRenderPromise;
  }

  requestNormal(): void {
    void this.showNormal().catch((error) => { this.state.lastError = error instanceof Error ? error.message : String(error); });
  }

  private startPump(): void {
    if (this.stopped || this.pumpPromise || !this.queue.has(this.canRenderEvent)) return;
    delete this.state.lastError;
    this.pumpPromise = this.pump().finally(() => {
      this.pumpPromise = undefined;
      if (!this.stopped && this.queue.has(this.canRenderEvent)) this.startPump();
    });
    void this.pumpPromise.catch(() => {});
  }

  private async pump(): Promise<void> {
    if (this.normalRenderPromise) await this.normalRenderPromise;
    this.state.processing = true;
    try {
      let current: DeskHubEvent | undefined;
      while (!this.stopped && (current = this.queue.dequeue(this.canRenderEvent))) {
        this.state.queueLength = this.queue.length; this.state.mode = current.mode;
        this.state.pixoo = { screen: this.viewLabel(current.view), priority: current.priority };
        let releaseAccepted = true;
        try {
          if (!await this.renderEvent(current)) {
            if (this.retainBlockedEvent(current)) {
              this.queue.enqueue(current); releaseAccepted = false;
            }
            break;
          }
          this.completedIds.add(current.id); this.settleDeliveryBatches();
        } catch (error) {
          this.failDeliveryBatches(current.id); throw error;
        } finally {
          if (releaseAccepted) this.acceptedIds.delete(current.id);
        }
      }
      if (!this.stopped) await this.showNormalAfterEvents();
      delete this.state.lastError;
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : String(error); throw error;
    } finally {
      this.state.processing = false; this.state.queueLength = this.queue.length;
    }
  }

  private async renderEvent(event: DeskHubEvent): Promise<boolean> {
    if (!this.canRenderEvent(event)) return false;
    if (event.view.kind === "text") {
      if (!this.urgentOverlay) await this.display.showText(event.view.text, {
        color: event.view.color, scroll: event.view.scroll, duration: event.durationMs / 1000,
      });
      if (!event.view.scroll) await this.sleep(event.durationMs);
      return this.canRenderEvent(event);
    }
    if (event.view.kind === "frame") {
      if (!this.urgentOverlay) await this.display.showFrame(event.view.pixels);
      return this.canRenderEvent(event);
    }
    for (const frame of event.view.frames) {
      if (!this.canRenderEvent(event)) return false;
      if (!this.urgentOverlay) await this.display.showFrame(frame);
      await this.sleep(event.view.frameDurationMs);
    }
    return this.canRenderEvent(event);
  }

  private async showNormalAfterEvents(): Promise<void> {
    const view = this.normalView(); this.setIdleState(view); await this.render(view);
  }

  private setIdleState(view: PixooView): void {
    this.state.mode = this.idleMode();
    this.state.pixoo = { screen: this.viewLabel(view), priority: 0 };
  }

  private async render(view: PixooView): Promise<boolean> {
    if (view.kind === "frame") {
      if (!this.urgentOverlay) await this.display.showFrame(view.pixels);
    } else if (view.kind === "animation") {
      for (const frame of view.frames) {
        if (!this.urgentOverlay) await this.display.showFrame(frame);
        await this.sleep(view.frameDurationMs);
      }
    } else if (!this.urgentOverlay) await this.display.showText(view.text, { color: view.color, scroll: view.scroll });
    return true;
  }

  private async renderDirect(view: PixooView): Promise<void> {
    if (view.kind === "frame") await this.display.showFrame(view.pixels);
    else if (view.kind === "animation") await this.display.showFrame(view.frames[0]);
    else await this.display.showText(view.text, { color: view.color, scroll: view.scroll });
  }

  private settleDeliveryBatches(): void {
    for (const batch of [...this.deliveryBatches]) {
      if ([...batch.ids].every((id) => this.completedIds.has(id))) {
        this.deliveryBatches.delete(batch); batch.resolve(true);
      }
    }
  }

  private failDeliveryBatches(failedId: string): void {
    for (const batch of [...this.deliveryBatches]) {
      if (!batch.ids.has(failedId)) continue;
      this.deliveryBatches.delete(batch);
      for (const event of this.queue.remove((item) => batch.ids.has(item.id))) this.acceptedIds.delete(event.id);
      batch.resolve(false);
    }
  }

  private viewLabel(view: PixooView): string { return view.kind === "text" ? view.text : view.label; }
}
