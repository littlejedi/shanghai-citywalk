import * as THREE from 'three';
import type { MaterialLib } from '../textures/materials';
import type { Colliders } from '../player/Collision';
import { DIAG, CROSSWALKS, EXTRA_COLLIDERS, diagPoint } from './layout';

const TILE = 5; // meters of world space per asphalt/paving texture tile

export async function buildStreets(
  scene: THREE.Scene,
  lib: MaterialLib,
  colliders: Colliders
): Promise<void> {
  const g = new THREE.Group();
  scene.add(g);

  const flat = (w: number, l: number, mat: THREE.Material, x: number, z: number, y = 0, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
    m.rotation.order = 'YXZ';
    m.rotation.y = rotY;
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // base ground under everything (visible only in gaps)
  flat(700, 700, await lib.pbr('concrete', 120, 120, { tint: 0xb0a89a }), 0, -80, -0.05);

  // ---- carriageways -------------------------------------------------------
  const road = async (w: number, l: number, x: number, z: number, rotY = 0, y = 0) =>
    flat(w, l, await lib.pbr('asphalt', w / TILE, l / TILE), x, z, y, rotY);

  await road(7, 298, 0, -123); // Wukang Rd, through the intersection
  await road(91.5, 16, -49.25, 18, 0); // Huaihai Rd west arm
  await road(91.5, 16, 49.25, 18, 0); // Huaihai Rd east arm
  await road(60.5, 6, 33.75, -160, 0); // Anfu Rd stub
  {
    const c = diagPoint(DIAG.length / 2, 0); // Xingguo Rd diagonal stub
    await road(DIAG.length, DIAG.halfRoad * 2, c.x, c.z, -DIAG.angle, 0.01);
  }

  // ---- sidewalks ----------------------------------------------------------
  const sidewalk = async (cx: number, cz: number, w: number, d: number, rotY = 0) => {
    const mat = await lib.pbr('paving', w / 2.4, d / 2.4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat);
    m.position.set(cx, 0.06, cz);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    g.add(m);
  };

  await sidewalk(-5.5, -133.5, 4, 277); // Wukang west, z -272..5
  await sidewalk(5.5, -74.5, 4, 159); // Wukang east, z -154..5
  await sidewalk(5.5, -219, 4, 106); // Wukang east, z -272..-166
  await sidewalk(-49.25, 7.5, 91.5, 5); // Huaihai north W
  await sidewalk(49.25, 7.5, 91.5, 5); // Huaihai north E
  await sidewalk(-49.25, 29, 91.5, 6); // Huaihai south W
  await sidewalk(0, 29, 7, 6); // Huaihai south center (plaza approach)
  await sidewalk(49.25, 29, 91.5, 6); // Huaihai south E (fronting the mansion)
  await sidewalk(33.75, -155.5, 60.5, 3); // Anfu north
  await sidewalk(33.75, -164.5, 60.5, 3); // Anfu south
  await sidewalk(3, 39.5, 30, 17); // plaza in front of the mansion prow
  {
    const n = diagPoint(DIAG.length / 2, -(DIAG.halfRoad + DIAG.sidewalkW / 2));
    const s = diagPoint(DIAG.length / 2, DIAG.halfRoad + DIAG.sidewalkW / 2);
    await sidewalk(n.x, n.z, DIAG.length, DIAG.sidewalkW, -DIAG.angle);
    await sidewalk(s.x, s.z, DIAG.length, DIAG.sidewalkW, -DIAG.angle);
  }

  // ---- curbs --------------------------------------------------------------
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x76716a, roughness: 0.95 });
  const curb = (cx: number, cz: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), curbMat);
    m.position.set(cx, 0.08, cz);
    m.receiveShadow = true;
    g.add(m);
  };
  curb(-3.61, -133.5, 0.22, 277);
  curb(3.61, -133.5, 0.22, 277);
  curb(-49.25, 10, 91.5, 0.22);
  curb(49.25, 10, 91.5, 0.22);
  curb(-49.25, 26, 91.5, 0.22);
  curb(49.25, 26, 91.5, 0.22);
  curb(33.75, -157, 60.5, 0.22);
  curb(33.75, -163, 60.5, 0.22);

  // ---- road markings ------------------------------------------------------
  const markMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.85 });
  const mark = (w: number, l: number, x: number, z: number, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), markMat);
    m.rotation.order = 'YXZ';
    m.rotation.y = rotY;
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    g.add(m);
  };

  // Huaihai center dashes
  for (let x = -88; x <= 88; x += 8) {
    if (Math.abs(x) < 11) continue;
    mark(2.8, 0.16, x, 18);
  }
  // Xingguo stub dashes
  for (let t = 8; t <= 56; t += 8) {
    const p = diagPoint(t, 0);
    mark(2.8, 0.16, p.x, p.z, -DIAG.angle);
  }
  // stop lines at the intersection approaches
  mark(0.4, 7, -12, 22); // Huaihai eastbound
  mark(0.4, 7, 12, 14); // Huaihai westbound
  mark(7, 0.4, 0, 4.4); // Wukang southbound

  // lane arrows
  const arrowShape = new THREE.Shape([
    new THREE.Vector2(-0.14, -1.2),
    new THREE.Vector2(0.14, -1.2),
    new THREE.Vector2(0.14, 0.15),
    new THREE.Vector2(0.45, 0.15),
    new THREE.Vector2(0, 1.2),
    new THREE.Vector2(-0.45, 0.15),
    new THREE.Vector2(-0.14, 0.15),
  ]);
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  arrowGeo.rotateX(-Math.PI / 2); // arrow now points -z (north)
  const arrow = (x: number, z: number, rotY: number) => {
    const m = new THREE.Mesh(arrowGeo, markMat);
    m.rotation.y = rotY;
    m.position.set(x, 0.016, z);
    g.add(m);
  };
  arrow(-16, 22, -Math.PI / 2); // eastbound
  arrow(16, 14, Math.PI / 2); // westbound
  arrow(1.75, -1, Math.PI); // Wukang toward the intersection
  arrow(-1.75, -8, 0); // Wukang heading north

  // zebra crossings
  for (const cw of CROSSWALKS) {
    const n = Math.floor(cw.span / 0.95);
    for (let i = 0; i < n; i++) {
      const off = -cw.span / 2 + 0.5 + i * 0.95;
      if (cw.dir === 'x') mark(0.5, cw.rungLen, cw.cx + off, cw.cz);
      else mark(cw.rungLen, 0.5, cw.cx, cw.cz + off);
    }
  }

  // ---- world boundary colliders ------------------------------------------
  for (const b of EXTRA_COLLIDERS) colliders.add(b);
  // fence along the south side of the Xingguo stub (visual hedge added in Props)
  const f = diagPoint(0, DIAG.halfRoad + DIAG.sidewalkW + 1.2);
  colliders.addStrip(f.x, f.z, DIAG.dx, DIAG.dz, DIAG.length, 1.2);
}
