import * as THREE from 'three';

export interface Box2 {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * Flat-world collision: the player is a circle on the XZ plane, the world is a
 * set of axis-aligned boxes. Rotated walls are approximated with short stepped
 * runs of boxes (addStrip).
 */
export class Colliders {
  readonly boxes: Box2[] = [];

  add(b: Box2) {
    this.boxes.push(b);
  }

  addCentered(cx: number, cz: number, w: number, d: number) {
    this.add({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  }

  /** Stepped AABB approximation of a wall running along an arbitrary line. */
  addStrip(x0: number, z0: number, dx: number, dz: number, length: number, halfWidth: number, step = 3) {
    const s = Math.max(halfWidth, step * 0.75);
    for (let t = 0; t <= length; t += step) {
      this.addCentered(x0 + dx * t, z0 + dz * t, s * 2, s * 2);
    }
  }

  resolve(p: THREE.Vector3, r: number) {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.boxes) {
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // Center is inside the box: exit through the nearest face.
          const pushW = p.x - b.minX + r;
          const pushE = b.maxX - p.x + r;
          const pushN = p.z - b.minZ + r;
          const pushS = b.maxZ - p.z + r;
          const m = Math.min(pushW, pushE, pushN, pushS);
          if (m === pushW) p.x = b.minX - r;
          else if (m === pushE) p.x = b.maxX + r;
          else if (m === pushN) p.z = b.minZ - r;
          else p.z = b.maxZ + r;
        }
      }
    }
  }
}
