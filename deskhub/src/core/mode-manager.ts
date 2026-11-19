import type { PixooDisplay } from "../pixoo-display.ts";
import { iracingIdleView } from "../integrations/iracing/idle-view.ts";
import { spotterFrame } from "../integrations/iracing/animations.ts";
import { pixooDefaults, pixooEventSetting, type PixooSettings } from "../integrations/iracing/pixoo-settings.ts";
import type { IRacingTelemetry } from "../integrations/iracing/types.ts";
import { DeskHubCore } from "./deskhub-core.ts";
import { NormalModeClock } from "./normal-mode.ts";
import type { DeskHubEvent, DeskHubMode, PixooView } from "./types.ts";

type Sleep = (milliseconds: number) => Promise<void>;

export interface UnifiedModeManagerOptions {
  normalView?: () => PixooView;
  faceitView: () => PixooView;
  sleep?: Sleep;
  log?: (message: string) => void;
  pixooSettings?: PixooSettings;
}

const blankView: PixooView = { kind: "frame", label: "BLANK", pixels: Array<number>(16 * 16 * 3).fill(0) };

export class UnifiedModeManager {
  readonly core: DeskHubCore;
  private mode: DeskHubMode = "normal";
  private faceitActive = false;
  private iracingActive = false;
  private iracingPosition: number | undefined;
  private iracingCarLeftRight: number | undefined;
  private iracingYellow = false;
  private iracingBlue = false;
  private deferredFaceit = false;
  private pixooSettings: PixooSettings;
  private readonly normalView: () => PixooView;
  private readonly faceitView: () => PixooView;
  private readonly log: (message: string) => void;

  constructor(display: PixooDisplay, options: UnifiedModeManagerOptions) {
    this.normalView = options.normalView ?? (() => new NormalModeClock().view());
    this.faceitView = options.faceitView;
    this.log = options.log ?? console.log;
    this.pixooSettings = options.pixooSettings ?? pixooDefaults;
    this.core = new DeskHubCore(display, options.sleep, () => this.currentIdleView(), {
      idleMode: () => this.mode,
      canRenderEvent: (event) => event.mode === "faceit" ? this.mode !== "iracing"
        : event.mode === this.mode && this.isEventEnabled(event),
      retainBlockedEvent: (event) => event.mode === "faceit",
    });
  }

  get currentMode(): DeskHubMode { return this.mode; }

  setFaceitActive(active: boolean): void {
    if (this.faceitActive === active) return;
    this.faceitActive = active; this.reevaluate();
  }

  onIRacingTelemetry(snapshot: IRacingTelemetry): void {
    const active = snapshot.connected && snapshot.sessionActive === true;
    this.iracingPosition = active ? snapshot.position : undefined;
    this.iracingCarLeftRight = active ? snapshot.carLeftRight : undefined;
    this.iracingYellow = active && Boolean(snapshot.yellowFlag);
    this.iracingBlue = active && Boolean(snapshot.blueFlag);
    if (this.iracingActive === active) return;
    this.iracingActive = active; this.reevaluate();
  }

  deliver(events: DeskHubEvent[]): Promise<boolean> {
    if (this.mode === "iracing") {
      this.deferredFaceit = true;
      this.log("[FACEIT] Match result received while IRACING active");
      this.log("[FACEIT] Event deferred");
    }
    return this.core.deliver(events);
  }

  setPixooSettings(settings: PixooSettings): void {
    this.pixooSettings = settings;
    this.core.discardEvents((event) => !this.isEventEnabled(event));
    if (this.mode !== "iracing") return;
    const side = this.iracingCarLeftRight;
    const view = settings.spotter && side !== undefined && side >= 2 && side <= 6 ? spotterFrame(side) : undefined;
    void this.setUrgentOverlay(view).catch((error) => this.log(`[Pixoo] ${String(error)}`));
  }

  private isEventEnabled(event: DeskHubEvent): boolean {
    const setting = event.mode === "iracing" ? pixooEventSetting[event.type] : undefined;
    return setting === undefined || this.pixooSettings[setting];
  }

  enqueueMany(events: DeskHubEvent[]): void {
    this.core.enqueueMany(events.filter((event) => this.isEventEnabled(event)));
  }
  requestNormal(): void {
    if (this.mode === "iracing" && this.currentIdleView() === blankView
        && this.core.state.pixoo.screen === blankView.label && !this.core.state.lastError) return;
    this.core.requestNormal();
  }
  whenIdle(): Promise<void> { return this.core.whenIdle(); }

  async setUrgentOverlay(view: PixooView | undefined): Promise<void> {
    if (this.mode === "iracing") await this.core.setUrgentOverlay(this.pixooSettings.spotter ? view : undefined);
    else if (!view) await this.core.setUrgentOverlay(undefined);
  }

  refreshIdle(): void { this.core.requestNormal(); }
  stop(): Promise<void> { return this.core.stop(); }

  private reevaluate(): void {
    const next: DeskHubMode = this.iracingActive ? "iracing" : this.faceitActive ? "faceit" : "normal";
    if (next === this.mode) { this.core.requestNormal(); return; }
    const previous = this.mode;
    this.mode = next;
    if (previous === "iracing" && next !== "iracing") {
      this.log("[IRACING] Session ended");
      this.core.discardMode("iracing");
      void this.core.setUrgentOverlay(undefined);
      if (this.deferredFaceit) {
        this.log("[FACEIT] Releasing deferred result"); this.deferredFaceit = false;
      }
    }
    this.log(`[MODE] ${previous.toUpperCase()} -> ${next.toUpperCase()}`);
    this.core.notifyModeChanged();
  }

  private currentIdleView(): PixooView {
    if (this.mode === "iracing") {
      const settings = this.pixooSettings;
      const side = settings.spotter ? this.iracingCarLeftRight : undefined;
      const yellow = settings.yellow && this.iracingYellow;
      const blue = settings.blue && this.iracingBlue;
      if (!settings.position && !yellow && !blue && !(side !== undefined && side >= 2 && side <= 6)) return blankView;
      return iracingIdleView(settings.position ? this.iracingPosition : undefined, side, yellow, blue);
    }
    if (this.mode === "faceit") return this.faceitView();
    return this.normalView();
  }
}
