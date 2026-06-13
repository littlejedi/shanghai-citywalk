import * as THREE from 'three';
import { mulberry32 } from '../textures/canvasSigns';

const SHIRTS = [0x6e7b8c, 0x8c6e6e, 0x5a6e5a, 0x8c8c7a, 0x4a5a7a, 0x7a5a4a, 0xa89888, 0x37424e, 0x9a8458];
const PANTS = [0x2e3440, 0x3a3a3a, 0x4a4038, 0x32404a, 0x554a42];
const SKIN = 0xd9b9a0;
const HAIR = 0x241d18;

interface Walker {
  group: THREE.Group;
  a: THREE.Vector3;
  b: THREE.Vector3;
  t: number;
  dir: 1 | -1;
  speed: number; // as fraction of path per second
  phase: number;
}

function makePerson(rng: () => number, raisedArm = false): THREE.Group {
  const g = new THREE.Group();
  const pick = (arr: number[]) => arr[Math.floor(rng() * arr.length)];
  const shirt = new THREE.MeshStandardMaterial({ color: pick(SHIRTS), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: pick(PANTS), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.78, 0.17), pants);
  legs.position.y = 0.39;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.6, 0.21), shirt);
  torso.position.y = 1.08;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.09), shirt);
  armL.position.set(-0.25, 1.1, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.09), shirt);
  if (raisedArm) {
    // holding a phone up toward the mansion
    armR.position.set(0.25, 1.42, 0.14);
    armR.rotation.x = -2.1;
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.16, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.3, metalness: 0.4 })
    );
    phone.position.set(0.25, 1.62, 0.3);
    g.add(phone);
  } else {
    armR.position.set(0.25, 1.1, 0);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), skin);
  head.position.y = 1.52;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  cap.position.y = 1.54;
  g.add(legs, torso, armL, armR, head, cap);
  g.traverse((o) => {
    o.castShadow = true;
  });
  const s = 0.93 + rng() * 0.13;
  g.scale.set(s, s, s);
  return g;
}

/**
 * A handful of simple figures: walkers looping along the sidewalks and zebra
 * crossings, plus the obligatory crowd photographing 武康大楼 from the plaza.
 * Returns a per-frame update function.
 */
export function buildPedestrians(scene: THREE.Scene): (dt: number) => void {
  const rng = mulberry32(20240601);
  const g = new THREE.Group();
  scene.add(g);

  const walkers: Walker[] = [];
  const route = (ax: number, az: number, bx: number, bz: number, t0: number) => {
    const person = makePerson(rng);
    g.add(person);
    const a = new THREE.Vector3(ax, 0.12, az);
    const b = new THREE.Vector3(bx, 0.12, bz);
    walkers.push({
      group: person,
      a,
      b,
      t: t0,
      dir: rng() < 0.5 ? 1 : -1,
      speed: (1.1 + rng() * 0.4) / a.distanceTo(b),
      phase: rng() * 10,
    });
  };

  // sidewalk strolls
  route(-5.8, -8, -5.8, -240, 0.15);
  route(-5.8, -8, -5.8, -240, 0.55);
  route(5.8, -16, 5.8, -140, 0.4);
  route(5.8, -176, 5.8, -250, 0.7);
  route(-70, 7.6, 80, 7.6, 0.3);
  route(-70, 7.6, 80, 7.6, 0.75);
  route(-60, 29.5, -12, 29.5, 0.5);
  route(32, 29.5, 88, 29.5, 0.2);
  route(14, -158.5, 56, -158.5, 0.45); // Anfu Rd
  // zebra crossings
  route(-5.5, 7.25, 5.5, 7.25, 0.3);
  route(-9.2, 7.5, -9.2, 28.5, 0.6);
  route(9.2, 7.5, 9.2, 28.5, 0.1);
  // plaza wanderers
  route(-9, 35, 12, 44, 0.4);
  route(-4, 44, 8, 36, 0.8);

  // the photo crowd facing the prow (static)
  const prow = new THREE.Vector3(15.5, 0, 36.6);
  const photoSpots: [number, number][] = [
    [7, 42.5],
    [4.5, 39],
    [9, 37.5],
    [1, 41.5],
  ];
  photoSpots.forEach(([x, z], i) => {
    const person = makePerson(rng, i < 2);
    person.position.set(x, 0.12, z);
    person.rotation.y = Math.atan2(prow.x - x, prow.z - z);
    g.add(person);
  });
  // two friends chatting outside the café
  const chat1 = makePerson(rng);
  chat1.position.set(-6.5, 0.12, -38);
  chat1.rotation.y = Math.PI / 3;
  const chat2 = makePerson(rng);
  chat2.position.set(-6.1, 0.12, -37);
  chat2.rotation.y = Math.PI + Math.PI / 4;
  g.add(chat1, chat2);

  return (dt: number) => {
    for (const w of walkers) {
      w.t += w.speed * w.dir * dt;
      if (w.t >= 1) {
        w.t = 1;
        w.dir = -1;
      } else if (w.t <= 0) {
        w.t = 0;
        w.dir = 1;
      }
      w.group.position.lerpVectors(w.a, w.b, w.t);
      const dx = (w.b.x - w.a.x) * w.dir;
      const dz = (w.b.z - w.a.z) * w.dir;
      w.group.rotation.y = Math.atan2(dx, dz);
      w.phase += dt * 7;
      w.group.position.y = 0.12 + Math.abs(Math.sin(w.phase)) * 0.025;
    }
  };
}
