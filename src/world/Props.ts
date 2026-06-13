import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Colliders } from '../player/Collision';
import type { ModelLib } from './Models';
import {
  makeLamps,
  makeHedges,
  STREET_SIGNS,
  BENCHES,
  BUS_STOP,
} from './layout';
import { makeStreetSign, makeBusSign, trafficSign, mulberry32 } from '../textures/canvasSigns';

const cyl = (rt: number, rb: number, h: number, seg = 8) =>
  new THREE.CylinderGeometry(rt, rb, h, seg);

/**
 * Street furniture. Where a CC0 GLTF model was fetched (street lamps, benches,
 * electricity poles, fire hydrants, planters, café sets) it is stamped in;
 * otherwise a procedural fallback is used. Plus bilingual street-name signs,
 * shared bikes, traffic lights/signs, overhead wires, the bus stop, and the
 * hedge walls that close off the map edges.
 */
export function buildProps(scene: THREE.Scene, colliders: Colliders, models: ModelLib): void {
  const g = new THREE.Group();
  scene.add(g);

  const metal = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.55, metalness: 0.6 });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const rng = mulberry32(515);
  const rngYaw = () => rng() * Math.PI * 2;
  const place = (id: string, x: number, z: number, yaw = 0, height?: number) => {
    const o = models.place(id, x, z, { yaw, height });
    if (o) g.add(o);
    return o;
  };

  // ---- streetlights ---------------------------------------------------------
  // (Poly Haven's street_lamp_01 is a wall-mount bracket, unsuitable for a
  // freestanding row, so these are procedural: a curved post + lantern head.)
  const lamps = makeLamps();
  const poleGeo = mergeGeometries([
    cyl(0.08, 0.13, 5.8).translate(0, 2.9, 0),
    cyl(0.05, 0.05, 1.5).rotateZ(0.5).translate(0.55, 5.7, 0),
    cyl(0.045, 0.045, 0.5).translate(1.05, 5.95, 0),
  ]);
  const poles = new THREE.InstancedMesh(poleGeo, metal, lamps.length);
  poles.castShadow = true;
  // classic concession-style lantern head
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x20242a,
    emissive: 0xffe6bd,
    emissiveIntensity: 0.35,
    roughness: 0.5,
  });
  const headGeo = mergeGeometries([
    new THREE.ConeGeometry(0.28, 0.22, 6).translate(0, 0.42, 0),
    new THREE.CylinderGeometry(0.2, 0.26, 0.5, 6),
  ]);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
  const headOffset = new THREE.Matrix4().makeTranslation(1.05, 5.65, 0);
  lamps.forEach((l, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.rot);
    m.compose(new THREE.Vector3(l.x, 0, l.z), q, one);
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m.clone().multiply(headOffset));
    colliders.addCentered(l.x, l.z, 0.4, 0.4);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  g.add(poles, heads);

  // ---- street name signs ----------------------------------------------------
  for (const spec of STREET_SIGNS) {
    const pole = new THREE.Mesh(cyl(0.045, 0.05, 3.0), metal);
    pole.position.set(spec.x, 1.5, spec.z);
    pole.castShadow = true;
    g.add(pole);
    spec.plates.forEach((p, i) => {
      const tex = makeStreetSign(p.cn, p.en);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: 0xffffff,
        emissiveIntensity: 0.32,
        roughness: 0.6,
      });
      // two front-facing planes back-to-back so the characters read correctly
      // from both sides (a single DoubleSide plane mirrors the rear view)
      for (const flip of [0, Math.PI]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), mat);
        plate.rotation.y = p.rot + flip;
        plate.position.set(
          spec.x - Math.sin(p.rot + flip) * 0.012,
          2.65 - i * 0.62,
          spec.z - Math.cos(p.rot + flip) * 0.012
        );
        g.add(plate);
      }
    });
    colliders.addCentered(spec.x, spec.z, 0.35, 0.35);
  }

  // ---- benches + bins ---------------------------------------------------------
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4c34, roughness: 0.9 });
  const binMat = new THREE.MeshStandardMaterial({ color: 0x39483b, roughness: 0.8, metalness: 0.2 });
  const benchProto = new THREE.Group();
  {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.48), wood);
    seat.position.y = 0.44;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.07), wood);
    back.position.set(0, 0.78, -0.22);
    back.rotation.x = -0.15;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.42), metal);
    legL.position.set(-0.7, 0.22, 0);
    const legR = legL.clone();
    legR.position.x = 0.7;
    benchProto.add(seat, back, legL, legR);
    benchProto.traverse((o) => {
      o.castShadow = true;
    });
  }
  const hasBenchModel = !!models.size('painted_wooden_bench');
  for (const b of BENCHES) {
    if (!place('painted_wooden_bench', b.x, b.z, b.rot)) {
      const bench = benchProto.clone();
      bench.position.set(b.x, 0.06, b.z);
      bench.rotation.y = b.rot;
      g.add(bench);
    }
    colliders.addCentered(b.x, b.z, 1.2, 1.2);
    const bin = new THREE.Mesh(cyl(0.3, 0.26, 0.85, 10), binMat);
    bin.position.set(b.x, 0.48, b.z + 1.7);
    bin.castShadow = true;
    g.add(bin);
    colliders.addCentered(b.x, b.z + 1.7, 0.6, 0.6);
  }
  void hasBenchModel;

  // ---- fire hydrants, planters, café set, plants (CC0 models) -----------------
  const hydrants: [number, number][] = [
    [-7.4, 1.5],
    [7.4, -150],
    [-8.8, 25],
    [7.6, 26],
  ];
  for (const [x, z] of hydrants) {
    if (place('fire_hydrant', x, z, rngYaw())) colliders.addCentered(x, z, 0.6, 0.6);
  }

  // planters lining the plaza edge and a few storefronts
  const planters: [number, number, number][] = [
    [-9, 33.5, 0],
    [-4, 33.5, 0],
    [1, 33.5, 0],
    [-6.6, -52, Math.PI / 2],
    [-6.6, -120, Math.PI / 2],
    [6.6, -90, Math.PI / 2],
  ];
  for (const [x, z, yaw] of planters) {
    if (place('planter_box_01', x, z, yaw)) colliders.addCentered(x, z, 1.2, 0.7);
  }

  // potted shrubs flanking shopfront doors and the plaza
  const shrubs: [number, number][] = [
    [-6.7, -38.5], [-6.7, -41.5], [6.7, -104], [6.7, -107],
    [-2, 35], [4, 35], [42, 23.5], [24, 23.5],
  ];
  for (const [x, z] of shrubs) place('calathea_orbifolia_01', x, z, rngYaw());

  // café terrace outside the corner café opposite the mansion (Huaihai NE)
  if (models.size('outdoor_table_chair_set_01')) {
    place('outdoor_table_chair_set_01', 20, 24, 0);
    place('outdoor_table_chair_set_01', 27, 24, Math.PI);
    colliders.addCentered(20, 24, 1.6, 1.6);
    colliders.addCentered(27, 24, 1.6, 1.6);
  }
  // a coffee cart on the plaza
  if (place('CoffeeCart_01', -9.5, 44, Math.PI / 2)) colliders.addCentered(-9.5, 44, 1.6, 1.0);

  // ---- shared bikes -----------------------------------------------------------
  const bikeGeo = mergeGeometries([
    new THREE.TorusGeometry(0.31, 0.03, 6, 14).rotateY(Math.PI / 2).translate(0, 0.31, 0.45),
    new THREE.TorusGeometry(0.31, 0.03, 6, 14).rotateY(Math.PI / 2).translate(0, 0.31, -0.45),
    cyl(0.025, 0.025, 0.95, 5).rotateX(Math.PI / 2 - 0.25).translate(0, 0.55, 0),
    cyl(0.025, 0.025, 0.62, 5).rotateX(0.35).translate(0, 0.62, 0.38),
    cyl(0.025, 0.025, 0.62, 5).rotateX(-0.3).translate(0, 0.62, -0.4),
    cyl(0.02, 0.02, 0.42, 5).rotateZ(Math.PI / 2).translate(0, 0.98, 0.52),
    new THREE.BoxGeometry(0.26, 0.06, 0.3).translate(0, 0.92, -0.18),
  ]);
  const bikeMat = new THREE.MeshStandardMaterial({ color: 0x2779a8, roughness: 0.5, metalness: 0.45 });
  const clusters: [number, number, number, number][] = [
    [6.6, -146, 0, 5],
    [-6.6, -2, 0, 4],
    [24, 29.6, Math.PI / 2, 4],
  ];
  const bikeCount = clusters.reduce((acc, c) => acc + c[3], 0);
  const bikes = new THREE.InstancedMesh(bikeGeo, bikeMat, bikeCount);
  bikes.castShadow = true;
  let bi = 0;
  for (const [x, z, rot, n] of clusters) {
    for (let i = 0; i < n; i++) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot + (Math.sin(i * 7) - 0.5) * 0.14);
      const px = x + Math.cos(rot) * (i - n / 2) * 0.75;
      const pz = z - Math.sin(rot) * (i - n / 2) * 0.75;
      m.compose(new THREE.Vector3(px, 0.06, pz), q, one);
      bikes.setMatrixAt(bi++, m);
    }
    colliders.addCentered(x, z, Math.abs(Math.cos(rot)) * n * 0.8 + 1, Math.abs(Math.sin(rot)) * n * 0.8 + 1);
  }
  bikes.instanceMatrix.needsUpdate = true;
  g.add(bikes);

  // ---- traffic lights ----------------------------------------------------------
  const trafficLight = (x: number, z: number, rot: number) => {
    const tl = new THREE.Group();
    const pole = new THREE.Mesh(cyl(0.08, 0.11, 6.0), metal);
    pole.position.y = 3.0;
    pole.castShadow = true;
    const arm = new THREE.Mesh(cyl(0.05, 0.05, 3.4).rotateZ(Math.PI / 2), metal);
    arm.position.set(1.7, 5.8, 0);
    const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.95, 0.32), metal);
    headBox.position.set(3.2, 5.35, 0);
    tl.add(pole, arm, headBox);
    const colors: [number, number][] = [
      [0xff3b30, 4], // red, lit
      [0x3a2f10, 0],
      [0x10331a, 0],
    ];
    colors.forEach(([c, e], i) => {
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.1, 12),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e })
      );
      dot.position.set(3.2, 5.66 - i * 0.3, -0.17);
      dot.rotation.y = Math.PI;
      tl.add(dot);
    });
    tl.position.set(x, 0, z);
    tl.rotation.y = rot;
    g.add(tl);
    colliders.addCentered(x, z, 0.4, 0.4);
  };
  trafficLight(-5.2, 8.2, 0);
  trafficLight(5.2, 27.8, Math.PI);

  // ---- bus stop -----------------------------------------------------------------
  {
    const bs = new THREE.Group();
    const postL = new THREE.Mesh(cyl(0.05, 0.05, 2.6), metal);
    postL.position.set(-3, 1.3, 0.4);
    const postR = postL.clone();
    postR.position.x = 3;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.1, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x4a5258, roughness: 0.5, metalness: 0.5 })
    );
    roof.position.set(0, 2.62, 0);
    roof.castShadow = true;
    const adTex = makeBusSign();
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 1.45),
      new THREE.MeshStandardMaterial({
        map: adTex,
        emissiveMap: adTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.7,
        roughness: 0.4,
        side: THREE.DoubleSide,
      })
    );
    panel.rotation.y = Math.PI;
    panel.position.set(0, 1.6, 0.62);
    const bench = benchProto.clone();
    bench.scale.set(1.6, 1, 1);
    bench.position.set(0, 0.06, 0.25);
    bench.rotation.y = Math.PI;
    bs.add(postL, postR, roof, panel, bench);
    bs.position.set(BUS_STOP.x, 0.06, BUS_STOP.z);
    g.add(bs);
    colliders.addCentered(BUS_STOP.x, BUS_STOP.z + 0.45, 7.6, 1.2);
  }

  // ---- overhead trolley/utility wires (a Shanghai signature) ---------------------
  const wireMat = new THREE.LineBasicMaterial({ color: 0x14110e });
  const wire = (a: THREE.Vector3, b: THREE.Vector3, sag: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(Math.PI * t) * sag;
      pts.push(p);
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // runs along Huaihai (both sides) …
  for (let x = -86; x < 86; x += 43) {
    wire(v(x, 7.4, 11.5), v(x + 43, 7.3, 11.6), 0.5);
    wire(v(x, 7.6, 24.4), v(x + 43, 7.5, 24.5), 0.55);
  }
  // … criss-crossing the intersection …
  wire(v(-8, 7.6, 4), v(12, 7.2, 30), 0.6);
  wire(v(8, 7.5, 4), v(-12, 7.1, 30), 0.6);
  wire(v(-12, 7.3, 18), v(12, 7.4, 18), 0.5);
  // … and zig-zagging down Wukang Rd
  const zig: [number, number, number][] = [
    [-6.6, 6.9, -16],
    [6.6, 6.7, -62],
    [-6.6, 7.0, -108],
    [6.6, 6.8, -154],
    [-6.6, 6.9, -200],
    [6.6, 6.7, -246],
  ];
  for (let i = 0; i < zig.length - 1; i++) {
    wire(v(...zig[i]), v(...zig[i + 1]), 0.7);
    wire(v(zig[i][0], zig[i][1] - 0.5, zig[i][2]), v(zig[i + 1][0], zig[i + 1][1] - 0.5, zig[i + 1][2]), 0.65);
  }

  // utility poles carrying the wires (procedural concrete poles with crossarms)
  const poleWoodMat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95 });
  const utilityPole = (x: number, z: number, rot = 0) => {
    const pole = new THREE.Mesh(cyl(0.1, 0.15, 8.4), poleWoodMat);
    pole.position.set(x, 4.2, z);
    pole.castShadow = true;
    g.add(pole);
    for (const ay of [7.4, 6.9]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), poleWoodMat);
      arm.position.set(x, ay, z);
      arm.rotation.y = rot;
      arm.castShadow = true;
      g.add(arm);
    }
    colliders.addCentered(x, z, 0.4, 0.4);
  };
  utilityPole(-86, 9.4);
  utilityPole(-43, 9.4);
  utilityPole(43, 9.4);
  utilityPole(86, 9.4);
  utilityPole(-60, 26.8);
  utilityPole(60, 26.8);
  for (const [x, , z] of zig) utilityPole(x > 0 ? 7.1 : -7.1, z, Math.PI / 2);

  // ---- traffic signs ---------------------------------------------------------------
  const roadSign = (x: number, z: number, kind: 'oneway' | 'noentry', rot: number) => {
    const pole = new THREE.Mesh(cyl(0.04, 0.045, 2.7), metal);
    pole.position.set(x, 1.35, z);
    pole.castShadow = true;
    g.add(pole);
    const tex = trafficSign(kind);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.62),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })
    );
    face.rotation.y = rot;
    face.position.set(x + Math.sin(rot) * 0.03, 2.35, z + Math.cos(rot) * 0.03);
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.62),
      new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.5 })
    );
    back.rotation.y = rot + Math.PI;
    back.position.set(x - Math.sin(rot) * 0.03, 2.35, z - Math.cos(rot) * 0.03);
    g.add(face, back);
    colliders.addCentered(x, z, 0.3, 0.3);
  };
  roadSign(-6.7, 0.5, 'oneway', Math.PI); // Wukang Rd is one-way
  roadSign(6.7, -156.2, 'noentry', 0); // no entry from Anfu Rd
  roadSign(-8.7, 24.5, 'noentry', Math.PI / 2);

  // ---- wisteria draping the red-brick arcade across Huaihai (per reference) ------
  // a green vine rail with many drooping lilac flower clusters
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x46583a, roughness: 1 });
  const wisteriaMat = new THREE.MeshStandardMaterial({ color: 0xa487d6, roughness: 0.9, emissive: 0x2a1f44, emissiveIntensity: 0.3 });
  const wisteriaMat2 = new THREE.MeshStandardMaterial({ color: 0x8a63c8, roughness: 0.9, emissive: 0x241a3a, emissiveIntensity: 0.3 });
  const clusterGeo = new THREE.ConeGeometry(0.22, 1.2, 6).translate(0, -0.6, 0);
  const dropFrom = (x0: number, x1: number, z: number, y: number) => {
    // leafy vine rail just in front of the upper arcade
    const vine = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), 0.55, 0.7), vineMat);
    vine.position.set((x0 + x1) / 2, y + 0.25, z);
    vine.castShadow = true;
    g.add(vine);
    const n = Math.floor(Math.abs(x1 - x0) / 0.42);
    const clusters = new THREE.InstancedMesh(clusterGeo, wisteriaMat, n);
    const clusters2 = new THREE.InstancedMesh(clusterGeo, wisteriaMat2, n);
    let c1 = 0;
    let c2 = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.min(x0, x1) + i * 0.42 + (rng() - 0.5) * 0.18;
      const drop = 0.85 + rng() * 1.4;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
      m.compose(new THREE.Vector3(x, y, z + (rng() - 0.5) * 0.35), q, new THREE.Vector3(1.1, drop, 1.1));
      if (i % 2 === 0) clusters.setMatrixAt(c1++, m);
      else clusters2.setMatrixAt(c2++, m);
    }
    clusters.count = c1;
    clusters2.count = c2;
    clusters.instanceMatrix.needsUpdate = true;
    clusters2.instanceMatrix.needsUpdate = true;
    clusters.castShadow = clusters2.castShadow = true;
    g.add(clusters, clusters2);
  };
  // draped along the NE shophouse-row frontage, in front of the facade (z=5)
  dropFrom(13, 33, 5.3, 4.2);
  dropFrom(35, 52, 5.3, 4.2);

  // ---- hedges -------------------------------------------------------------------
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x2e4226, roughness: 1 });
  for (const h of makeHedges()) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(h.w, h.h, h.d), hedgeMat);
    mesh.position.set(h.cx, h.h / 2, h.cz);
    if (h.rot) mesh.rotation.y = h.rot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    if (h.rot) {
      // rotated hedge → stepped collider along its axis
      const dx = Math.cos(-h.rot);
      const dz = Math.sin(-h.rot);
      colliders.addStrip(h.cx - (dx * h.w) / 2, h.cz - (dz * h.w) / 2, dx, dz, h.w, h.d / 2 + 0.2);
    } else {
      colliders.addCentered(h.cx, h.cz, h.w, h.d);
    }
  }
}
