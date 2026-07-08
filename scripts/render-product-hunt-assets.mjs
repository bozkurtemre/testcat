import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "assets/product-hunt");
const logoPng = readFileSync(resolve(root, "assets/Icon-iOS-Default-dark-1024x1024@1x.png"));
const logoDataUri = `data:image/png;base64,${logoPng.toString("base64")}`;

const W = 1100;
const H = 546;
const teal = "#77D6B1";
const brandTeal = "#6CBFA6";
const ink = "#050505";
const tile = "#1A1D1E";
const tile2 = "#151819";
const border = "#2A2E31";
const white = "#F6F8F7";
const muted = "#8D9491";
const amber = "#F4B56F";
const red = "#FF665C";
const font = "Avenir Next, SF Pro Display, Helvetica Neue, Arial, sans-serif";
const mono = "SF Mono, JetBrains Mono, Menlo, monospace";

mkdirSync(outDir, { recursive: true });

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svgShell(title, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>${esc(title)}</title>
  <defs>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="0.38"/>
    </filter>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <linearGradient id="tileShine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#242829"/>
      <stop offset="1" stop-color="#151718"/>
    </linearGradient>
    <linearGradient id="screenGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#101314"/>
      <stop offset="1" stop-color="#202526"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${ink}"/>
  <rect width="${W}" height="${H}" fill="url(#grain)" opacity="0.04"/>
  ${body}
</svg>`;
}

function headline(text, y = 104, size = 66) {
  return `<text x="${W / 2}" y="${y}" fill="${white}" font-family="${font}" font-size="${size}" font-weight="700" letter-spacing="-2" text-anchor="middle">${esc(text)}</text>`;
}

function logoLockup(x, y, size = 48, label = "testcat") {
  return `
    <image href="${logoDataUri}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${x + size + 14}" y="${y + size / 2 + 10}" fill="${white}" font-family="${font}" font-size="${30}" font-weight="700">${esc(label)}</text>
  `;
}

function roundedTile(x, y, w, h, content, opts = {}) {
  const fill = opts.fill ?? "url(#tileShine)";
  const stroke = opts.stroke ?? "#232728";
  return `
    <g filter="${opts.shadow === false ? "" : "url(#softShadow)"}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${opts.rx ?? 28}" fill="${fill}" stroke="${stroke}" stroke-width="${opts.strokeWidth ?? 1}"/>
      <path d="M ${x + 20} ${y + 1} H ${x + w - 20}" stroke="#FFFFFF" stroke-opacity="0.055" stroke-width="1"/>
      ${content}
    </g>
  `;
}

function iconPrompt(cx, cy, scale = 1) {
  return `
    <rect x="${cx - 31 * scale}" y="${cy - 25 * scale}" width="${62 * scale}" height="${44 * scale}" rx="${11 * scale}" fill="none" stroke="${teal}" stroke-width="${5 * scale}"/>
    <path d="M ${cx - 10 * scale} ${cy + 20 * scale} L ${cx - 22 * scale} ${cy + 34 * scale} L ${cx + 4 * scale} ${cy + 22 * scale}" fill="none" stroke="${teal}" stroke-width="${5 * scale}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M ${cx - 12 * scale} ${cy - 5 * scale} H ${cx + 16 * scale} M ${cx - 12 * scale} ${cy + 9 * scale} H ${cx + 8 * scale}" stroke="${white}" stroke-width="${4 * scale}" stroke-linecap="round"/>
  `;
}

function iconAgent(cx, cy, scale = 1) {
  return `
    <circle cx="${cx}" cy="${cy}" r="${31 * scale}" fill="none" stroke="${teal}" stroke-width="${5 * scale}"/>
    <circle cx="${cx - 12 * scale}" cy="${cy - 5 * scale}" r="${4.5 * scale}" fill="${white}"/>
    <circle cx="${cx + 12 * scale}" cy="${cy - 5 * scale}" r="${4.5 * scale}" fill="${white}"/>
    <path d="M ${cx - 13 * scale} ${cy + 13 * scale} Q ${cx} ${cy + 23 * scale} ${cx + 13 * scale} ${cy + 13 * scale}" fill="none" stroke="${white}" stroke-width="${4 * scale}" stroke-linecap="round"/>
    <path d="M ${cx + 28 * scale} ${cy - 39 * scale} L ${cx + 35 * scale} ${cy - 22 * scale} L ${cx + 51 * scale} ${cy - 15 * scale} L ${cx + 35 * scale} ${cy - 8 * scale} L ${cx + 28 * scale} ${cy + 9 * scale} L ${cx + 21 * scale} ${cy - 8 * scale} L ${cx + 5 * scale} ${cy - 15 * scale} L ${cx + 21 * scale} ${cy - 22 * scale} Z" fill="${amber}"/>
  `;
}

function iconPhone(cx, cy, scale = 1, accent = teal) {
  return `
    <rect x="${cx - 23 * scale}" y="${cy - 39 * scale}" width="${46 * scale}" height="${78 * scale}" rx="${11 * scale}" fill="none" stroke="${accent}" stroke-width="${5 * scale}"/>
    <path d="M ${cx - 8 * scale} ${cy - 29 * scale} H ${cx + 8 * scale}" stroke="${white}" stroke-width="${3.5 * scale}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy + 24 * scale}" r="${3.5 * scale}" fill="${white}"/>
    <circle cx="${cx + 13 * scale}" cy="${cy - 4 * scale}" r="${15 * scale}" fill="none" stroke="${amber}" stroke-width="${4 * scale}"/>
    <circle cx="${cx + 13 * scale}" cy="${cy - 4 * scale}" r="${4 * scale}" fill="${amber}"/>
  `;
}

function iconTap(cx, cy, scale = 1) {
  return `
    <path d="M ${cx - 10 * scale} ${cy - 34 * scale} V ${cy + 10 * scale} L ${cx + 5 * scale} ${cy + 44 * scale}" fill="none" stroke="${white}" stroke-width="${7 * scale}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M ${cx - 10 * scale} ${cy - 4 * scale} C ${cx + 2 * scale} ${cy - 16 * scale}, ${cx + 19 * scale} ${cy - 12 * scale}, ${cx + 23 * scale} ${cy + 5 * scale} L ${cx + 32 * scale} ${cy + 40 * scale}" fill="none" stroke="${teal}" stroke-width="${7 * scale}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M ${cx - 30 * scale} ${cy - 42 * scale} L ${cx - 44 * scale} ${cy - 56 * scale} M ${cx - 10 * scale} ${cy - 50 * scale} V ${cy - 70 * scale} M ${cx + 12 * scale} ${cy - 42 * scale} L ${cx + 28 * scale} ${cy - 58 * scale}" stroke="${amber}" stroke-width="${4 * scale}" stroke-linecap="round"/>
  `;
}

function iconCheck(cx, cy, scale = 1) {
  return `
    <circle cx="${cx}" cy="${cy}" r="${38 * scale}" fill="#0F201B" stroke="${teal}" stroke-width="${5 * scale}"/>
    <path d="M ${cx - 19 * scale} ${cy + 1 * scale} L ${cx - 4 * scale} ${cy + 16 * scale} L ${cx + 24 * scale} ${cy - 18 * scale}" fill="none" stroke="${white}" stroke-width="${7 * scale}" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

function iconChart(cx, cy, scale = 1) {
  return `
    <path d="M ${cx - 36 * scale} ${cy + 35 * scale} H ${cx + 38 * scale}" stroke="${muted}" stroke-width="${4 * scale}" stroke-linecap="round"/>
    <rect x="${cx - 30 * scale}" y="${cy + 4 * scale}" width="${11 * scale}" height="${30 * scale}" rx="${4 * scale}" fill="${teal}"/>
    <rect x="${cx - 7 * scale}" y="${cy - 18 * scale}" width="${11 * scale}" height="${52 * scale}" rx="${4 * scale}" fill="${amber}"/>
    <rect x="${cx + 16 * scale}" y="${cy - 34 * scale}" width="${11 * scale}" height="${68 * scale}" rx="${4 * scale}" fill="${white}"/>
    <path d="M ${cx - 33 * scale} ${cy - 25 * scale} C ${cx - 12 * scale} ${cy - 44 * scale}, ${cx + 10 * scale} ${cy - 43 * scale}, ${cx + 33 * scale} ${cy - 59 * scale}" fill="none" stroke="${teal}" stroke-width="${4 * scale}" stroke-linecap="round"/>
  `;
}

function smallLabel(text, x, y) {
  return `<text x="${x}" y="${y}" fill="${muted}" font-family="${font}" font-size="18" font-weight="600" text-anchor="middle">${esc(text)}</text>`;
}

function agentSupport() {
  const tileW = 122;
  const gap = 18;
  const start = (W - (tileW * 6 + gap * 5)) / 2;
  const y = 170;
  const icons = [
    (cx, cy) => `<image href="${logoDataUri}" x="${cx - 45}" y="${cy - 47}" width="90" height="90" preserveAspectRatio="xMidYMid meet"/>`,
    iconPrompt,
    iconAgent,
    iconPhone,
    iconTap,
    iconCheck,
  ];
  const labels = ["testcat", "Prompt", "Agent", "Simulator", "Tap", "Result"];
  const row = icons
    .map((fn, i) => {
      const x = start + i * (tileW + gap);
      return roundedTile(
        x,
        y,
        tileW,
        122,
        `${fn(x + tileW / 2, y + 58, 0.86)}${i === 0 ? "" : smallLabel(labels[i], x + tileW / 2, y + 104)}`,
      );
    })
    .join("\n");
  const lower = [
    [300, "Claude Code"],
    [440, "Codex"],
    [580, "Custom CLI"],
    [720, "Any profile"],
    [860, "One flow"],
  ]
    .map(([x, text], i) =>
      roundedTile(
        x - 61,
        324,
        122,
        100,
        `${i === 0 ? iconAgent(x, 362, 0.58) : i === 1 ? iconPrompt(x, 362, 0.58) : i === 2 ? iconChart(x, 362, 0.58) : i === 3 ? iconPhone(x, 362, 0.58, brandTeal) : iconCheck(x, 362, 0.58)}${smallLabel(text, x, 406)}`,
        { rx: 25 },
      ),
    )
    .join("\n");

  return svgShell(
    "Any agent is supported",
    `
    ${headline("Any agent is supported", 111, 65)}
    ${row}
    ${lower}
    ${logoLockup(456, 462, 52)}
  `,
  );
}

function simulatorScreen(x, y, w, h, variant, live = false) {
  const accent = live ? teal : variant % 2 ? amber : brandTeal;
  const rows = [
    `<rect x="${x + 15}" y="${y + 20}" width="${w - 30}" height="10" rx="5" fill="${accent}" opacity="0.92"/>`,
    `<rect x="${x + 15}" y="${y + 43}" width="${w * 0.55}" height="7" rx="3.5" fill="${white}" opacity="0.75"/>`,
    `<rect x="${x + 15}" y="${y + 64}" width="${w - 30}" height="${variant % 3 === 0 ? 20 : 12}" rx="6" fill="#2B3031"/>`,
    `<rect x="${x + 15}" y="${y + 90}" width="${w - 30}" height="${variant % 3 === 1 ? 20 : 12}" rx="6" fill="#24292A"/>`,
    `<rect x="${x + 15}" y="${y + 116}" width="${w * 0.44}" height="12" rx="6" fill="${accent}" opacity="0.72"/>`,
  ];
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="url(#screenGrad)" stroke="${live ? teal : border}" stroke-width="${live ? 3 : 1.2}"/>
      <circle cx="${x + w / 2}" cy="${y + 8}" r="2.5" fill="${muted}" opacity="0.75"/>
      ${rows.join("\n")}
      ${live ? `<circle cx="${x + w - 18}" cy="${y + 18}" r="5" fill="${teal}" filter="url(#glow)"/>` : ""}
    </g>
  `;
}

function liveGrid() {
  const sx = 304;
  const sy = 169;
  const w = 134;
  const h = 156;
  const gap = 20;
  const screens = Array.from({ length: 5 }, (_, i) =>
    simulatorScreen(sx + i * (w + gap), sy, w, h, i, i === 2),
  ).join("\n");
  const chatLines = [0.92, 0.62, 0.78, 0.48, 0.86, 0.58]
    .map((width, i) => {
      const y = 212 + i * 22;
      return `<rect x="102" y="${y}" width="${110 * width}" height="8" rx="4" fill="${i % 3 === 0 ? teal : "#3A4142"}" opacity="${i % 3 === 0 ? 0.95 : 0.82}"/>`;
    })
    .join("\n");

  return svgShell(
    "Watch every simulator live",
    `
    ${headline("Watch every simulator live", 110, 63)}
    ${roundedTile(70, 170, 188, 178, `
      <text x="101" y="200" fill="${teal}" font-family="${mono}" font-size="14" font-weight="700">agent stream</text>
      ${chatLines}
      <path d="M 105 348 H 221" stroke="${border}" stroke-width="1"/>
      <text x="105" y="374" fill="${muted}" font-family="${mono}" font-size="13">running tap...</text>
    `, { rx: 28 })}
    <g filter="url(#softShadow)">${screens}</g>
    ${roundedTile(401, 360, 298, 68, `
      <image href="${logoDataUri}" x="415" y="370" width="48" height="48"/>
      <text x="479" y="402" fill="${white}" font-family="${font}" font-size="24" font-weight="700">testcat live grid</text>
      <circle cx="664" cy="394" r="5" fill="${teal}" filter="url(#glow)"/>
    `, { rx: 22, shadow: false, fill: tile2 })}
  `,
  );
}

function pipeline() {
  const start = 178;
  const y = 190;
  const tileW = 132;
  const gap = 44;
  const labels = ["Scenario", "Profile", "Action", "Result", "History"];
  const icons = [iconPrompt, iconAgent, iconPhone, iconCheck, iconChart];
  const connector = Array.from({ length: 4 }, (_, i) => {
    const x1 = start + tileW + i * (tileW + gap) + 10;
    const x2 = start + (i + 1) * (tileW + gap) - 10;
    return `<path d="M ${x1} ${y + 66} H ${x2}" stroke="${teal}" stroke-width="3" stroke-linecap="round" opacity="0.84"/>
      <path d="M ${x2 - 9} ${y + 57} L ${x2} ${y + 66} L ${x2 - 9} ${y + 75}" fill="none" stroke="${teal}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.84"/>`;
  }).join("\n");
  const tiles = icons
    .map((fn, i) => {
      const x = start + i * (tileW + gap);
      const icon = i === 0 ? fn(x + 66, y + 56, 0.72) : fn(x + 66, y + 55, 0.68);
      return roundedTile(x, y, tileW, 132, `${icon}${smallLabel(labels[i], x + 66, y + 113)}`, {
        rx: 27,
        shadow: i === 2,
        stroke: i === 3 ? teal : "#232728",
        strokeWidth: i === 3 ? 2 : 1,
      });
    })
    .join("\n");

  return svgShell(
    "From prompt to proof",
    `
    ${headline("From prompt to proof", 111, 66)}
    ${connector}
    ${tiles}
    ${roundedTile(378, 378, 344, 72, `
      <image href="${logoDataUri}" x="391" y="388" width="52" height="52"/>
      <text x="458" y="423" fill="${white}" font-family="${font}" font-size="25" font-weight="700">testcat stores every run</text>
    `, { rx: 23, shadow: false, fill: tile2 })}
  `,
  );
}

const outputs = [
  ["testcat-product-hunt-01-any-agent", agentSupport()],
  ["testcat-product-hunt-02-live-grid", liveGrid()],
  ["testcat-product-hunt-03-prompt-proof", pipeline()],
];

for (const [name, svg] of outputs) {
  const svgPath = resolve(outDir, `${name}.svg`);
  const pngPath = resolve(outDir, `${name}.png`);
  writeFileSync(svgPath, svg);
  execFileSync("rsvg-convert", ["--format", "png", "--width", String(W), "--height", String(H), "--output", pngPath, svgPath], {
    stdio: "inherit",
  });
  console.log(pngPath);
}
