import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FaceitPersistentState, FaceitStateStore } from "./types.ts";

export class JsonFaceitStateStore implements FaceitStateStore {
  private readonly path: string;
  private readonly log: (message: string) => void;

  constructor(path: string, log: (message: string) => void = (message) => console.log(`[FACEIT] ${message}`)) {
    this.path = path;
    this.log = log;
  }

  async load(): Promise<FaceitPersistentState | null> {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8")) as Partial<FaceitPersistentState>;
      if (!value.playerId || !value.nickname || !value.lastSeenMatchId ||
          (value.lastKnownElo !== null && !Number.isInteger(value.lastKnownElo)) ||
          !Array.isArray(value.processedMatchIds) || !value.updatedAt) throw new Error("invalid state shape");
      return value as FaceitPersistentState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.log("No persisted state found");
        return null;
      }
      this.log("Persistent state could not be read; creating a safe baseline");
      return null;
    }
  }

  async save(state: FaceitPersistentState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporary, this.path);
  }
}
