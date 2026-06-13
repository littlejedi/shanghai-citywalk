import * as THREE from 'three';

/** Deterministic RNG so the city looks the same on every visit. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CN_FONT = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
const WARM_GLOWS = ['#ffc183', '#ffb061', '#ffd9a8', '#f5a55a', '#ffcf96'];

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(w));
  c.height = Math.max(8, Math.round(h));
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface FacadeOptions {
  widthM: number;
  heightM: number;
  floors: number; // total floors including ground
  style: 'brick' | 'plaster' | 'mansion';
  wallColor: string;
  trimColor?: string;
  storefront?: { name: string; color: string } | null;
  litRatio?: number;
  seed?: number;
  bands?: number[]; // y (m, from facade bottom) of horizontal trim bands
}

export interface FacadeTextures {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  normalMap?: THREE.CanvasTexture;
}

interface FacadePainter {
  ctx: CanvasRenderingContext2D;
  ectx: CanvasRenderingContext2D;
  hctx?: CanvasRenderingContext2D; // optional height field for normal-map relief
  ppm: number;
  H: number;
  rng: () => number;
}

/** rect in meters, y measured up from facade bottom */
function rectM(p: FacadePainter, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillRect(x * p.ppm, p.H - (y + h) * p.ppm, w * p.ppm, h * p.ppm);
}

/** Paint a height value (0=recessed … 255=proud, 128=wall) into the height field. */
function hM(p: FacadePainter, x: number, y: number, w: number, h: number, val: number) {
  if (!p.hctx) return;
  p.hctx.fillStyle = `rgb(${val},${val},${val})`;
  p.hctx.fillRect(x * p.ppm, p.H - (y + h) * p.ppm, w * p.ppm, h * p.ppm);
}

/** Sobel a (downscaled) height canvas into a tangent-space normal map. */
function heightToNormal(src: HTMLCanvasElement, strength = 2.2): THREE.CanvasTexture {
  const maxW = 512;
  const sc = Math.min(1, maxW / src.width);
  const w = Math.max(1, Math.round(src.width * sc));
  const h = Math.max(1, Math.round(src.height * sc));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d')!;
  sctx.drawImage(src, 0, 0, w, h);
  const data = sctx.getImageData(0, 0, w, h).data;
  const out = sctx.createImageData(w, h);
  const at = (x: number, y: number) => {
    x = Math.max(0, Math.min(w - 1, x));
    y = Math.max(0, Math.min(h - 1, y));
    return data[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength; // +Y up (GL)
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  sctx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(small);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

function drawWindow(p: FacadePainter, x: number, y: number, w: number, h: number, trim: string, lit: boolean) {
  const { ctx, ectx, rng } = p;
  ctx.fillStyle = trim;
  rectM(p, ctx, x - 0.07, y - 0.07, w + 0.14, h + 0.14);
  // relief: proud surround, recessed glass, a proud sill below
  hM(p, x - 0.1, y - 0.1, w + 0.2, h + 0.2, 178);
  hM(p, x, y, w, h, 70);
  hM(p, x - 0.12, y - 0.2, w + 0.24, 0.13, 205);
  // sill
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  rectM(p, ctx, x - 0.12, y - 0.2, w + 0.24, 0.13);
  if (lit) {
    const glow = WARM_GLOWS[Math.floor(rng() * WARM_GLOWS.length)];
    ctx.fillStyle = glow;
    rectM(p, ctx, x, y, w, h);
    // half-drawn curtain
    if (rng() < 0.5) {
      ctx.fillStyle = 'rgba(60,30,16,0.55)';
      rectM(p, ctx, x, y + h * 0.55, w, h * 0.45);
    }
    ectx.fillStyle = glow;
    ectx.globalAlpha = 0.55 + rng() * 0.45;
    rectM(p, ectx, x, y, w, h * (rng() < 0.5 ? 0.55 : 1));
    ectx.globalAlpha = 1;
  } else {
    // dark glass with a faint sky gradient
    const g = ctx.createLinearGradient(0, p.H - (y + h) * p.ppm, 0, p.H - y * p.ppm);
    g.addColorStop(0, '#3b4250');
    g.addColorStop(1, '#1d222c');
    ctx.fillStyle = g;
    rectM(p, ctx, x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    rectM(p, ctx, x + w * 0.12, y + h * 0.25, w * 0.2, h * 0.7);
  }
  // glazing bar
  ctx.fillStyle = 'rgba(20,16,12,0.6)';
  rectM(p, ctx, x + w / 2 - 0.02, y, 0.04, h);
  rectM(p, ctx, x, y + h / 2 - 0.02, w, 0.04);
}

function drawShopfront(
  p: FacadePainter,
  x: number,
  w: number,
  groundH: number,
  name: string,
  color: string
) {
  const { ctx, ectx, ppm, rng } = p;
  ctx.fillStyle = '#2b2722';
  rectM(p, ctx, x, 0, w, groundH);

  // glazing
  const glassTop = groundH - 0.95;
  // relief: shopfront glazing recessed, sign band proud
  hM(p, x + 0.2, 0.1, w - 0.4, glassTop, 80);
  hM(p, x + 0.08, glassTop + 0.05, w - 0.16, 0.79, 200);
  const panes = Math.max(2, Math.floor(w / 2.1));
  const paneW = (w - 0.5) / panes;
  for (let i = 0; i < panes; i++) {
    const px = x + 0.25 + i * paneW + 0.08;
    const pw = paneW - 0.16;
    const door = i === Math.floor(panes / 2);
    const glow = WARM_GLOWS[Math.floor(rng() * WARM_GLOWS.length)];
    const g = ctx.createLinearGradient(0, p.H - glassTop * ppm, 0, p.H);
    g.addColorStop(0, glow);
    g.addColorStop(1, '#6e3f1c');
    ctx.fillStyle = g;
    rectM(p, ctx, px, 0.12, pw, glassTop - 0.12);
    // interior silhouettes (shelves, counter)
    ctx.fillStyle = 'rgba(46,24,10,0.55)';
    for (let s = 0; s < 3; s++) {
      if (rng() < 0.6) rectM(p, ctx, px + rng() * pw * 0.5, 0.3 + rng() * 1.2, pw * (0.2 + rng() * 0.3), 0.32);
    }
    if (door) {
      ctx.fillStyle = 'rgba(30,20,12,0.85)';
      rectM(p, ctx, px + pw * 0.32, 0.12, 0.07, glassTop - 0.12);
      rectM(p, ctx, px + pw * 0.62, 0.12, 0.07, glassTop - 0.12);
    }
    ectx.fillStyle = glow;
    ectx.globalAlpha = 0.8;
    rectM(p, ectx, px, 0.12, pw, glassTop - 0.12);
    ectx.globalAlpha = 1;
  }

  // sign band
  ctx.fillStyle = color;
  rectM(p, ctx, x + 0.08, glassTop + 0.12, w - 0.16, 0.72);
  ctx.fillStyle = '#1a1410';
  rectM(p, ctx, x + 0.08, glassTop + 0.05, w - 0.16, 0.07);
  const fontPx = 0.5 * ppm;
  ctx.fillStyle = '#f7ead2';
  ctx.font = `600 ${fontPx}px ${CN_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cxPx = (x + w / 2) * ppm;
  const cyPx = p.H - (glassTop + 0.48) * ppm;
  ctx.fillText(name, cxPx, cyPx, (w - 0.6) * ppm);
  ectx.fillStyle = '#e8c79a';
  ectx.globalAlpha = 0.85;
  ectx.font = ctx.font;
  ectx.textAlign = 'center';
  ectx.textBaseline = 'middle';
  ectx.fillText(name, cxPx, cyPx, (w - 0.6) * ppm);
  ectx.globalAlpha = 1;
}

function brickPattern(p: FacadePainter, w: number, h: number, rng: () => number) {
  const { ctx, ppm } = p;
  const course = 0.085;
  ctx.fillStyle = 'rgba(30,18,12,0.22)';
  for (let y = 0; y < h; y += course) {
    ctx.fillRect(0, p.H - y * ppm, w * ppm, 1);
  }
  // random brick tint patches
  for (let i = 0; i < w * h * 2.2; i++) {
    const bw = 0.21;
    const bx = Math.floor((rng() * w) / bw) * bw;
    const by = Math.floor((rng() * h) / course) * course;
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,235,210,0.06)' : 'rgba(30,12,8,0.09)';
    rectM(p, ctx, bx, by, bw, course);
  }
}

function weathering(p: FacadePainter, w: number, h: number, rng: () => number) {
  const { ctx, ppm } = p;
  // grime at the base
  const g = ctx.createLinearGradient(0, p.H - 0.9 * ppm, 0, p.H);
  g.addColorStop(0, 'rgba(20,14,10,0)');
  g.addColorStop(1, 'rgba(20,14,10,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, p.H - 0.9 * ppm, w * ppm, 0.9 * ppm);
  // streaks
  for (let i = 0; i < w * 1.5; i++) {
    ctx.fillStyle = `rgba(18,14,10,${0.02 + rng() * 0.05})`;
    rectM(p, ctx, rng() * w, rng() * h * 0.7, 0.06 + rng() * 0.2, 0.5 + rng() * 2.5);
  }
}

export function makeFacade(o: FacadeOptions): FacadeTextures {
  const rng = mulberry32(o.seed ?? 1);
  const ppm = Math.min(30, 2048 / Math.max(o.widthM, o.heightM));
  const W = Math.round(o.widthM * ppm);
  const H = Math.round(o.heightM * ppm);
  const [canvas, ctx] = makeCanvas(W, H);
  const [ecanvas, ectx] = makeCanvas(W, H);
  const [hcanvas, hctx] = makeCanvas(W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);
  hctx.fillStyle = 'rgb(128,128,128)'; // wall plane = neutral height
  hctx.fillRect(0, 0, W, H);
  const p: FacadePainter = { ctx, ectx, hctx, ppm, H, rng };

  ctx.fillStyle = o.wallColor;
  ctx.fillRect(0, 0, W, H);
  if (o.style === 'brick' || o.style === 'mansion') brickPattern(p, o.widthM, o.heightM, rng);

  const trim = o.trimColor ?? (o.style === 'brick' ? '#e8dfc8' : '#8a7d6a');
  const litRatio = o.litRatio ?? 0.32;
  const groundH = o.storefront ? 3.5 : 0;
  const upperFloors = Math.max(1, o.floors - (o.storefront ? 1 : 0));
  const floorH = (o.heightM - groundH - 0.5) / upperFloors;

  // trim bands (mansion-style horizontal articulation)
  for (const by of o.bands ?? []) {
    ctx.fillStyle = trim;
    rectM(p, ctx, 0, by, o.widthM, 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    rectM(p, ctx, 0, by - 0.06, o.widthM, 0.06);
    hM(p, 0, by, o.widthM, 0.5, 188);
  }

  // windows
  const margin = 0.85;
  const cellW = o.style === 'mansion' ? 2.6 : 2.1;
  const cols = Math.max(1, Math.floor((o.widthM - margin * 2) / cellW));
  const colW = (o.widthM - margin * 2) / cols;
  const winW = Math.min(1.25, colW * 0.55);
  for (let f = 0; f < upperFloors; f++) {
    const yBase = groundH + f * floorH;
    const winH = floorH * 0.5;
    const winY = yBase + floorH * 0.28;
    for (let c = 0; c < cols; c++) {
      const x = margin + c * colW + (colW - winW) / 2;
      drawWindow(p, x, winY, winW, winH, trim, rng() < litRatio);
    }
  }

  if (o.storefront) drawShopfront(p, 0.15, o.widthM - 0.3, groundH, o.storefront.name, o.storefront.color);

  // parapet line
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rectM(p, ctx, 0, o.heightM - 0.42, o.widthM, 0.08);
  ctx.fillStyle = trim;
  rectM(p, ctx, 0, o.heightM - 0.34, o.widthM, 0.34);
  hM(p, 0, o.heightM - 0.34, o.widthM, 0.34, 195);

  weathering(p, o.widthM, o.heightM, rng);

  return { map: toTexture(canvas), emissiveMap: toTexture(ecanvas), normalMap: heightToNormal(hcanvas) };
}

/** A strip of several shopfronts in a row — used for the Wukang Mansion arcade. */
export function makeShopRow(
  widthM: number,
  heightM: number,
  shops: { name: string; color: string }[],
  seed = 9
): FacadeTextures {
  const rng = mulberry32(seed);
  const ppm = Math.min(30, 4096 / widthM);
  const W = Math.round(widthM * ppm);
  const H = Math.round(heightM * ppm);
  const [canvas, ctx] = makeCanvas(W, H);
  const [ecanvas, ectx] = makeCanvas(W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);
  const p: FacadePainter = { ctx, ectx, ppm, H, rng };
  ctx.fillStyle = '#3a322a';
  ctx.fillRect(0, 0, W, H);
  const segW = widthM / shops.length;
  shops.forEach((s, i) => {
    drawShopfront(p, i * segW + 0.18, segW - 0.36, heightM - 0.4, s.name, s.color);
  });
  weathering(p, widthM, heightM, rng);
  return { map: toTexture(canvas), emissiveMap: toTexture(ecanvas) };
}

/** Shanghai-style green street name sign: 武康路 / WUKANG RD. */
export function makeStreetSign(cn: string, en: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(640, 200);
  ctx.fillStyle = '#0a6b3c';
  ctx.fillRect(0, 0, 640, 200);
  ctx.strokeStyle = '#f2f5ef';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 620, 180);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 84px ${CN_FONT}`;
  ctx.fillText(cn, 320, 78, 580);
  ctx.font = `500 40px ${CN_FONT}`;
  ctx.fillText(en, 320, 156, 580);
  return toTexture(c);
}

/** Hanging shop sign panel (also used as its own emissive map so it glows). */
export function makeShopSign(name: string, bg: string, fg = '#ffe9c8'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 224);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 224);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 7;
  ctx.strokeRect(14, 14, 996, 196);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 108px ${CN_FONT}`;
  ctx.fillText(name, 512, 118, 940);
  return toTexture(c);
}

/** Striped awning fabric. */
export function makeAwning(c1: string, c2: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 128);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? c1 : c2;
    ctx.fillRect(i * 32, 0, 32, 128);
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- Wukang Mansion band painters (matched to reference photos) ----------

const MANSION_BRICK = '#a85f36';
const MANSION_STONE = '#b8ab93';
const MANSION_CREAM = '#cdc1a6';

function newPainter(
  widthM: number,
  heightM: number,
  seed: number
): FacadePainter & { canvas: HTMLCanvasElement; ecanvas: HTMLCanvasElement; hcanvas: HTMLCanvasElement } {
  const ppm = Math.min(30, 4096 / widthM);
  const W = Math.round(widthM * ppm);
  const H = Math.round(heightM * ppm);
  const [canvas, ctx] = makeCanvas(W, H);
  const [ecanvas, ectx] = makeCanvas(W, H);
  const [hcanvas, hctx] = makeCanvas(W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);
  hctx.fillStyle = 'rgb(128,128,128)';
  hctx.fillRect(0, 0, W, H);
  return { ctx, ectx, hctx, ppm, H, rng: mulberry32(seed), canvas, ecanvas, hcanvas };
}

function painterTextures(p: {
  canvas: HTMLCanvasElement;
  ecanvas: HTMLCanvasElement;
  hcanvas: HTMLCanvasElement;
}): FacadeTextures {
  return { map: toTexture(p.canvas), emissiveMap: toTexture(p.ecanvas), normalMap: heightToNormal(p.hcanvas) };
}

/** Brick mid-section: 5 floors of stone-surround windows, iron balconies, greenery. */
export function mansionBrickBand(widthM: number, seed: number, litRatio = 0.3): FacadeTextures {
  const heightM = 14.4;
  const floors = 6;
  const p = newPainter(widthM, heightM, seed);
  const { ctx, ectx, rng } = p;
  ctx.fillStyle = MANSION_BRICK;
  ctx.fillRect(0, 0, p.canvas.width, p.canvas.height);
  brickPattern(p, widthM, heightM, rng);

  const floorH = heightM / floors;
  const bays = Math.max(1, Math.round(widthM / 3.7));
  const bayW = widthM / bays;
  for (let f = 0; f < floors; f++) {
    for (let b = 0; b < bays; b++) {
      const cx = (b + 0.5) * bayW;
      const wW = 1.5;
      const wH = 1.95;
      const x = cx - wW / 2;
      const y = f * floorH + 0.55;
      // stone surround (proud), glass recessed
      ctx.fillStyle = '#d9cdb4';
      rectM(p, ctx, x - 0.18, y - 0.14, wW + 0.36, wH + 0.34);
      hM(p, x - 0.18, y - 0.14, wW + 0.36, wH + 0.34, 180);
      hM(p, x, y, wW, wH, 72);
      const lit = rng() < litRatio;
      if (lit) {
        const glow = WARM_GLOWS[Math.floor(rng() * WARM_GLOWS.length)];
        ctx.fillStyle = glow;
        rectM(p, ctx, x, y, wW, wH);
        if (rng() < 0.5) {
          ctx.fillStyle = 'rgba(60,30,16,0.5)';
          rectM(p, ctx, x, y + wH * 0.5, wW, wH * 0.5);
        }
        ectx.fillStyle = glow;
        ectx.globalAlpha = 0.5 + rng() * 0.5;
        rectM(p, ectx, x, y, wW, wH);
        ectx.globalAlpha = 1;
      } else {
        const g = ctx.createLinearGradient(0, p.H - (y + wH) * p.ppm, 0, p.H - y * p.ppm);
        g.addColorStop(0, '#39404c');
        g.addColorStop(1, '#1c2129');
        ctx.fillStyle = g;
        rectM(p, ctx, x, y, wW, wH);
      }
      // white glazing bars (the steel-framed windows in the photos)
      ctx.fillStyle = '#ddd4c2';
      rectM(p, ctx, x + wW / 2 - 0.025, y, 0.05, wH);
      rectM(p, ctx, x, y + wH * 0.33 - 0.02, wW, 0.04);
      rectM(p, ctx, x, y + wH * 0.66 - 0.02, wW, 0.04);
      // wrought-iron balcony rail
      if (rng() < 0.4) {
        ctx.fillStyle = 'rgba(22,18,15,0.88)';
        rectM(p, ctx, x - 0.3, y + 0.62, wW + 0.6, 0.05);
        for (let rx = x - 0.3; rx < x + wW + 0.3; rx += 0.13) {
          rectM(p, ctx, rx, y - 0.08, 0.04, 0.72);
        }
      }
      // balcony greenery
      if (rng() < 0.3) {
        ctx.fillStyle = 'rgba(63,82,48,0.9)';
        rectM(p, ctx, x - 0.2 + rng() * 0.4, y - 0.12, 0.7 + rng() * 0.8, 0.34);
      }
    }
  }
  weathering(p, widthM, heightM, rng);
  return painterTextures(p);
}

function archPath(ctx: CanvasRenderingContext2D, p: FacadePainter, cxM: number, baseY: number, wM: number, rectH: number) {
  const { ppm, H } = p;
  const x0 = (cxM - wM / 2) * ppm;
  const x1 = (cxM + wM / 2) * ppm;
  const yb = H - baseY * ppm;
  const yt = H - (baseY + rectH) * ppm;
  ctx.beginPath();
  ctx.moveTo(x0, yb);
  ctx.lineTo(x0, yt);
  ctx.arc((x0 + x1) / 2, yt, (wM / 2) * ppm, Math.PI, 0);
  ctx.lineTo(x1, yb);
  ctx.closePath();
}

/** Two-storey rusticated stone base with round-arched shopfronts. */
export function mansionStoneBand(
  widthM: number,
  shops: { name: string; color: string }[] | null,
  seed: number
): FacadeTextures {
  const heightM = 7.8;
  const p = newPainter(widthM, heightM, seed);
  const { ctx, ectx, rng, ppm } = p;
  ctx.fillStyle = MANSION_STONE;
  ctx.fillRect(0, 0, p.canvas.width, p.canvas.height);
  // rustication joints
  ctx.fillStyle = 'rgba(40,34,26,0.18)';
  for (let y = 0; y < heightM; y += 0.62) {
    ctx.fillRect(0, p.H - y * ppm, p.canvas.width, 1.5);
  }

  const arches = Math.max(1, Math.round(widthM / 3.9));
  const aW = widthM / arches;
  for (let a = 0; a < arches; a++) {
    const cx = (a + 0.5) * aW;
    const archW = Math.min(2.6, aW - 0.8);
    if (archW < 1) continue;
    const baseY = 0.3;
    const rectH = 2.7;
    const glow = shops ? rng() < 0.75 : rng() < 0.2;
    archPath(ctx, p, cx, baseY, archW, rectH);
    if (glow) {
      const g = ctx.createLinearGradient(0, p.H - 4.2 * ppm, 0, p.H);
      g.addColorStop(0, WARM_GLOWS[Math.floor(rng() * WARM_GLOWS.length)]);
      g.addColorStop(1, '#7a4a22');
      ctx.fillStyle = g;
      ctx.fill();
      archPath(ectx, p, cx, baseY, archW, rectH);
      ectx.fillStyle = '#f0b878';
      ectx.globalAlpha = 0.8;
      ectx.fill();
      ectx.globalAlpha = 1;
      // interior silhouettes
      ctx.fillStyle = 'rgba(44,24,10,0.5)';
      rectM(p, ctx, cx - archW / 2 + 0.2, baseY, 0.35, 2.1);
      rectM(p, ctx, cx + archW / 2 - 0.5, baseY + 0.4, 0.32, 1.1);
    } else {
      ctx.fillStyle = '#262019';
      ctx.fill();
      // dark lattice
      ctx.fillStyle = 'rgba(120,108,90,0.35)';
      rectM(p, ctx, cx - 0.025, baseY, 0.05, rectH + archW / 2);
      rectM(p, ctx, cx - archW / 2, baseY + 1.3, archW, 0.05);
    }
    // stone trim + keystone
    ctx.strokeStyle = '#cfc5ae';
    ctx.lineWidth = 0.14 * ppm;
    archPath(ctx, p, cx, baseY, archW, rectH);
    ctx.stroke();
    ctx.fillStyle = '#cfc5ae';
    rectM(p, ctx, cx - 0.18, baseY + rectH + archW / 2 - 0.12, 0.36, 0.62);
    // shop name board inside the arch
    if (glow && shops) {
      const name = shops[a % shops.length].name;
      ctx.fillStyle = 'rgba(30,20,12,0.85)';
      rectM(p, ctx, cx - archW / 2 + 0.15, 2.5, archW - 0.3, 0.52);
      ctx.fillStyle = '#f4dfb8';
      ctx.font = `600 ${0.36 * ppm}px ${CN_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, cx * ppm, p.H - 2.76 * ppm, (archW - 0.4) * ppm);
      ectx.fillStyle = '#e8c79a';
      ectx.font = ctx.font;
      ectx.textAlign = 'center';
      ectx.textBaseline = 'middle';
      ectx.globalAlpha = 0.8;
      ectx.fillText(name, cx * ppm, p.H - 2.76 * ppm, (archW - 0.4) * ppm);
      ectx.globalAlpha = 1;
    }
    // mezzanine window above each arch
    const mw = 1.5;
    const mh = 1.35;
    const my = 5.35;
    ctx.fillStyle = '#cfc5ae';
    rectM(p, ctx, cx - mw / 2 - 0.12, my - 0.1, mw + 0.24, mh + 0.2);
    const mlit = rng() < 0.25;
    ctx.fillStyle = mlit ? '#ffc183' : '#222831';
    rectM(p, ctx, cx - mw / 2, my, mw, mh);
    if (mlit) {
      ectx.fillStyle = '#ffc183';
      ectx.globalAlpha = 0.7;
      rectM(p, ectx, cx - mw / 2, my, mw, mh);
      ectx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(40,34,26,0.6)';
    rectM(p, ctx, cx - 0.02, my, 0.04, mh);
  }
  // top course
  ctx.fillStyle = MANSION_CREAM;
  rectM(p, ctx, 0, 7.45, widthM, 0.35);
  weathering(p, widthM, heightM, rng);
  return painterTextures(p);
}

/** Recessed cream top storey behind a continuous iron railing. */
export function mansionTopBand(widthM: number, seed: number): FacadeTextures {
  const heightM = 3.2;
  const p = newPainter(widthM, heightM, seed);
  const { ctx, ectx, rng } = p;
  ctx.fillStyle = MANSION_CREAM;
  ctx.fillRect(0, 0, p.canvas.width, p.canvas.height);
  // iron railing strip across the bottom
  ctx.fillStyle = '#7d7264';
  rectM(p, ctx, 0, 0, widthM, 0.9);
  ctx.fillStyle = '#221d18';
  rectM(p, ctx, 0, 0.78, widthM, 0.07);
  rectM(p, ctx, 0, 0.02, widthM, 0.06);
  for (let x = 0.06; x < widthM; x += 0.17) {
    rectM(p, ctx, x, 0.05, 0.045, 0.78);
  }
  const bays = Math.max(1, Math.round(widthM / 3.7));
  const bayW = widthM / bays;
  for (let b = 0; b < bays; b++) {
    const cx = (b + 0.5) * bayW;
    const wW = 1.35;
    const wH = 1.7;
    const y = 1.15;
    ctx.fillStyle = '#5c5246';
    rectM(p, ctx, cx - wW / 2 - 0.08, y - 0.08, wW + 0.16, wH + 0.16);
    const lit = rng() < 0.3;
    ctx.fillStyle = lit ? '#ffcf96' : '#262c36';
    rectM(p, ctx, cx - wW / 2, y, wW, wH);
    if (lit) {
      ectx.fillStyle = '#ffcf96';
      ectx.globalAlpha = 0.7;
      rectM(p, ectx, cx - wW / 2, y, wW, wH);
      ectx.globalAlpha = 1;
    }
    ctx.fillStyle = '#ddd4c2';
    rectM(p, ctx, cx - 0.02, y, 0.04, wH);
  }
  weathering(p, widthM, heightM, rng);
  return painterTextures(p);
}

/** Stone balustrade strip (the band above the arcade). */
export function balusterStrip(widthM: number): THREE.CanvasTexture {
  const ppm = 30;
  const [c, ctx] = makeCanvas(widthM * ppm, 0.8 * ppm);
  ctx.fillStyle = '#5c5448';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#d6cab0';
  ctx.fillRect(0, 0, c.width, 0.16 * ppm);
  ctx.fillRect(0, c.height - 0.16 * ppm, c.width, 0.16 * ppm);
  for (let x = 0.1; x < widthM; x += 0.32) {
    ctx.fillRect(x * ppm, 0.14 * ppm, 0.13 * ppm, c.height - 0.26 * ppm);
  }
  return toTexture(c);
}

/** Salmon louvered AC-shutter boxes that stud the mansion's brick facades. */
export function louverTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 64);
  ctx.fillStyle = '#a85c4c';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(60,26,20,0.6)';
  for (let y = 5; y < 64; y += 6) ctx.fillRect(3, y, 58, 3);
  ctx.strokeStyle = 'rgba(48,22,18,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, 62, 62);
  return toTexture(c);
}

/** Chinese traffic signs. */
export function trafficSign(kind: 'oneway' | 'noentry'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  if (kind === 'noentry') {
    ctx.fillStyle = '#c2342a';
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(36, 110, 184, 36);
  } else {
    ctx.fillStyle = '#1456a8';
    ctx.fillRect(8, 8, 240, 240);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 16, 224, 224);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(116, 70, 24, 110);
    ctx.beginPath();
    ctx.moveTo(128, 30);
    ctx.lineTo(94, 80);
    ctx.lineTo(162, 80);
    ctx.closePath();
    ctx.fill();
    ctx.font = `600 38px ${CN_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('单行线', 128, 222);
  }
  return toTexture(c);
}

/** Bus stop flag sign. */
export function makeBusSign(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(768, 256);
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(0, 0, 768, 256);
  ctx.fillStyle = '#0d4f8b';
  ctx.fillRect(0, 0, 768, 78);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 52px ${CN_FONT}`;
  ctx.fillText('公交 BUS · 武康大楼站', 384, 40, 720);
  ctx.fillStyle = '#23303c';
  ctx.font = `500 44px ${CN_FONT}`;
  ctx.fillText('26 · 113 · 328 · 921 路', 384, 130, 700);
  ctx.font = `400 34px ${CN_FONT}`;
  ctx.fillText('首班 05:30 — 末班 23:30', 384, 200, 700);
  return toTexture(c);
}
