export interface DisplayStatus {
  status: "ok" | "disconnected";
  connected: boolean;
  device_address: string;
  serial_port: string;
}

export interface ShowTextOptions {
  scroll?: boolean;
  duration?: number;
  fps?: number;
  color?: [number, number, number];
}

export interface PixooDisplay {
  getStatus(): Promise<DisplayStatus>;
  setBrightness(value: number): Promise<void>;
  showText(text: string, options?: ShowTextOptions): Promise<void>;
  showFrame(pixels: number[]): Promise<void>;
}

export type DisplayMode = "pixoo" | "none";

export class NullDisplay implements PixooDisplay {
  async getStatus(): Promise<DisplayStatus> {
    return { status: "disconnected", connected: false, device_address: "", serial_port: "" };
  }

  async setBrightness(_value: number): Promise<void> {}
  async showText(_text: string, _options?: ShowTextOptions): Promise<void> {}
  async showFrame(_pixels: number[]): Promise<void> {}
}

export function createDisplay(mode = "pixoo"): PixooDisplay {
  if (mode === "none") return new NullDisplay();
  if (mode === "pixoo" || mode === "") return new HttpPixooDisplay();
  throw new Error(`DESKHUB_DISPLAY must be "pixoo" or "none", received "${mode}"`);
}

export class HttpPixooDisplay implements PixooDisplay {
  private readonly baseUrl: string;

  constructor(baseUrl = "http://127.0.0.1:8765") {
    this.baseUrl = baseUrl;
  }

  async getStatus(): Promise<DisplayStatus> {
    return this.request<DisplayStatus>("/health");
  }

  async setBrightness(value: number): Promise<void> {
    await this.request("/brightness", { value });
  }

  async showText(text: string, options: ShowTextOptions = {}): Promise<void> {
    await this.request("/display/text", { text, ...options });
  }

  async showFrame(pixels: number[]): Promise<void> {
    await this.request("/display/frame", { pixels });
  }

  private async request<T = unknown>(path: string, body?: object): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? `Pixoo bridge returned HTTP ${response.status}`);
    }
    return payload;
  }
}
