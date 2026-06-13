import { mulberry32 } from '../textures/canvasSigns';
import type { Box2 } from '../player/Collision';

/**
 * Data-driven map of the blocks around the Wukang Rd / Huaihai Rd five-way
 * intersection. Axes: meters, +x east, -z north. Wukang Rd runs north from the
 * intersection; the wedge-shaped Wukang Mansion sits on its southeast corner
 * with the Xingguo Rd stub running along its south face.
 */

export const WUKANG = { halfRoad: 3.5, sidewalkW: 4, zNorthEnd: -272 };
// road x ∈ [-3.5, 3.5], sidewalks to ±7.5, building fronts at ±8

export const HUAIHAI = { zMin: 10, zMax: 26, sidewalkW: 5, xMin: -95, xMax: 95 };
// sidewalks z ∈ [5, 10] and [26, 32]

export const ANFU = { zCenter: -160, halfRoad: 3, sidewalkW: 3, xEnd: 64 };
// road z ∈ [-163, -157], east side of Wukang Rd only

// Diagonal Xingguo Rd stub along the mansion's south face, fading into fog.
const DIAG_ANGLE = Math.atan2(19, 78);
export const DIAG = {
  x0: 20,
  z0: 47,
  dx: Math.cos(DIAG_ANGLE),
  dz: Math.sin(DIAG_ANGLE),
  angle: DIAG_ANGLE,
  length: 64,
  halfRoad: 4,
  sidewalkW: 2.4,
};

export function diagPoint(t: number, side: number): { x: number; z: number } {
  return {
    x: DIAG.x0 + DIAG.dx * t - DIAG.dz * side,
    z: DIAG.z0 + DIAG.dz * t + DIAG.dx * side,
  };
}

export const PLAZA = { xMin: -12, xMax: 18, zMin: 31, zMax: 48 };

export const SPAWN = { x: -0.5, z: -18, yaw: Math.PI * 1.09 }; // facing the mansion prow

export interface ShopSpec {
  name: string;
  color: string;
}

export const SHOPS: ShopSpec[] = [
  { name: '武康咖啡 CAFÉ', color: '#7a3b22' },
  { name: '梧桐书店 BOOKS', color: '#23484f' },
  { name: '花店 FLEURS', color: '#4a5d3a' },
  { name: '面包房 BAKERY', color: '#8a6230' },
  { name: '便利店 24H', color: '#1f5e46' },
  { name: '唱片行 VINYL', color: '#43355e' },
  { name: '老相机商店', color: '#5c4632' },
  { name: '小笼生煎馆', color: '#8c2f2a' },
  { name: '理发店 SALON', color: '#2f4a6e' },
  { name: '画廊 GALLERY', color: '#3c3c44' },
  { name: '咖啡烘焙 ROASTERY', color: '#6e4426' },
  { name: '酒吧 BAR 1924', color: '#54262e' },
];

export const MANSION_SHOPS: ShopSpec[] = [
  { name: '邮政 CHINA POST', color: '#0c5a35' },
  { name: '大隐书局', color: '#3a3026' },
  { name: '老麦咖啡馆', color: '#5a2e1e' },
  { name: '紫罗兰理发厅', color: '#46355e' },
  { name: '上海甜品店', color: '#7a3b50' },
];

export interface Lot {
  facing: 'E' | 'W' | 'N' | 'S'; // direction the facade faces
  front: number; // coordinate of the facade plane (x for E/W, z for N/S)
  s: number; // center along the street (z for E/W, x for N/S)
  w: number; // frontage width
  d: number; // depth
  floors: number;
  style: 'garden' | 'lane' | 'apartment' | 'shophouse';
  shop?: ShopSpec;
  seed: number;
}

export function makeLots(): Lot[] {
  const rng = mulberry32(20260612);
  const lots: Lot[] = [];
  let shopIdx = 0;
  const nextShop = () => SHOPS[shopIdx++ % SHOPS.length];

  // Wukang Rd mix: garden houses, lane rows, the odd shopfront.
  const wukangFill = (facing: 'E' | 'W', front: number, sStart: number, sEnd: number) => {
    let s = sStart;
    while (s < sEnd - 7) {
      const w = Math.min(11 + rng() * 13, sEnd - s);
      const r = rng();
      let style: Lot['style'] = 'lane';
      let floors = 3;
      let shop: ShopSpec | undefined;
      if (r < 0.36) {
        style = 'garden';
        floors = 2 + (rng() < 0.5 ? 1 : 0);
      } else if (r < 0.72) {
        floors = 2 + (rng() < 0.7 ? 1 : 0);
      } else {
        floors = 3 + (rng() < 0.4 ? 1 : 0);
        shop = nextShop();
      }
      lots.push({ facing, front, s: s + w / 2, w, d: 12 + rng() * 4, floors, style, shop, seed: Math.floor(rng() * 1e9) });
      s += w;
    }
  };

  // Huaihai Rd mix: taller apartment blocks, shops common.
  const huaihaiFill = (facing: 'N' | 'S', front: number, sStart: number, sEnd: number) => {
    let s = sStart;
    while (s < sEnd - 10) {
      const w = Math.min(16 + rng() * 12, sEnd - s);
      const floors = 3 + Math.floor(rng() * 3);
      const shop = rng() < 0.6 ? nextShop() : undefined;
      lots.push({ facing, front, s: s + w / 2, w, d: 15, floors, style: 'apartment', shop, seed: Math.floor(rng() * 1e9) });
      s += w;
    }
  };

  // Wukang Rd west side (facades face east), full length
  wukangFill('E', -8, -266, -14);
  // Wukang Rd east side, split by the Anfu Rd mouth (z -166 … -154)
  wukangFill('W', 8, -152, -14);
  wukangFill('W', 8, -266, -168);
  // Anfu Rd frontage (north & south sides of the stub)
  // kept as hedge walls — see makeHedges/extraColliders
  // Huaihai north side (facades face south)
  huaihaiFill('S', 5, -90, -14);
  // NE corner opposite the mansion prow: low red-brick shophouse row with a
  // red tile roof (see reference photo), then taller blocks further east
  lots.push(
    { facing: 'S', front: 5, s: 23.5, w: 19, d: 12, floors: 2, style: 'shophouse', shop: { name: '老麦咖啡馆', color: '#5a2e1e' }, seed: 21 },
    { facing: 'S', front: 5, s: 42.5, w: 17, d: 12, floors: 2, style: 'shophouse', shop: { name: '梧桐面包房 BAKERY', color: '#8a6230' }, seed: 22 }
  );
  huaihaiFill('S', 5, 52, 90);
  // Huaihai south side, west of the plaza
  huaihaiFill('N', 32, -88, -14);

  // Backdrop buildings that close off the fog-line street ends.
  lots.push(
    { facing: 'S', front: -272, s: 0, w: 40, d: 12, floors: 5, style: 'apartment', shop: nextShop(), seed: 11 },
    { facing: 'E', front: -96, s: 18, w: 36, d: 12, floors: 6, style: 'apartment', seed: 12 },
    { facing: 'W', front: 96, s: 18, w: 36, d: 12, floors: 6, style: 'apartment', seed: 13 },
    { facing: 'W', front: 66, s: -160, w: 18, d: 10, floors: 3, style: 'lane', seed: 14 }
  );
  return lots;
}

export interface TreeSpot {
  x: number;
  z: number;
  s: number;
}

export function makeTrees(): TreeSpot[] {
  const rng = mulberry32(7);
  const t: TreeSpot[] = [];
  const scale = () => 0.85 + rng() * 0.45;
  // Wukang Rd: the plane-tree tunnel
  for (let z = -18; z >= -264; z -= 9) {
    t.push({ x: -4.7, z: z + (rng() - 0.5) * 2, s: scale() });
    if (z > -150 || z < -172) t.push({ x: 4.7, z: z - 4 + (rng() - 0.5) * 2, s: scale() });
  }
  // Huaihai Rd
  for (let x = -88; x <= 88; x += 9.5) {
    if (Math.abs(x) < 13) continue;
    t.push({ x: x + (rng() - 0.5) * 2, z: 8.9, s: scale() });
    if (x < 28 || x > 48) t.push({ x: x + (rng() - 0.5) * 2, z: 27.2, s: scale() });
  }
  // plaza + the diagonal stub — the huge plane trees that frame the mansion
  t.push(
    { x: -10, z: 40, s: 1.9 },
    { x: -2, z: 45, s: 1.75 },
    { x: 6, z: 42, s: 1.7 },
    { x: -14, z: 33, s: 1.6 }
  );
  // a row of big trees across the far side of the intersection (per references)
  for (let x = -70; x <= 70; x += 13) {
    if (Math.abs(x) < 16) continue;
    t.push({ x, z: 60 + (rng() - 0.5) * 4, s: 1.7 + rng() * 0.35 });
  }
  for (let k = 14; k <= 56; k += 14) {
    const p = diagPoint(k, 6.1);
    t.push({ x: p.x, z: p.z, s: 1.4 });
  }
  return t;
}

export interface LampSpot {
  x: number;
  z: number;
  rot: number; // yaw; lamp arm points along local +x
}

export function makeLamps(): LampSpot[] {
  const lamps: LampSpot[] = [];
  let side = -1;
  for (let z = -24; z >= -260; z -= 30) {
    lamps.push({ x: side * 6.6, z, rot: side < 0 ? 0 : Math.PI });
    side = -side;
  }
  for (let x = -78; x <= 78; x += 36) {
    if (Math.abs(x) < 12) continue;
    lamps.push({ x, z: 6.3, rot: -Math.PI / 2 });
    lamps.push({ x: x + 14, z: 29.7, rot: Math.PI / 2 });
  }
  return lamps;
}

export interface SignSpot {
  x: number;
  z: number;
  plates: { cn: string; en: string; rot: number }[];
}

export const STREET_SIGNS: SignSpot[] = [
  {
    x: -8.7,
    z: 3.6,
    plates: [
      { cn: '武康路', en: 'WUKANG RD', rot: 0 },
      { cn: '淮海中路', en: 'HUAIHAI RD (M)', rot: Math.PI / 2 },
    ],
  },
  {
    x: 9,
    z: 27.8,
    plates: [
      { cn: '兴国路', en: 'XINGGUO RD', rot: Math.PI / 2 },
      { cn: '淮海中路', en: 'HUAIHAI RD (M)', rot: 0 },
    ],
  },
  {
    x: 8.7,
    z: -152.4,
    plates: [
      { cn: '安福路', en: 'ANFU RD', rot: Math.PI / 2 },
      { cn: '武康路', en: 'WUKANG RD', rot: 0 },
    ],
  },
  { x: -8.7, z: -238, plates: [{ cn: '武康路', en: 'WUKANG RD', rot: 0 }] },
];

export interface Crosswalk {
  cx: number;
  cz: number;
  dir: 'x' | 'z'; // walking direction
  span: number; // width of the road being crossed
  rungLen: number;
}

export const CROSSWALKS: Crosswalk[] = [
  { cx: 0, cz: 7.25, dir: 'x', span: 7, rungLen: 3.2 },
  { cx: -9.2, cz: 18, dir: 'z', span: 16, rungLen: 3 },
  { cx: 9.2, cz: 18, dir: 'z', span: 16, rungLen: 3 },
  { cx: 9.7, cz: -160, dir: 'z', span: 6, rungLen: 2.6 },
];

export interface BenchSpot {
  x: number;
  z: number;
  rot: number;
}

export const BENCHES: BenchSpot[] = [
  { x: -6.8, z: -58, rot: Math.PI / 2 },
  { x: 6.8, z: -110, rot: -Math.PI / 2 },
  { x: -6.8, z: -188, rot: Math.PI / 2 },
  { x: 4, z: 40, rot: Math.PI },
  { x: -4, z: 45, rot: Math.PI },
];

export interface HedgeSpec {
  cx: number;
  cz: number;
  w: number;
  d: number;
  h: number;
  rot?: number;
}

export function makeHedges(): HedgeSpec[] {
  const diagS = diagPoint(31, 7.4);
  return [
    // walls of greenery along the Anfu Rd stub
    { cx: 36, cz: -153.3, w: 56, d: 1.2, h: 1.6 },
    { cx: 36, cz: -166.7, w: 56, d: 1.2, h: 1.6 },
    // plaza edges
    { cx: 3, cz: 48.6, w: 30, d: 1.3, h: 1.1 },
    { cx: -13, cz: 40, w: 2, d: 17, h: 1.6 },
    // along the south side of the Xingguo Rd stub
    { cx: diagS.x, cz: diagS.z, w: 62, d: 1.3, h: 1.4, rot: -DIAG.angle },
  ];
}

export const BUS_STOP = { x: 38, z: 29.2 };

export const EXTRA_COLLIDERS: Box2[] = [
  // street-end caps just past the backdrop buildings / fog line
  { minX: -30, maxX: 30, minZ: -302, maxZ: -273 },
  { minX: -112, maxX: -97, minZ: 0, maxZ: 36 },
  { minX: 97, maxX: 112, minZ: 0, maxZ: 36 },
  { minX: 66, maxX: 84, minZ: -172, maxZ: -148 },
  // off-map areas around the plaza / mansion block
  { minX: -16, maxX: -11.5, minZ: 31, maxZ: 52 },
  { minX: -95, maxX: -12, minZ: 47, maxZ: 80 },
  { minX: 93, maxX: 100, minZ: 32, maxZ: 70 },
  // Xingguo Rd stub fades out here
  { minX: 72, maxX: 96, minZ: 52, maxZ: 70 },
  { minX: -20, maxX: 110, minZ: 68, maxZ: 100 },
];
