import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import type { RaceCompanionState } from "../integrations/iracing/race-companion-types.ts";
import { parsePixooSettings, type PixooSettings } from "../integrations/iracing/pixoo-settings.ts";

const staticRoutes = new Map([
  ["/race", { file: new URL("./public/index.html", import.meta.url), contentType: "text/html; charset=utf-8" }],
  ["/race/", { file: new URL("./public/index.html", import.meta.url), contentType: "text/html; charset=utf-8" }],
  ["/race/styles.css", { file: new URL("./public/styles.css", import.meta.url), contentType: "text/css; charset=utf-8" }],
  ["/race/app.js", { file: new URL("./public/app.js", import.meta.url), contentType: "text/javascript; charset=utf-8" }],
  ["/race/manifest.webmanifest", { file: new URL("./public/manifest.webmanifest", import.meta.url), contentType: "application/manifest+json; charset=utf-8" }],
  ["/race/icon.svg", { file: new URL("./public/icon.svg", import.meta.url), contentType: "image/svg+xml" }],
] as const);

export interface RaceCompanionServerOptions {
  host?: string;
  port?: number;
  application?: string;
  pixooSettings?: { get(): PixooSettings; save(settings: PixooSettings): void };
}

export class RaceCompanionServer {
  private readonly host: string;
  private readonly port: number;
  private readonly application: string | undefined;
  private readonly getState: () => RaceCompanionState;
  private readonly pixooSettings: RaceCompanionServerOptions["pixooSettings"];
  private server: Server | null = null;

  constructor(getState: () => RaceCompanionState, options: RaceCompanionServerOptions = {}) {
    this.getState = getState;
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 8787;
    this.application = options.application;
    this.pixooSettings = options.pixooSettings;
  }

  async start(): Promise<AddressInfo> {
    if (this.server) throw new Error("Race Companion server is already running");
    const server = createServer(async (request, response) => {
      response.setHeader("Cache-Control", "no-store");
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (request.method === "GET" && pathname === "/api/health") {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.writeHead(200).end(JSON.stringify({
          ok: true, application: this.application, host: this.application === "deskhub" ? this.host : undefined,
        }));
        return;
      }
      if (request.method === "GET" && pathname === "/api/race/state") {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.writeHead(200).end(JSON.stringify(this.getState()));
        return;
      }
      if (pathname === "/api/pixoo/settings" && this.pixooSettings) {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        if (request.method === "GET") {
          response.writeHead(200).end(JSON.stringify(this.pixooSettings.get()));
          return;
        }
        if (request.method !== "PUT") {
          response.writeHead(405, { Allow: "GET, PUT" }).end();
          return;
        }
        if (request.headers["content-type"] !== "application/json") {
          response.writeHead(415).end();
          return;
        }
        let settings: PixooSettings;
        try {
          let body = "";
          for await (const chunk of request.iterator({ destroyOnReturn: false })) {
            body += String(chunk);
            if (body.length > 2048) {
              response.writeHead(413).end();
              return;
            }
          }
          settings = parsePixooSettings(JSON.parse(body));
        } catch {
          response.writeHead(400).end(JSON.stringify({ error: "Invalid Pixoo settings" }));
          return;
        }
        try {
          this.pixooSettings.save(settings);
          response.writeHead(200).end(JSON.stringify(settings));
        } catch (error) {
          console.error("[Pixoo] Settings could not be saved:", error);
          response.writeHead(500).end(JSON.stringify({ error: "Pixoo settings could not be saved" }));
        }
        return;
      }
      const asset = request.method === "GET" ? staticRoutes.get(pathname as never) : undefined;
      if (asset) {
        try {
          response.setHeader("Content-Type", asset.contentType);
          response.writeHead(200).end(await readFile(asset.file));
        } catch {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.writeHead(500).end(JSON.stringify({ error: "Static asset unavailable" }));
        }
        return;
      }
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
    });
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.port, this.host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    } catch (error) {
      this.server = null;
      throw error;
    }
    return server.address() as AddressInfo;
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
