import { randomUUID } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import type { AddressInfo } from "node:net";
import type { WebContents } from "electron";
import {
  IpcChannel,
  type NetworkActivity,
  type NetworkEventsSnapshot,
  type NetworkRoutingInfo,
} from "@testcat/shared";

const BODY_PREVIEW_LIMIT_BYTES = 64 * 1024;
const MAX_EVENTS_PER_RUN = 500;

type NetworkEmitter = Pick<WebContents, "send" | "isDestroyed">;

interface NetworkRunState {
  runId: string;
  server: http.Server;
  proxyUrl: string;
  routing: NetworkRoutingInfo;
  events: NetworkActivity[];
  sockets: Set<net.Socket>;
  wc: NetworkEmitter;
}

interface ProxyTarget {
  protocol: "http:" | "https:";
  hostname: string;
  port: number;
  host: string;
  path: string;
  href: string;
}

const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function headersToRecord(
  headers: http.IncomingHttpHeaders | http.OutgoingHttpHeaders,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    const normalized = key.toLowerCase();
    if (REDACTED_HEADERS.has(normalized)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

function upstreamHeaders(
  headers: http.IncomingHttpHeaders,
): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (
      normalized === "proxy-connection" ||
      normalized === "proxy-authorization" ||
      normalized === "connection"
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function appendPreview(chunks: Buffer[], chunk: Buffer): void {
  const used = chunks.reduce((sum, item) => sum + item.byteLength, 0);
  const remaining = BODY_PREVIEW_LIMIT_BYTES - used;
  if (remaining <= 0) return;
  chunks.push(chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk);
}

function bodyPreview(chunks: Buffer[]): string | undefined {
  if (!chunks.length) return undefined;
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\u0000/g, "")
    .slice(0, BODY_PREVIEW_LIMIT_BYTES);
}

function resolveHttpTarget(req: http.IncomingMessage): ProxyTarget {
  const rawUrl = req.url || "/";
  const absolute = /^https?:\/\//i.test(rawUrl);
  const host = headerValue(req.headers.host);
  if (!absolute && !host) throw new Error("missing Host header");

  const url = new URL(absolute ? rawUrl : `http://${host}${rawUrl}`);
  const protocol = url.protocol === "https:" ? "https:" : "http:";
  const port = Number(url.port || (protocol === "https:" ? 443 : 80));
  return {
    protocol,
    hostname: url.hostname,
    port,
    host: url.host,
    path: `${url.pathname}${url.search}`,
    href: url.href,
  };
}

function isControlEndpoint(req: http.IncomingMessage): boolean {
  const path = req.url || "";
  return (
    path === "/__testcat/health" ||
    path === "/__testcat/events" ||
    path.startsWith("/__testcat/events?")
  );
}

function writeControlEndpoint(
  state: NetworkRunState,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const path = req.url || "";
  const body =
    path === "/__testcat/health"
      ? { ok: true, runId: state.runId, proxyUrl: state.proxyUrl }
      : {
          runId: state.runId,
          proxyUrl: state.proxyUrl,
          events: state.events,
        };
  const json = JSON.stringify(body);
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
    "cache-control": "no-store",
  });
  res.end(json);
}

function resolveTunnelTarget(req: http.IncomingMessage): {
  host: string;
  hostname: string;
  port: number;
  href: string;
} {
  const raw = req.url || "";
  const lastColon = raw.lastIndexOf(":");
  if (lastColon <= 0) throw new Error("invalid CONNECT target");
  const hostname = raw.slice(0, lastColon);
  const port = Number(raw.slice(lastColon + 1) || 443);
  if (!Number.isFinite(port)) throw new Error("invalid CONNECT port");
  return {
    host: raw,
    hostname,
    port,
    href: `https://${raw}`,
  };
}

function duration(startedAtMs: number): number {
  return Math.max(0, Math.round(performance.now() - startedAtMs));
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close((error) => {
      if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
        console.error("[network] proxy server close failed", error);
      }
      resolve();
    });
  });
}

class NetworkInspector {
  private readonly runs = new Map<string, NetworkRunState>();
  private readonly snapshots = new Map<
    string,
    Omit<NetworkEventsSnapshot, "events"> & { events: NetworkActivity[] }
  >();

  async start(
    runId: string,
    wc: NetworkEmitter,
  ): Promise<{ proxyUrl: string; routing: NetworkRoutingInfo }> {
    const existing = this.runs.get(runId);
    if (existing) {
      return { proxyUrl: existing.proxyUrl, routing: existing.routing };
    }

    const state: NetworkRunState = {
      runId,
      server: http.createServer(),
      proxyUrl: "",
      routing: {
        mode: "simulator-env",
        status: "active",
      },
      events: [],
      sockets: new Set(),
      wc,
    };

    state.server.on("request", (req, res) =>
      this.handleHttpRequest(state, req, res),
    );
    state.server.on("connect", (req, socket, head) =>
      this.handleConnect(state, req, socket as net.Socket, head),
    );
    state.server.on("upgrade", (req, socket, head) =>
      this.handleUpgrade(state, req, socket as net.Socket, head),
    );

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        state.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        state.server.off("error", onError);
        resolve();
      };
      state.server.once("error", onError);
      state.server.once("listening", onListening);
      state.server.listen(0, "127.0.0.1");
    });

    const address = state.server.address() as AddressInfo;
    state.proxyUrl = `http://127.0.0.1:${address.port}`;
    this.runs.set(runId, state);
    this.snapshots.set(runId, {
      runId,
      enabled: true,
      proxyUrl: state.proxyUrl,
      routing: state.routing,
      events: state.events,
    });
    return { proxyUrl: state.proxyUrl, routing: state.routing };
  }

  async stop(runId: string): Promise<void> {
    const state = this.runs.get(runId);
    if (state) {
      this.runs.delete(runId);
      for (const socket of state.sockets) socket.destroy();
      state.sockets.clear();
      await closeServer(state.server);
    }
  }

  snapshot(runId: string): NetworkEventsSnapshot {
    const snapshot = this.snapshots.get(runId);
    if (!snapshot) {
      return { runId, enabled: false, proxyUrl: null, events: [] };
    }
    return {
      runId,
      enabled: snapshot.enabled,
      proxyUrl: snapshot.proxyUrl,
      routing: snapshot.routing,
      events: [...snapshot.events],
    };
  }

  envForProxy(proxyUrl: string): Record<string, string> {
    return {
      TESTCAT_NETWORK_CAPTURE: "1",
      TESTCAT_NETWORK_PROXY_URL: proxyUrl,
      SIMCTL_CHILD_http_proxy: proxyUrl,
      SIMCTL_CHILD_https_proxy: proxyUrl,
      SIMCTL_CHILD_HTTP_PROXY: proxyUrl,
      SIMCTL_CHILD_HTTPS_PROXY: proxyUrl,
      SIMCTL_CHILD_no_proxy: "127.0.0.1,localhost,::1",
      SIMCTL_CHILD_NO_PROXY: "127.0.0.1,localhost,::1",
    };
  }

  private record(state: NetworkRunState, event: NetworkActivity): void {
    const existing = state.events.findIndex((item) => item.id === event.id);
    if (existing >= 0) {
      state.events[existing] = event;
    } else {
      state.events.push(event);
      if (state.events.length > MAX_EVENTS_PER_RUN) state.events.shift();
    }

    if (!state.wc.isDestroyed()) {
      state.wc.send(IpcChannel.NetworkEvent, {
        runId: state.runId,
        event,
      });
    }
  }

  private handleHttpRequest(
    state: NetworkRunState,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    if (isControlEndpoint(req)) {
      writeControlEndpoint(state, req, res);
      return;
    }

    const id = randomUUID();
    const startedAt = nowIso();
    const startedAtMs = performance.now();
    let target: ProxyTarget;

    try {
      target = resolveHttpTarget(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(400);
      res.end(message);
      this.record(state, {
        id,
        runId: state.runId,
        phase: "failed",
        kind: "http",
        method: req.method ?? "GET",
        url: req.url ?? "",
        host: "",
        path: req.url ?? "",
        statusCode: 400,
        startedAt,
        completedAt: nowIso(),
        durationMs: duration(startedAtMs),
        requestBytes: 0,
        responseBytes: Buffer.byteLength(message),
        requestHeaders: headersToRecord(req.headers),
        error: message,
      });
      return;
    }

    let requestBytes = 0;
    let responseBytes = 0;
    const requestPreview: Buffer[] = [];
    const responsePreview: Buffer[] = [];
    const base: NetworkActivity = {
      id,
      runId: state.runId,
      phase: "started",
      kind: "http",
      method: req.method ?? "GET",
      url: target.href,
      host: target.host,
      path: target.path,
      statusCode: null,
      startedAt,
      requestBytes: 0,
      responseBytes: 0,
      requestHeaders: headersToRecord(req.headers),
    };
    this.record(state, base);

    const finish = (
      phase: "completed" | "failed",
      patch: Partial<NetworkActivity>,
    ) => {
      this.record(state, {
        ...base,
        ...patch,
        phase,
        completedAt: nowIso(),
        durationMs: duration(startedAtMs),
        requestBytes,
        responseBytes,
        requestBodyPreview: bodyPreview(requestPreview),
        responseBodyPreview: bodyPreview(responsePreview),
      });
    };

    const client = target.protocol === "https:" ? https : http;
    const proxyReq = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: target.path,
        headers: upstreamHeaders(req.headers),
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.on("data", (chunk: Buffer) => {
          responseBytes += chunk.byteLength;
          appendPreview(responsePreview, chunk);
          res.write(chunk);
        });
        proxyRes.on("end", () => {
          res.end();
          finish("completed", {
            statusCode: proxyRes.statusCode ?? null,
            responseHeaders: headersToRecord(proxyRes.headers),
          });
        });
      },
    );

    proxyReq.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) res.writeHead(502);
      res.end(message);
      responseBytes += Buffer.byteLength(message);
      finish("failed", { statusCode: 502, error: message });
    });

    req.on("data", (chunk: Buffer) => {
      requestBytes += chunk.byteLength;
      appendPreview(requestPreview, chunk);
    });
    req.pipe(proxyReq);
  }

  private handleConnect(
    state: NetworkRunState,
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer,
  ): void {
    const id = randomUUID();
    const startedAt = nowIso();
    const startedAtMs = performance.now();
    let requestBytes = head.byteLength;
    let responseBytes = 0;
    let target: ReturnType<typeof resolveTunnelTarget>;

    try {
      target = resolveTunnelTarget(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      clientSocket.end(`HTTP/1.1 400 Bad Request\r\n\r\n${message}`);
      return;
    }

    const base: NetworkActivity = {
      id,
      runId: state.runId,
      phase: "started",
      kind: "tunnel",
      method: "CONNECT",
      url: target.href,
      host: target.host,
      path: target.host,
      statusCode: null,
      startedAt,
      requestBytes,
      responseBytes,
      requestHeaders: headersToRecord(req.headers),
    };
    this.record(state, base);

    let finished = false;
    const finish = (phase: "completed" | "failed", error?: string) => {
      if (finished) return;
      finished = true;
      state.sockets.delete(clientSocket);
      state.sockets.delete(upstream);
      this.record(state, {
        ...base,
        phase,
        statusCode: error ? 502 : 200,
        completedAt: nowIso(),
        durationMs: duration(startedAtMs),
        requestBytes,
        responseBytes,
        error,
      });
    };

    const upstream = net.connect(target.port, target.hostname, () => {
      state.sockets.add(clientSocket);
      state.sockets.add(upstream);
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.byteLength) upstream.write(head);
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });

    clientSocket.on("data", (chunk) => {
      requestBytes += chunk.byteLength;
    });
    upstream.on("data", (chunk) => {
      responseBytes += chunk.byteLength;
    });
    upstream.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      clientSocket.destroy();
      finish("failed", message);
    });
    upstream.on("close", () => finish("completed"));
  }

  private handleUpgrade(
    state: NetworkRunState,
    req: http.IncomingMessage,
    socket: net.Socket,
    head: Buffer,
  ): void {
    const id = randomUUID();
    const startedAt = nowIso();
    const startedAtMs = performance.now();
    let target: ProxyTarget;
    let requestBytes = head.byteLength;
    let responseBytes = 0;

    try {
      target = resolveHttpTarget(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      socket.end(`HTTP/1.1 400 Bad Request\r\n\r\n${message}`);
      return;
    }

    const base: NetworkActivity = {
      id,
      runId: state.runId,
      phase: "started",
      kind: "websocket",
      method: req.method ?? "GET",
      url: target.href.replace(/^http:/, "ws:").replace(/^https:/, "wss:"),
      host: target.host,
      path: target.path,
      statusCode: null,
      startedAt,
      requestBytes,
      responseBytes,
      requestHeaders: headersToRecord(req.headers),
    };
    this.record(state, base);

    const upstream = net.connect(target.port, target.hostname, () => {
      state.sockets.add(socket);
      state.sockets.add(upstream);
      const headers = upstreamHeaders(req.headers);
      const lines = [
        `${req.method ?? "GET"} ${target.path} HTTP/${req.httpVersion}`,
        ...Object.entries(headers).flatMap(([key, value]) => {
          if (value == null) return [];
          return Array.isArray(value)
            ? value.map((item) => `${key}: ${item}`)
            : [`${key}: ${value}`];
        }),
        "",
        "",
      ];
      upstream.write(lines.join("\r\n"));
      if (head.byteLength) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });

    let finished = false;
    const finish = (phase: "completed" | "failed", error?: string) => {
      if (finished) return;
      finished = true;
      state.sockets.delete(socket);
      state.sockets.delete(upstream);
      this.record(state, {
        ...base,
        phase,
        statusCode: error ? 502 : 101,
        completedAt: nowIso(),
        durationMs: duration(startedAtMs),
        requestBytes,
        responseBytes,
        error,
      });
    };

    socket.on("data", (chunk) => {
      requestBytes += chunk.byteLength;
    });
    upstream.on("data", (chunk) => {
      responseBytes += chunk.byteLength;
    });
    upstream.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      socket.destroy();
      finish("failed", message);
    });
    upstream.on("close", () => finish("completed"));
  }
}

export const networkInspector = new NetworkInspector();
