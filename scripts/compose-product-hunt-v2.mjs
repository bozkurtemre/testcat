import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "assets/product-hunt/v2");
const logoSvg = readFileSync(resolve(root, "assets/testcat-dark.svg"), "utf8");
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

const W = 1100;
const H = 546;
const font = "Avenir Next, SF Pro Display, Helvetica Neue, Arial, sans-serif";
const white = "#F6F8F7";
const teal = "#77D6B1";

const shots = [
  {
    id: "01-any-agent",
    title: "Any agent is supported",
    source:
      "/Users/emrebozkurt/.codex/generated_images/019eef20-0b27-7223-8fc9-c29b65369f35/ig_0d6322013ba353bf016a395c0c705c8191bd75009b290d3f21.png",
    titleSize: 64,
    logoY: 466,
  },
  {
    id: "02-live-simulators",
    title: "Watch every simulator live",
    source:
      "/Users/emrebozkurt/.codex/generated_images/019eef20-0b27-7223-8fc9-c29b65369f35/ig_0d6322013ba353bf016a395c451c788191879695301100d6ca.png",
    titleSize: 62,
    logoY: 466,
  },
  {
    id: "03-prompt-proof",
    title: "From prompt to proof",
    source:
      "/Users/emrebozkurt/.codex/generated_images/019eef20-0b27-7223-8fc9-c29b65369f35/ig_0d6322013ba353bf016a395c7c727c81918e5fbb5c7ed807a4.png",
    titleSize: 66,
    logoY: 466,
  },
];

mkdirSync(outDir, { recursive: true });

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fileDataUri(path) {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}

function logoLockup(y) {
  const width = 184;
  const height = 58;
  const x = (W - width) / 2;
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="#070909" fill-opacity="0.76" stroke="#263031" stroke-opacity="0.78"/>
      <image href="${logoDataUri}" x="${x + 13}" y="${y + 8}" width="42" height="42" preserveAspectRatio="xMidYMid meet"/>
      <text x="${x + 68}" y="${y + 38}" fill="${white}" font-family="${font}" font-size="30" font-weight="760">testcat</text>
    </g>
  `;
}

function compose({ id, title, source, titleSize, logoY }) {
  const bg = fileDataUri(source);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>${esc(title)} - testcat</title>
  <defs>
    <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.96"/>
      <stop offset="0.72" stop-color="#000000" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <filter id="titleShadow" x="-10%" y="-80%" width="120%" height="240%">
      <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000000" flood-opacity="0.52"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="#000000"/>
  <image href="${bg}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${W}" height="174" fill="url(#topFade)"/>
  <text x="${W / 2}" y="108" fill="${white}" font-family="${font}" font-size="${titleSize}" font-weight="760" letter-spacing="-2.2" text-anchor="middle" filter="url(#titleShadow)">${esc(title)}</text>
  <path d="M 430 139 C 506 151, 592 151, 670 139" stroke="${teal}" stroke-opacity="0.16" stroke-width="2" fill="none"/>
  ${logoLockup(logoY)}
</svg>`;
}

for (const shot of shots) {
  const svgPath = resolve(outDir, `testcat-product-hunt-${shot.id}.svg`);
  const pngPath = resolve(outDir, `testcat-product-hunt-${shot.id}.png`);
  writeFileSync(svgPath, compose(shot));
  execFileSync("rsvg-convert", ["--format", "png", "--width", String(W), "--height", String(H), "--output", pngPath, svgPath], {
    stdio: "inherit",
  });
  console.log(pngPath);
}
