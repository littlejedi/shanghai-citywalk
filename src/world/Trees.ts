import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MaterialLib } from '../textures/materials';
import type { Colliders } from '../player/Collision';
import type { TreeSpot } from './layout';
import { mulberry32 } from '../textures/canvasSigns';

/**
 * London plane trees (法国梧桐), the signature of the former French Concession.
 * Trunk + branch fork carry a real bark texture; the canopy is built from
 * many alpha-mapped leaf-cluster cards (crossed quads) so it reads as dense
 * but see-through foliage rather than a solid blob — the main thing that made
 * the old trees look fake.
 */

// Painted leaf-cluster sprite: a dense, roughly round leafy clump with a soft
// alpha edge so overlapping cards read as full foliage rather than spikes.
function leafClusterTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const rng = mulberry32(7);
  const greens = ['#4f6a2e', '#5a7a35', '#688b3d', '#456026', '#739a45', '#52732f'];
  const cx = S / 2;
  const cy = S / 2;
  // dense core of overlapping small leaf blobs, thinning toward the rim
  for (let i = 0; i < 1400; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = Math.pow(rng(), 0.5) * (S * 0.47);
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    const r = 7 + rng() * 14 * (1 - rad / (S * 0.5));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * Math.PI);
    ctx.globalAlpha = 0.6 + rng() * 0.4;
    ctx.fillStyle = greens[Math.floor(rng() * greens.length)];
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // soft alpha falloff at the rim so edges of cards feather out
  const grad = ctx.createRadialGradient(cx, cy, S * 0.28, cx, cy, S * 0.5);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export async function plantTrees(
  scene: THREE.Scene,
  spots: TreeSpot[],
  lib: MaterialLib,
  colliders: Colliders
): Promise<void> {
  const rng = mulberry32(99);

  // ---- trunk + main branches (instanced) ----
  const cyl = (rt: number, rb: number, h: number) => new THREE.CylinderGeometry(rt, rb, h, 8);
  const trunkGeo = mergeGeometries([
    cyl(0.2, 0.34, 4.0).translate(0, 2.0, 0),
    cyl(0.12, 0.18, 2.8).rotateZ(0.6).translate(0.74, 4.7, 0),
    cyl(0.12, 0.18, 2.8).rotateZ(-0.55).translate(-0.7, 4.8, 0.12),
    cyl(0.1, 0.15, 2.4).rotateX(0.55).translate(0, 4.6, 0.66),
    cyl(0.1, 0.15, 2.4).rotateX(-0.5).translate(0.1, 4.6, -0.66),
  ]);
  const barkMat = await lib.pbr('bark', 1, 2.5, { roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, spots.length);
  trunks.castShadow = true;
  trunks.receiveShadow = true;

  // ---- canopy: many leaf-cluster cards ----
  const leafTex = leafClusterTexture();
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    alphaTest: 0.5,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.95,
    color: 0xeaf0df,
  });
  // a crossed-quad card (two perpendicular planes) as the unit cluster
  const quad = new THREE.PlaneGeometry(1, 1);
  const cardGeo = mergeGeometries([quad.clone(), quad.clone().rotateY(Math.PI / 2)]);

  const CARDS_PER_TREE = 40;
  const cards = new THREE.InstancedMesh(cardGeo, leafMat, spots.length * CARDS_PER_TREE);
  cards.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let ci = 0;

  spots.forEach((spot, i) => {
    const s = spot.s;
    q.setFromEuler(eu.set(0, rng() * Math.PI * 2, 0));
    m.compose(new THREE.Vector3(spot.x, 0, spot.z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m);

    // canopy is a broad ellipsoidal mass of clusters around the crown
    const crownY = 6.2 * s;
    const rx = 3.6 * s;
    const ry = 2.4 * s;
    for (let k = 0; k < CARDS_PER_TREE; k++) {
      // fill the whole volume (not just a shell) so the canopy reads as solid
      const u = rng() * Math.PI * 2;
      const v = Math.acos(2 * rng() - 1);
      const shell = 0.3 + rng() * 0.7;
      const dx = Math.cos(u) * Math.sin(v) * rx * shell;
      const dy = Math.cos(v) * ry * shell;
      const dz = Math.sin(u) * Math.sin(v) * rx * shell;
      pos.set(spot.x + dx, crownY + dy, spot.z + dz);
      q.setFromEuler(eu.set(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6));
      const cs = (2.6 + rng() * 1.6) * s;
      scl.set(cs, cs, cs);
      m.compose(pos, q, scl);
      cards.setMatrixAt(ci++, m);
    }
    colliders.addCentered(spot.x, spot.z, 0.85, 0.85);
  });
  trunks.instanceMatrix.needsUpdate = true;
  cards.instanceMatrix.needsUpdate = true;
  scene.add(trunks, cards);
}
