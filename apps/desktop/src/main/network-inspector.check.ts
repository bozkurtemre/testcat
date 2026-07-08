// Durable network-inspector check. Run:
// pnpm --filter @testcat/desktop exec tsx src/main/network-inspector.check.ts
import assert from "node:assert/strict";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { NetworkEventMessage } from "@testcat/shared";
import { networkInspector } from "./network-inspector";

async function main(): Promise<void> {
  const upstream = http.createServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/capture?ok=1");
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      assert.equal(body, "hello");
      res.writeHead(201, {
        "content-type": "application/json",
        "x-testcat-check": "ok",
      });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress === "object");
  const upstreamPort = (upstreamAddress as AddressInfo).port;

  const sent: NetworkEventMessage[] = [];
  const runId = randomUUID();
  const { proxyUrl } = await networkInspector.start(runId, {
    isDestroyed: () => false,
    send: (_channel: string, msg: NetworkEventMessage) => {
      sent.push(msg);
    },
  });
  const proxy = new URL(proxyUrl);

  await new Promise<void>((resolve, reject) => {
    const req = http.request(
      {
        hostname: proxy.hostname,
        port: Number(proxy.port),
        method: "POST",
        path: `http://127.0.0.1:${upstreamPort}/capture?ok=1`,
        headers: {
          "content-type": "text/plain",
          "content-length": "5",
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            assert.equal(res.statusCode, 201);
            assert.equal(body, '{"ok":true}');
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.end("hello");
  });

  const snapshot = networkInspector.snapshot(runId);
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.proxyUrl, proxyUrl);
  assert.equal(snapshot.routing?.mode, "simulator-env");
  assert.equal(snapshot.routing?.status, "active");
  assert.ok(sent.length >= 2);
  assert.equal(snapshot.events.length, 1);
  const event = snapshot.events[0];
  assert.equal(event?.phase, "completed");
  assert.equal(event?.method, "POST");
  assert.equal(event?.statusCode, 201);
  assert.equal(event?.requestBytes, 5);
  assert.equal(event?.requestBodyPreview, "hello");
  assert.equal(event?.responseBodyPreview, '{"ok":true}');
  assert.match(event?.url ?? "", /\/capture\?ok=1$/);
  assert.equal(event?.responseHeaders?.["x-testcat-check"], "ok");

  const env = networkInspector.envForProxy(proxyUrl);
  assert.equal(env.TESTCAT_NETWORK_PROXY_URL, proxyUrl);
  assert.equal(env.SIMCTL_CHILD_http_proxy, proxyUrl);
  assert.equal(env.SIMCTL_CHILD_https_proxy, proxyUrl);
  assert.equal("HTTP_PROXY" in env, false);
  assert.equal("HTTPS_PROXY" in env, false);
  assert.equal("http_proxy" in env, false);
  assert.equal("https_proxy" in env, false);

  await new Promise<void>((resolve, reject) => {
    http.get(`${proxyUrl}/__testcat/events`, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body) as { events: unknown[] };
          assert.equal(res.statusCode, 200);
          assert.equal(parsed.events.length, 1);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });

  await networkInspector.stop(runId);
  await new Promise<void>((resolve) => upstream.close(() => resolve()));

  console.log("network inspector check: OK");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
