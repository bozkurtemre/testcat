import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  RunMediaAsset,
  RunMediaCaptureInput,
  RunMediaDeleteInput,
} from "@testcat/shared";
import { app } from "electron";
import { resolveDeviceBin } from "./devices/device-binary";
import { resolveSimBin } from "./devices/sim-binary";

type MediaMeta = Omit<RunMediaAsset, "dataUrl">;

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SAFE_RUN_ID_RE = /^[0-9a-fA-F-]{36}$/;

function assertSafeRunId(runId: string): void {
  if (!SAFE_RUN_ID_RE.test(runId)) throw new Error("Invalid run id.");
}

function assertSafeMediaId(mediaId: string): void {
  if (!SAFE_ID_RE.test(mediaId)) throw new Error("Invalid media id.");
}

function mediaRoot(): string {
  return join(app.getPath("userData"), "test-assets", "runs");
}

function mediaDir(runId: string): string {
  assertSafeRunId(runId);
  return join(mediaRoot(), runId, "media");
}

function jsonPath(runId: string, mediaId: string): string {
  assertSafeMediaId(mediaId);
  return join(mediaDir(runId), `${mediaId}.json`);
}

function imagePath(runId: string, mediaId: string, ext = "jpg"): string {
  assertSafeMediaId(mediaId);
  return join(mediaDir(runId), `${mediaId}.${ext}`);
}

function imageMime(path: string): string {
  return path.endsWith(".png") ? "image/png" : "image/jpeg";
}

function dataUrl(bytes: Buffer, path: string): string {
  return `data:${imageMime(path)};base64,${bytes.toString("base64")}`;
}

function screenshot(
  bin: string,
  udid: string,
  output: string,
  kind: "simulator" | "physical" = "simulator",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args =
      kind === "physical"
        ? ["screenshot", "--udid", udid, "--out", output]
        : ["screenshot", "--udid", udid, "--output", output];
    execFile(
      bin,
      args,
      { maxBuffer: 8 * 1024 * 1024 },
      (error) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

async function readAsset(meta: MediaMeta): Promise<RunMediaAsset | null> {
  if (!existsSync(meta.path)) return null;
  const bytes = await readFile(meta.path);
  return { ...meta, dataUrl: dataUrl(bytes, meta.path) };
}

export async function captureRunMedia(
  input: RunMediaCaptureInput,
): Promise<RunMediaAsset> {
  assertSafeRunId(input.runId);
  const id = randomUUID();
  const dir = mediaDir(input.runId);
  await mkdir(dir, { recursive: true });

  const kind = input.kind === "physical" ? "physical" : "simulator";
  const path = imagePath(input.runId, id, kind === "physical" ? "png" : "jpg");
  await screenshot(
    kind === "physical" ? resolveDeviceBin() : resolveSimBin(),
    input.udid,
    path,
    kind,
  );
  const file = await stat(path);
  const createdAt = new Date().toISOString();
  const meta: MediaMeta = {
    id,
    runId: input.runId,
    type: "screenshot",
    filename: basename(path),
    path,
    createdAt,
    sizeBytes: file.size,
    device: {
      udid: input.udid,
      name: input.deviceName ?? null,
      runtime: input.runtime ?? null,
      kind,
    },
  };
  await writeFile(jsonPath(input.runId, id), JSON.stringify(meta, null, 2));
  const asset = await readAsset(meta);
  if (!asset) throw new Error("Screenshot was not written.");
  return asset;
}

export async function listRunMedia(runId: string): Promise<RunMediaAsset[]> {
  const dir = mediaDir(runId);
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  const assets = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          const meta = JSON.parse(
            await readFile(join(dir, name), "utf8"),
          ) as MediaMeta;
          return await readAsset(meta);
        } catch {
          return null;
        }
      }),
  );
  return assets
    .filter((asset): asset is RunMediaAsset => Boolean(asset))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteRunMedia(input: RunMediaDeleteInput): Promise<void> {
  assertSafeRunId(input.runId);
  assertSafeMediaId(input.mediaId);
  await Promise.all([
    rm(imagePath(input.runId, input.mediaId), { force: true }),
    rm(imagePath(input.runId, input.mediaId, "png"), { force: true }),
    rm(jsonPath(input.runId, input.mediaId), { force: true }),
  ]);
}

export async function deleteRunMediaFolder(runId: string): Promise<void> {
  assertSafeRunId(runId);
  await rm(join(mediaRoot(), runId), { recursive: true, force: true });
}
