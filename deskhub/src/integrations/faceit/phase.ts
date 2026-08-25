import type { FaceitPhase, FaceitPlacementState } from "./types.ts";

export interface FaceitPhaseObservation { phase: FaceitPhase; placement?: FaceitPlacementState; }
export interface FaceitPhaseProvider { current(): FaceitPhaseObservation | null; }

export class ConfiguredFaceitPhaseProvider implements FaceitPhaseProvider {
  private readonly mode: "auto" | "ranked" | "placement";
  private readonly played: number;
  private readonly total: number;
  constructor(mode: "auto" | "ranked" | "placement", played: number, total: number) {
    this.mode = mode; this.played = played; this.total = total;
  }
  current(): FaceitPhaseObservation | null {
    if (this.mode === "auto") return null;
    if (this.mode === "ranked") return { phase: "ranked" };
    return { phase: "placement", placement: { played: this.played, wins: 0, losses: 0, total: this.total } };
  }
}
