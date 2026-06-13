import * as THREE from 'three';
import type { Colliders } from '../player/Collision';
import type { Lot } from './layout';
import { makeFacade, makeShopSign, makeAwning, mulberry32 } from '../textures/canvasSigns';

const ROT: Record<Lot['facing'], number> = {
  S: 0,
  E: Math.PI / 2,
  N: Math.PI,
  W: -Math.PI / 2,
};

const GARDEN_COLORS = ['#9b5d43', '#8a5440', '#a06a4e', '#7e4f3c'];
const PLASTER_COLORS = ['#cfc0a4', '#d8cbb2', '#b8a98c', '#c2b49a', '#9aa08e', '#d2c2ae'];
const TRIMS = ['#ece2cc', '#e2d6ba', '#f0e8d8'];
const AWNING_PAIRS: [string, string][] = [
  ['#7a2727', '#e8e0d0'],
  ['#2e4a3a', '#e8e0d0'],
  ['#31425e', '#ded8c8'],
  ['#6e4426', '#e0d6c0'],
];

/**
 * Parametric generator for the lots lining the streets: red-brick garden
 * houses behind low walls, plastered lane rows, storefronts with awnings and
 * glowing signs, and taller Huaihai Rd apartment blocks.
 */
export function buildBuildings(scene: THREE.Scene, lots: Lot[], colliders: Colliders): void {
  const g = new THREE.Group();
  scene.add(g);

  const roofTileMat = new THREE.MeshStandardMaterial({ color: 0x5d4a3f, roughness: 1 });
  const redTileMat = new THREE.MeshStandardMaterial({ color: 0x7e3b2c, roughness: 1 });
  const flatRoofMat = new THREE.MeshStandardMaterial({ color: 0x4d4540, roughness: 1 });
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x2a3a2e, roughness: 0.7, metalness: 0.4 });
  const creeperMat = new THREE.MeshStandardMaterial({ color: 0x35462a, roughness: 1 });
  const acMatrices: THREE.Matrix4[] = [];

  for (const lot of lots) {
    const rng = mulberry32(lot.seed);
    const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

    const setback = lot.style === 'garden' ? 3.5 : 0;
    const floorH = lot.style === 'apartment' ? 3.0 : 3.05;
    const h = (lot.shop ? 3.5 + (lot.floors - 1) * floorH : lot.floors * floorH) + 0.4;
    const w = lot.w - 0.5;
    const d = lot.d;

    const isBrick = lot.style === 'garden' || lot.style === 'shophouse';
    const wallColor = isBrick ? pick(GARDEN_COLORS) : pick(PLASTER_COLORS);
    const trimColor = pick(TRIMS);
    const tex = makeFacade({
      widthM: w,
      heightM: h,
      floors: lot.floors,
      style: isBrick ? 'brick' : 'plaster',
      wallColor,
      trimColor,
      storefront: lot.shop ? { name: lot.shop.name, color: lot.shop.color } : null,
      litRatio: 0.22 + rng() * 0.22,
      seed: lot.seed,
    });
    const frontMat = new THREE.MeshStandardMaterial({
      map: tex.map,
      emissiveMap: tex.emissiveMap,
      normalMap: tex.normalMap,
      emissive: 0xffffff,
      emissiveIntensity: 1.2,
      roughness: 0.92,
    });
    if (tex.normalMap) frontMat.normalScale.set(0.9, 0.9);
    const sideMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(wallColor).multiplyScalar(0.78),
      roughness: 0.95,
    });

    // group origin sits at the center of the street-front line, facade = local +z
    const grp = new THREE.Group();
    grp.rotation.y = ROT[lot.facing];
    switch (lot.facing) {
      case 'E':
      case 'W':
        grp.position.set(lot.front, 0, lot.s);
        break;
      default:
        grp.position.set(lot.s, 0, lot.front);
    }
    g.add(grp);

    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
      sideMat,
      sideMat,
      flatRoofMat,
      sideMat,
      frontMat,
      sideMat,
    ]);
    box.position.set(0, h / 2, -setback - d / 2);
    box.castShadow = true;
    box.receiveShadow = true;
    grp.add(box);

    // pitched roof for the older low-rise styles (shophouses always get red tile)
    if (lot.style === 'shophouse' || (lot.style !== 'apartment' && rng() < 0.75)) {
      const tiles = lot.style === 'shophouse' ? redTileMat : roofTileMat;
      const ridge = lot.style === 'shophouse' ? 1.3 : 1.5 + rng() * 0.9;
      const shape = new THREE.Shape([
        new THREE.Vector2(-w / 2 - 0.4, 0),
        new THREE.Vector2(w / 2 + 0.4, 0),
        new THREE.Vector2(0, ridge),
      ]);
      const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false }), [
        sideMat,
        tiles,
      ]);
      roof.rotation.y = Math.PI;
      roof.position.set(0, h - 0.05, -setback + 0.3);
      roof.castShadow = true;
      grp.add(roof);
    }

    // storefront dressing: striped awning + glowing sign
    if (lot.shop) {
      const [c1, c2] = pick(AWNING_PAIRS);
      const awnW = Math.min(w * 0.7, 7);
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(awnW, 0.1, 1.5),
        new THREE.MeshStandardMaterial({ map: makeAwning(c1, c2), roughness: 0.9 })
      );
      awning.rotation.x = 0.22;
      awning.position.set(0, 3.0, -setback + 0.72);
      awning.castShadow = true;
      grp.add(awning);

      const signTex = makeShopSign(lot.shop.name, lot.shop.color);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.75, 7.5), 0.85),
        new THREE.MeshStandardMaterial({
          map: signTex,
          emissiveMap: signTex,
          emissive: 0xffffff,
          emissiveIntensity: 1.4,
          roughness: 0.8,
        })
      );
      sign.position.set(0, 3.95, -setback + 0.07);
      grp.add(sign);
    }

    // garden houses get a low street wall with a gate and greenery
    if (lot.style === 'garden') {
      const wallH = 2.1;
      const wallMat = new THREE.MeshStandardMaterial({
        color: rng() < 0.5 ? 0x8a7a64 : 0x9b8468,
        roughness: 0.95,
      });
      const gateX = (rng() - 0.5) * w * 0.5;
      const gateW = 1.5;
      const leftW = gateX - gateW / 2 + w / 2;
      const rightW = w / 2 - gateX - gateW / 2;
      if (leftW > 0.2) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(leftW, wallH, 0.28), wallMat);
        seg.position.set(-w / 2 + leftW / 2, wallH / 2, -0.14);
        seg.castShadow = true;
        seg.receiveShadow = true;
        grp.add(seg);
      }
      if (rightW > 0.2) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(rightW, wallH, 0.28), wallMat);
        seg.position.set(w / 2 - rightW / 2, wallH / 2, -0.14);
        seg.castShadow = true;
        seg.receiveShadow = true;
        grp.add(seg);
      }
      const gate = new THREE.Mesh(new THREE.PlaneGeometry(gateW, wallH - 0.15), gateMat);
      gate.position.set(gateX, (wallH - 0.15) / 2, -0.1);
      grp.add(gate);
      const coping = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.36), wallMat);
      coping.position.set(0, wallH + 0.06, -0.14);
      grp.add(coping);
      // creepers spilling over the wall
      const creeper = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.7, 0.55), creeperMat);
      creeper.position.set(0, wallH + 0.18, -0.42);
      grp.add(creeper);
    }

    // air-conditioner boxes pinned to upper facades
    if (lot.style !== 'garden') {
      grp.updateMatrixWorld(true);
      const n = Math.floor(w / 4.5);
      for (let i = 0; i < n; i++) {
        if (rng() < 0.35) continue;
        const local = new THREE.Matrix4().makeTranslation(
          (rng() - 0.5) * (w - 2),
          3.2 + rng() * (h - 5),
          0.26
        );
        acMatrices.push(grp.matrixWorld.clone().multiply(local));
      }
    }

    // colliders
    colliders.add(lotBodyBox(lot, setback));
    if (lot.style === 'garden') colliders.add(lotWallBox(lot));
  }

  if (acMatrices.length > 0) {
    const ac = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.85, 0.65, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xb8bdb6, roughness: 0.6, metalness: 0.15 }),
      acMatrices.length
    );
    acMatrices.forEach((m, i) => ac.setMatrixAt(i, m));
    ac.instanceMatrix.needsUpdate = true;
    g.add(ac);
  }
}

function lotBodyBox(lot: Lot, setback: number) {
  const half = lot.w / 2;
  switch (lot.facing) {
    case 'E':
      return { minX: lot.front - setback - lot.d, maxX: lot.front - setback, minZ: lot.s - half, maxZ: lot.s + half };
    case 'W':
      return { minX: lot.front + setback, maxX: lot.front + setback + lot.d, minZ: lot.s - half, maxZ: lot.s + half };
    case 'S':
      return { minX: lot.s - half, maxX: lot.s + half, minZ: lot.front - setback - lot.d, maxZ: lot.front - setback };
    default:
      return { minX: lot.s - half, maxX: lot.s + half, minZ: lot.front + setback, maxZ: lot.front + setback + lot.d };
  }
}

function lotWallBox(lot: Lot) {
  const half = lot.w / 2;
  switch (lot.facing) {
    case 'E':
      return { minX: lot.front - 0.3, maxX: lot.front, minZ: lot.s - half, maxZ: lot.s + half };
    case 'W':
      return { minX: lot.front, maxX: lot.front + 0.3, minZ: lot.s - half, maxZ: lot.s + half };
    case 'S':
      return { minX: lot.s - half, maxX: lot.s + half, minZ: lot.front - 0.3, maxZ: lot.front };
    default:
      return { minX: lot.s - half, maxX: lot.s + half, minZ: lot.front, maxZ: lot.front + 0.3 };
  }
}
