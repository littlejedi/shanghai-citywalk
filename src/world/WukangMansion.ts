import * as THREE from 'three';
import type { Colliders } from '../player/Collision';
import { MANSION_SHOPS } from './layout';
import {
  mansionBrickBand,
  mansionStoneBand,
  mansionTopBand,
  balusterStrip,
  louverTexture,
  mulberry32,
  type FacadeTextures,
} from '../textures/canvasSigns';

type Pt = [number, number];

/**
 * 武康大楼 (Wukang Mansion, 1924), modelled after reference photos: a long
 * curved "ship's bow" prow at the west end, a two-storey rusticated stone
 * arcade base with round-arched shopfronts, a stone balustrade band, five
 * brick storeys with stone-surround windows and salmon louvered AC shutters,
 * and a recessed cream top storey behind an iron railing under a heavy
 * cornice with a curved crown over the prow.
 */

// footprint
const TIP_X = 15;
const R = 4.6; // prow curve radius
const CX = TIP_X + R; // arc center
const CZ = 32 + R;
const NORTH_Z = 32;
const EAST_X = 94;
const S0: Pt = [CX, CZ + R]; // south face start (arc tangent)
const S1: Pt = [EAST_X, 51];

// vertical bands
const BASE_H = 7.8;
const BAL_H = 0.8;
const BRICK_H = 14.4;
const TOP_H = 3.2;
const Y_BAL = BASE_H; // 7.8
const Y_BRICK = Y_BAL + BAL_H; // 8.6
const Y_TOP = Y_BRICK + BRICK_H; // 23.0
const HEIGHT = Y_TOP + TOP_H; // 26.2

const ARC_LEN = Math.PI * R;
const NORTH_LEN = EAST_X - CX;
const SOUTH_DX = S1[0] - S0[0];
const SOUTH_DZ = S1[1] - S0[1];
const SOUTH_LEN = Math.hypot(SOUTH_DX, SOUTH_DZ);
const EAST_LEN = S1[1] - NORTH_Z;

export function buildMansion(scene: THREE.Scene, colliders: Colliders): void {
  const g = new THREE.Group();
  scene.add(g);
  const rng = mulberry32(424242);

  const facadeMat = (tex: FacadeTextures, emissive = 1.2) => {
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map,
      emissiveMap: tex.emissiveMap,
      normalMap: tex.normalMap,
      emissive: 0xffffff,
      emissiveIntensity: emissive,
      roughness: 0.92,
    });
    if (tex.normalMap) mat.normalScale.set(0.9, 0.9);
    return mat;
  };

  // straight wall along from→to; outward normal = left of direction
  const wall = (from: Pt, to: Pt, yBase: number, h: number, mat: THREE.Material) => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(dx, dz), h), mat);
    m.rotation.y = -Math.atan2(dz, dx);
    m.position.set((from[0] + to[0]) / 2, yBase + h / 2, (from[1] + to[1]) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  // curved prow band: open cylinder sector wrapping north → west → south
  const arcBand = (yBase: number, h: number, mat: THREE.Material, radius = R, closed = false) => {
    const geo = new THREE.CylinderGeometry(radius, radius, h, 28, 1, !closed, Math.PI, Math.PI);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(CX, yBase + h / 2, CZ);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  const B: Pt = [EAST_X, NORTH_Z];
  const A: Pt = [CX, NORTH_Z];

  // ---- stone arcade base ----------------------------------------------------
  wall(B, A, 0, BASE_H, facadeMat(mansionStoneBand(NORTH_LEN, MANSION_SHOPS, 201), 1.35));
  arcBand(0, BASE_H, facadeMat(mansionStoneBand(ARC_LEN, [{ name: '邮政 CHINA POST', color: '#0c5a35' }], 202), 1.35));
  wall(S0, S1, 0, BASE_H, facadeMat(mansionStoneBand(SOUTH_LEN, MANSION_SHOPS.slice(2), 203), 1.3));
  wall(S1, B, 0, BASE_H, facadeMat(mansionStoneBand(EAST_LEN, null, 204), 1.1));

  // ---- balustrade band + ledge ---------------------------------------------
  const balMat = (len: number) =>
    new THREE.MeshStandardMaterial({ map: balusterStrip(len), roughness: 0.95 });
  const ledgeMat = new THREE.MeshStandardMaterial({ color: 0xc9bda6, roughness: 0.9 });
  const ledge = (from: Pt, to: Pt, y: number, depth: number) => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dz) + 0.3, 0.35, depth), ledgeMat);
    m.rotation.y = -Math.atan2(dz, dx);
    m.position.set((from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2);
    m.castShadow = true;
    g.add(m);
  };
  wall(B, A, Y_BAL, BAL_H, balMat(NORTH_LEN));
  arcBand(Y_BAL, BAL_H, balMat(ARC_LEN));
  wall(S0, S1, Y_BAL, BAL_H, balMat(SOUTH_LEN));
  wall(S1, B, Y_BAL, BAL_H, balMat(EAST_LEN));
  ledge(B, A, Y_BAL + 0.05, 1.3);
  ledge(S0, S1, Y_BAL + 0.05, 1.3);
  arcBand(Y_BAL - 0.12, 0.35, ledgeMat, R + 0.5, true);

  // ---- brick mid-section -----------------------------------------------------
  wall(B, A, Y_BRICK, BRICK_H, facadeMat(mansionBrickBand(NORTH_LEN, 211, 0.34)));
  arcBand(Y_BRICK, BRICK_H, facadeMat(mansionBrickBand(ARC_LEN, 212, 0.38)));
  wall(S0, S1, Y_BRICK, BRICK_H, facadeMat(mansionBrickBand(SOUTH_LEN, 213, 0.26)));
  wall(S1, B, Y_BRICK, BRICK_H, facadeMat(mansionBrickBand(EAST_LEN, 214, 0.2)));

  // ---- recessed-look top storey ----------------------------------------------
  wall(B, A, Y_TOP, TOP_H, facadeMat(mansionTopBand(NORTH_LEN, 221), 1.0));
  arcBand(Y_TOP, TOP_H, facadeMat(mansionTopBand(ARC_LEN, 222), 1.0));
  wall(S0, S1, Y_TOP, TOP_H, facadeMat(mansionTopBand(SOUTH_LEN, 223), 1.0));
  wall(S1, B, Y_TOP, TOP_H, facadeMat(mansionTopBand(EAST_LEN, 224), 1.0));

  // ---- cornice + curved crown over the prow -----------------------------------
  const corniceMat = new THREE.MeshStandardMaterial({ color: 0xd8cbac, roughness: 0.9 });
  const cornice = (from: Pt, to: Pt) => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dz) + 0.5, 0.5, 1.35), corniceMat);
    m.rotation.y = -Math.atan2(dz, dx);
    m.position.set((from[0] + to[0]) / 2, HEIGHT + 0.25, (from[1] + to[1]) / 2);
    m.castShadow = true;
    g.add(m);
  };
  cornice(B, A);
  cornice(S0, S1);
  cornice(S1, B);
  arcBand(HEIGHT, 0.5, corniceMat, R + 0.65, true);

  // ---- oval rooftop pavilion on the bow (the building's signature crown) -------
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xcdc1a6, roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6, metalness: 0.4 });
  const pavY = HEIGHT + 0.5;
  // open balustrade terrace ring around the bow roof edge
  const terraceRing = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.2, R + 0.2, 0.9, 28, 1, true, Math.PI, Math.PI),
    new THREE.MeshStandardMaterial({ map: balusterStrip(Math.PI * R), roughness: 0.95, side: THREE.DoubleSide })
  );
  terraceRing.position.set(CX, pavY + 0.45, CZ);
  terraceRing.castShadow = true;
  g.add(terraceRing);
  // setback drum (the pavilion body) with a ring of windows
  const drumR = R - 0.6;
  const drumH = 2.8;
  const drumTex = mansionTopBand(Math.PI * drumR, 233);
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(drumR, drumR, drumH, 24, 1, true, Math.PI, Math.PI),
    facadeMat(drumTex, 1.0)
  );
  drum.position.set(CX, pavY + 0.9 + drumH / 2, CZ);
  drum.castShadow = true;
  g.add(drum);
  // back wall closing the half-drum
  const drumBack = new THREE.Mesh(new THREE.BoxGeometry(drumR * 2, drumH, 0.4), creamMat);
  drumBack.position.set(CX, pavY + 0.9 + drumH / 2, CZ + 0.2);
  g.add(drumBack);
  // shallow cap roof + cornice over the pavilion
  const capRing = new THREE.Mesh(
    new THREE.CylinderGeometry(drumR + 0.45, drumR + 0.45, 0.45, 24, 1, true, Math.PI, Math.PI),
    corniceMat
  );
  capRing.position.set(CX, pavY + 0.9 + drumH + 0.2, CZ);
  g.add(capRing);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(drumR + 0.5, drumR + 0.2, 0.7, 24, 1, false, Math.PI, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 1 })
  );
  cap.position.set(CX, pavY + 0.9 + drumH + 0.6, CZ);
  cap.castShadow = true;
  g.add(cap);
  // flagpole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), railMat);
  pole.position.set(CX - drumR + 0.3, pavY + 0.9 + drumH + 2.2, CZ);
  g.add(pole);

  // ---- roof slab + rooftop structures ------------------------------------------
  const shape = new THREE.Shape();
  shape.moveTo(B[0], -B[1]);
  shape.lineTo(A[0], -A[1]);
  for (let i = 1; i <= 14; i++) {
    const th = Math.PI + (Math.PI * i) / 14;
    shape.lineTo(CX + R * Math.sin(th), -(CZ + R * Math.cos(th)));
  }
  shape.lineTo(S1[0], -S1[1]);
  shape.closePath();
  const roofGeo = new THREE.ShapeGeometry(shape);
  roofGeo.rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 }));
  roof.position.y = HEIGHT;
  g.add(roof);

  const phMat = new THREE.MeshStandardMaterial({ color: 0x8a583f, roughness: 0.95 });
  const ph1 = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, 4), phMat);
  ph1.position.set(44, HEIGHT + 1.1, 37);
  ph1.castShadow = true;
  const ph2 = new THREE.Mesh(new THREE.BoxGeometry(5, 1.8, 3.2), phMat);
  ph2.position.set(70, HEIGHT + 0.9, 41);
  ph2.castShadow = true;
  g.add(ph1, ph2);

  // ---- louvered AC shutter boxes (regular grid, the building's busiest motif) ----
  const louverMat = new THREE.MeshStandardMaterial({ map: louverTexture(), roughness: 0.8 });
  const acGeo = new THREE.BoxGeometry(1.15, 0.95, 0.46);
  const acMatrices: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const FLOORS = 6;
  const floorH = BRICK_H / FLOORS;
  // boxes sit just under each window head, skipping the lowest floor's sills
  const yAt = (f: number) => Y_BRICK + f * floorH + floorH * 0.74;
  const addAC = (x: number, z: number, yaw: number, f: number) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    acMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x, yAt(f), z), q, one));
  };
  const bayStep = 3.7;
  const sd = { x: SOUTH_DX / SOUTH_LEN, z: SOUTH_DZ / SOUTH_LEN };
  for (let f = 0; f < FLOORS; f++) {
    // north face — one per window bay
    for (let x = CX + 1.85; x < EAST_X - 1.0; x += bayStep) {
      addAC(x, NORTH_Z - 0.22, 0, f);
    }
    // south face
    for (let t = 1.85; t < SOUTH_LEN - 1.0; t += bayStep) {
      addAC(S0[0] + sd.x * t + sd.z * 0.22, S0[1] + sd.z * t - sd.x * 0.22, -Math.atan2(sd.z, sd.x), f);
    }
    // around the prow curve (denser — many windows wrap the bow)
    for (let i = 0; i < 5; i++) {
      const th = Math.PI + Math.PI * (0.12 + i * 0.19);
      addAC(CX + (R + 0.2) * Math.sin(th), CZ + (R + 0.2) * Math.cos(th), th, f);
    }
  }
  const acs = new THREE.InstancedMesh(acGeo, louverMat, acMatrices.length);
  acs.castShadow = true;
  acMatrices.forEach((m, i) => acs.setMatrixAt(i, m));
  acs.instanceMatrix.needsUpdate = true;
  g.add(acs);

  // ---- colliders ------------------------------------------------------------------
  // north face
  colliders.add({ minX: CX, maxX: EAST_X, minZ: NORTH_Z, maxZ: NORTH_Z + 1 });
  // wedge body in stepped slices following the south face
  const southZ = (x: number) => S0[1] + ((x - S0[0]) * SOUTH_DZ) / SOUTH_DX;
  const slices = 7;
  for (let i = 0; i < slices; i++) {
    const x0 = CX + ((EAST_X - CX) * i) / slices;
    const x1 = CX + ((EAST_X - CX) * (i + 1)) / slices;
    colliders.add({ minX: x0, maxX: x1, minZ: NORTH_Z + 1, maxZ: southZ((x0 + x1) / 2) });
  }
  // prow curve
  for (let i = 0; i <= 7; i++) {
    const th = Math.PI + (Math.PI * i) / 7;
    colliders.addCentered(CX + (R - 0.3) * Math.sin(th), CZ + (R - 0.3) * Math.cos(th), 2.1, 2.1);
  }
}
