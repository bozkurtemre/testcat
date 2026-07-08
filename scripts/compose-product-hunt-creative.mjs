import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "assets/product-hunt/creative-production");
const logoSvg = readFileSync(resolve(root, "assets/testcat-dark.svg"), "utf8");
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

const W = 1100;
const H = 546;
const font = "Helvetica Neue, Avenir Next, SF Pro Display, Arial, sans-serif";
const white = "#F7F7F5";
const teal = "#77D6B1";

const assets = [
  {
    id: "01-any-agent",
    title: "Any agent is supported",
    source:
      "/Users/emrebozkurt/.codex/generated_images/019eef20-0b27-7223-8fc9-c29b65369f35/ig_0a51285478cf3be4016a395f7d535881918185bbbae4e5d91a.png",
    imageY: 18,
    logo: { x: 132, y: 183, size: 94 },
    logoLockup: false,
  },
  {
    id: "02-watch-live",
    title: "Watch every simulator live",
    source:
      "/Users/emrebozkurt/.codex/generated_images/019eef20-0b27-7223-8fc9-c29b65369f35/ig_0a51285478cf3be4016a395fb70958819190ad37117f33aa2d.png",
    imageY: 20,
    logoLockup: true,
  },
  {
    id: "03-prompt-proof",
    title: "From prompt to proof",
    source:
      "/Users/emrebozkurt/.codex/generated_images/019eef20-0b27-7223-8fc9-c29b65369f35/ig_0a51285478cf3be4016a395ff2fa708191ae4dc4eccc703ced.png",
    imageY: 18,
    logoLockup: true,
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

function dataUri(path) {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}

function topTitle(title) {
  return `
    <rect x="0" y="0" width="${W}" height="154" fill="#000000" fill-opacity="0.76"/>
    <text x="${W / 2}" y="111" fill="${white}" font-family="${font}" font-size="67" font-weight="430" letter-spacing="-4.1" text-anchor="middle">${esc(title)}</text>
  `;
}

function bottomLogoLockup() {
  const x = 452;
  const y = 458;
  return `
    <g>
      <rect x="${x}" y="${y}" width="196" height="60" rx="23" fill="#050606" fill-opacity="0.68" stroke="#1F2728" stroke-opacity="0.9"/>
      <image href="${logoDataUri}" x="${x + 14}" y="${y + 8}" width="44" height="44" preserveAspectRatio="xMidYMid meet"/>
      <text x="${x + 72}" y="${y + 40}" fill="${white}" font-family="${font}" font-size="30" font-weight="650" letter-spacing="-0.8">testcat</text>
    </g>
  `;
}

function compose(asset) {
  const bg = dataUri(asset.source);
  const extraLogo = asset.logo
    ? `<image href="${logoDataUri}" x="${asset.logo.x}" y="${asset.logo.y}" width="${asset.logo.size}" height="${asset.logo.size}" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>${esc(asset.title)} - testcat Product Hunt creative</title>
  <defs>
    <filter id="logoLift" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.48"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="#000000"/>
  <image href="${bg}" x="0" y="${asset.imageY}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  ${topTitle(asset.title)}
  <g filter="url(#logoLift)">${extraLogo}</g>
  ${asset.logoLockup ? bottomLogoLockup() : ""}
</svg>`;
}

const manifest = {
  createdBy: "creative-production/generative-polish",
  dimensions: { width: W, height: H },
  logoSource: "assets/testcat-dark.svg",
  reference: "1100x546 Product Hunt gallery-style dark tile composition",
  exports: [],
};

for (const asset of assets) {
  const svgPath = resolve(outDir, `testcat-product-hunt-${asset.id}.svg`);
  const pngPath = resolve(outDir, `testcat-product-hunt-${asset.id}.png`);
  writeFileSync(svgPath, compose(asset));
  execFileSync("rsvg-convert", ["--format", "png", "--width", String(W), "--height", String(H), "--output", pngPath, svgPath], {
    stdio: "inherit",
  });
  manifest.exports.push({
    id: asset.id,
    title: asset.title,
    png: pngPath,
    svg: svgPath,
    sourceImage: asset.source,
  });
  console.log(pngPath);
}

writeFileSync(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
