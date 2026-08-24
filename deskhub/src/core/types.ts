export type DeskHubMode = "normal" | "faceit" | "iracing";

export interface DeskHubState {
  mode: DeskHubMode;
  pixoo: { screen: string; priority: number };
  queueLength: number;
  processing: boolean;
  lastError?: string;
}

export interface PixooTextView {
  kind: "text";
  text: string;
  color?: [number, number, number];
  scroll?: boolean;
}

export interface PixooFrameView {
  kind: "frame";
  pixels: number[];
  label: string;
}

export type PixooView = PixooTextView | PixooFrameView;

export interface DeskHubEvent {
  id: string;
  type: string;
  mode: DeskHubMode;
  priority: number;
  durationMs: number;
  view: PixooTextView;
}
