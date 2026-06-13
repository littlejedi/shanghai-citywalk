import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import type { Colliders } from './Collision';

const EYE_HEIGHT = 1.7;
const RADIUS = 0.42;
const WALK_SPEED = 2.7;
const SPRINT_SPEED = 5.4;
const UP = new THREE.Vector3(0, 1, 0);

export class PlayerControls {
  readonly plc: PointerLockControls;
  private keys = new Set<string>();
  private vel = new THREE.Vector3();
  private bobPhase = 0;
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private target = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    private colliders: Colliders
  ) {
    this.plc = new PointerLockControls(camera, dom);
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  lock() {
    this.plc.lock();
  }

  get locked() {
    return this.plc.isLocked;
  }

  update(dt: number) {
    const k = this.keys;
    const mz =
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const mx =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;

    this.camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    this.fwd.normalize();
    this.right.crossVectors(this.fwd, UP).normalize();

    this.target.set(0, 0, 0);
    if (this.plc.isLocked) {
      this.target.addScaledVector(this.fwd, mz).addScaledVector(this.right, mx);
      if (this.target.lengthSq() > 0) this.target.normalize().multiplyScalar(speed);
    }
    this.vel.lerp(this.target, 1 - Math.exp(-12 * dt));

    const p = this.camera.position;
    p.addScaledVector(this.vel, dt);
    this.colliders.resolve(p, RADIUS);
    p.x = THREE.MathUtils.clamp(p.x, -105, 105);
    p.z = THREE.MathUtils.clamp(p.z, -295, 75);

    // subtle head bob scaled by movement speed
    const moving = Math.min(1, this.vel.length() / WALK_SPEED);
    this.bobPhase += dt * (7 + (sprint ? 4 : 0)) * moving;
    p.y = EYE_HEIGHT + Math.sin(this.bobPhase) * 0.032 * moving;
  }
}
