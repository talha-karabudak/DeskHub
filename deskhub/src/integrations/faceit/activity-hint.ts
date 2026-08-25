import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface FaceitActivityHint { isActive(): Promise<boolean>; }

const execFileAsync = promisify(execFile);
const PROCESS_NAMES = ["faceit.exe", "faceitclient.exe", "faceitclient_64.exe", "cs2.exe"];

export class WindowsProcessActivityHint implements FaceitActivityHint {
  async isActive(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    try {
      const { stdout } = await execFileAsync("tasklist.exe", ["/FO", "CSV", "/NH"], { windowsHide: true });
      const output = stdout.toLowerCase();
      return PROCESS_NAMES.some((name) => output.includes(`"${name}"`));
    } catch {
      return false;
    }
  }
}
