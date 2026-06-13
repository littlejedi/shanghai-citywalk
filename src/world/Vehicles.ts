import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Colliders } from '../player/Collision';
import type { ModelLib } from './Models';
import { mulberry32 } from '../textures/canvasSigns';

/**
 * Procedural traffic (Poly Haven has no CC0 cars). Bodies are built from
 * rounded boxes with a glass band and wheels — read as believable sedans,
 * taxis, SUVs and vans at street distance. A few are parked along the curbs;
 * a few loop across the Huaihai/Wukang intersection on simple waypoint paths.
 */

type Kind = 'sedan' | 'suv' | 'taxi' | 'van';

interface Body {
  group: THREE.Group;
  length: number;
}

const PAINT = [0x2b2f36, 0xb8bcc0, 0xe8e9ea, 0x7a8088, 0x33415c, 0x6e2f2f, 0x223027, 0x4a4f57];

function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  // cheap rounded box: a box plus chamfer-ish scaled corners is overkill;
  // use a slightly inset box with beveled top via two stacked boxes
  return new THREE.BoxGeometry(w, h, d, 1, 1, 1).translate(0, 0, 0);
}

function makeVehicle(kind: Kind, rng: () => number): Body {
  const g = new THREE.Group();
  const paint = kind === 'taxi' ? 0xe8c23a : PAINT[Math.floor(rng() * PAINT.length)];
  const bodyMat = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0d1418,
    roughness: 0.12,
    metalness: 0.2,
    transparent: true,
    opacity: 0.78,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.6, metalness: 0.3 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffe9c0, emissive: 0xffd089, emissiveIntensity: 0.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a1d1d, emissive: 0x6a0e0e, emissiveIntensity: 0.4 });

  const dims: Record<Kind, [number, number, number, number]> = {
    // [length, width, lowerH, cabinH]
    sedan: [4.5, 1.8, 0.7, 0.62],
    taxi: [4.6, 1.82, 0.72, 0.64],
    suv: [4.7, 1.92, 0.85, 0.78],
    van: [5.2, 2.0, 1.0, 0.95],
  };
  const [L, W, lowH, cabH] = dims[kind];

  const lower = new THREE.Mesh(roundedBox(W, lowH, L, 0.18), bodyMat);
  lower.position.y = 0.42 + lowH / 2;
  lower.castShadow = true;
  g.add(lower);

  const cabLen = kind === 'van' ? L * 0.78 : L * 0.5;
  const cabZ = kind === 'van' ? -L * 0.02 : -L * 0.04;
  const cabin = new THREE.Mesh(roundedBox(W * 0.94, cabH, cabLen, 0.16), bodyMat);
  cabin.position.set(0, 0.42 + lowH + cabH / 2, cabZ);
  cabin.castShadow = true;
  g.add(cabin);

  // glass band slightly inset
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, cabH * 0.7, cabLen * 0.94), glassMat);
  glass.position.copy(cabin.position);
  glass.position.y += cabH * 0.05;
  g.add(glass);

  // bumpers / sills
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W * 1.02, 0.18, L * 1.0), trimMat);
  sill.position.y = 0.42 + 0.06;
  g.add(sill);

  // lights
  const hl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.16, 0.08), lightMat);
  hl.position.set(0, 0.42 + lowH * 0.7, L / 2 - 0.04);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.16, 0.08), tailMat);
  tl.position.set(0, 0.42 + lowH * 0.7, -L / 2 + 0.04);
  g.add(hl, tl);

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 16).rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.8 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 0.4, metalness: 0.6 });
  const wx = W / 2 - 0.02;
  const wz = L / 2 - 0.95;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(sx * wx, 0.36, sz * wz);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.24, 10).rotateZ(Math.PI / 2), hubMat);
    hub.position.copy(wheel.position);
    hub.position.x += sx * 0.01;
    g.add(wheel, hub);
  }

  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.22), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x55ff88, emissiveIntensity: 0.25 }));
    sign.position.set(0, 0.42 + lowH + cabH + 0.1, cabZ);
    g.add(sign);
  }
  return { group: g, length: L };
}

// Delivery-rider e-scooter (the most common vehicle in the reference photos):
// step-through moped with a big cargo box, in Meituan-yellow / Ele.me-blue /
// SF-green livery, with a seated rider.
const RIDER_LIVERY: [number, number][] = [
  [0xf5c518, 0x1a1a1a], // Meituan yellow
  [0x1b8df0, 0x103a5a], // Ele.me blue
  [0x2fa84f, 0x14401f], // SF green
  [0xdedede, 0x333333], // plain
];

function makeScooter(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const [box, body] = RIDER_LIVERY[Math.floor(rng() * RIDER_LIVERY.length)];
  const bodyMat = new THREE.MeshStandardMaterial({ color: body, roughness: 0.5, metalness: 0.4 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.7 });
  const boxMat = new THREE.MeshStandardMaterial({ color: box, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9b9a0, roughness: 0.8 });
  const rideMat = new THREE.MeshStandardMaterial({ color: body, roughness: 0.85 });

  // deck + step-through frame
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 1.5), bodyMat);
  deck.position.y = 0.42;
  // front column + handlebars
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.0).rotateX(-0.18), darkMat);
  col.position.set(0, 0.85, 0.66);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6).rotateZ(Math.PI / 2), darkMat);
  bar.position.set(0, 1.22, 0.62);
  // seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), darkMat);
  seat.position.set(0, 0.74, -0.2);
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.12, 14).rotateZ(Math.PI / 2);
  const wf = new THREE.Mesh(wheelGeo, darkMat);
  wf.position.set(0, 0.26, 0.66);
  const wr = new THREE.Mesh(wheelGeo, darkMat);
  wr.position.set(0, 0.26, -0.66);
  // cargo box on the back
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), boxMat);
  cargo.position.set(0, 1.0, -0.55);
  // seated rider
  const rider = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.3), darkMat);
  legs.position.set(0, 0.62, 0.05);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.24), rideMat);
  torso.position.set(0, 1.05, -0.05);
  torso.rotation.x = 0.2;
  const arms = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), rideMat);
  arms.position.set(0, 1.15, 0.3);
  arms.rotation.x = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
  head.position.set(0, 1.42, -0.02);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), boxMat);
  helmet.position.set(0, 1.45, -0.02);
  rider.add(legs, torso, arms, head, helmet);
  g.add(deck, col, bar, seat, wf, wr, cargo, rider);
  g.traverse((o) => {
    o.castShadow = true;
  });
  return g;
}

interface Mover {
  group: THREE.Group;
  path: THREE.Vector3[];
  seg: number;
  t: number;
  speed: number;
}

export function buildVehicles(
  scene: THREE.Scene,
  colliders: Colliders,
  _models: ModelLib
): void {
  const rng = mulberry32(31337);
  const g = new THREE.Group();
  scene.add(g);

  const kinds: Kind[] = ['sedan', 'suv', 'taxi', 'van', 'sedan', 'sedan'];
  const pick = (): Kind => kinds[Math.floor(rng() * kinds.length)];

  // ---- parked cars along curbs (with colliders) ----
  const park = (x: number, z: number, yaw: number) => {
    const v = makeVehicle(pick(), rng);
    v.group.position.set(x, 0, z);
    v.group.rotation.y = yaw;
    g.add(v.group);
    const along = Math.abs(Math.cos(yaw)) > 0.5;
    colliders.addCentered(x, z, along ? 2.0 : v.length, along ? v.length : 2.0);
  };
  // Huaihai Rd south edge (cars facing along x)
  for (let x = -84; x <= -20; x += 6) park(x, 12.4, Math.PI / 2);
  for (let x = 56; x <= 86; x += 6) park(x, 12.4, Math.PI / 2);
  // a couple near the mansion arcade on the east side
  park(60, 24, -Math.PI / 2);
  park(66, 24, -Math.PI / 2);
  // Anfu Rd
  for (let x = 20; x <= 52; x += 6.5) park(x, -157.6, Math.PI / 2);

  // ---- parked e-scooters clustered along the curbs (very common here) ----
  const parkScooters = (x: number, z: number, yaw: number, n: number, alongX: boolean) => {
    for (let i = 0; i < n; i++) {
      const s = makeScooter(rng);
      const off = (i - n / 2) * 0.7;
      s.position.set(x + (alongX ? off : 0), 0, z + (alongX ? 0 : off));
      s.rotation.y = yaw + (rng() - 0.5) * 0.2;
      g.add(s);
    }
    colliders.addCentered(x, z, alongX ? n * 0.7 + 0.6 : 1.4, alongX ? 1.4 : n * 0.7 + 0.6);
  };
  parkScooters(-6.4, -30, 0, 6, false);
  parkScooters(-6.4, -88, 0, 5, false);
  parkScooters(6.4, -118, 0, 5, false);
  parkScooters(-46, 11.5, Math.PI / 2, 6, true);
  parkScooters(30, -158, Math.PI / 2, 5, true);
  parkScooters(50, 24, -Math.PI / 2, 4, true);

  // ---- moving traffic on simple loops across the intersection ----
  const movers: Mover[] = [];
  const addCar = (pts: [number, number][], speed: number, offset: number) => {
    const v = makeVehicle(pick(), rng);
    g.add(v.group);
    movers.push({ group: v.group, path: pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), seg: 0, t: offset, speed });
  };
  const addScooter = (pts: [number, number][], speed: number, offset: number) => {
    const s = makeScooter(rng);
    g.add(s);
    movers.push({ group: s, path: pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), seg: 0, t: offset, speed });
  };
  // eastbound + westbound along Huaihai (lanes offset from center)
  addCar([[-92, 20.5], [92, 20.5]], 7, 0);
  addCar([[-92, 20.5], [92, 20.5]], 7, 0.45);
  addCar([[92, 15.5], [-92, 15.5]], 7.5, 0.2);
  addCar([[92, 15.5], [-92, 15.5]], 7.5, 0.7);
  // a car turning from Huaihai up Wukang Rd then north into the fog
  addCar([[92, 15.5], [4, 15.5], [1.6, 0], [1.6, -260]], 6, 0.1);
  // southbound down Wukang into the intersection and east on Huaihai
  addCar([[-1.6, -260], [-1.6, 6], [-20, 20.5], [-92, 20.5]], 6, 0.5);
  // weaving delivery e-scooters (faster, in the bike lanes)
  addScooter([[-92, 22.5], [92, 22.5]], 9, 0.3);
  addScooter([[92, 13.5], [-92, 13.5]], 9.5, 0.6);
  addScooter([[2.6, -260], [2.6, 4], [20, 21], [92, 21]], 8, 0.15);
  addScooter([[-92, 23], [-3, 23], [-2.6, 6], [-2.6, -260]], 8, 0.55);
  addScooter([[60, -158], [16, -158], [3, -150], [2.6, 6], [2.6, -120]], 7, 0.4);

  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const update = (dt: number) => {
    for (const mv of movers) {
      const a = mv.path[mv.seg];
      const b = mv.path[(mv.seg + 1) % mv.path.length];
      const segLen = a.distanceTo(b);
      mv.t += (mv.speed * dt) / segLen;
      while (mv.t >= 1) {
        mv.t -= 1;
        mv.seg = (mv.seg + 1) % (mv.path.length - 1);
      }
      tmp.lerpVectors(mv.path[mv.seg], mv.path[mv.seg + 1] ?? mv.path[0], mv.t);
      mv.group.position.copy(tmp);
      dir.subVectors(mv.path[mv.seg + 1] ?? mv.path[0], mv.path[mv.seg]).normalize();
      mv.group.rotation.y = Math.atan2(dir.x, dir.z);
    }
  };

  // register the per-frame updater on the scene's userData so main.ts can call it
  scene.userData.updateVehicles = update;
}
