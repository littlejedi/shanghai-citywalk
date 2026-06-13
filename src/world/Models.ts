import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads the CC0 GLTF props fetched by scripts/fetch-assets.mjs and stamps
 * grounded, correctly-scaled copies into the scene. Each prototype's real
 * bounding box is measured once so callers place props by desired height in
 * meters rather than guessing the model's native scale. Missing models simply
 * return null so callers can fall back to procedural geometry.
 */
export class ModelLib {
  private loader = new GLTFLoader();
  private protos = new Map<string, THREE.Object3D | null>();

  async load(id: string): Promise<THREE.Object3D | null> {
    if (this.protos.has(id)) return this.protos.get(id)!;
    try {
      const gltf = await this.loader.loadAsync(`/assets/models/${id}/${id}_2k.gltf`);
      const root = gltf.scene;
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (mat && 'roughness' in mat) mat.envMapIntensity = 1;
        }
      });
      this.protos.set(id, root);
      return root;
    } catch {
      this.protos.set(id, null);
      return null;
    }
  }

  /** Measured [width, height, depth] of a loaded prototype, or null. */
  size(id: string): THREE.Vector3 | null {
    const p = this.protos.get(id);
    if (!p) return null;
    return new THREE.Box3().setFromObject(p).getSize(new THREE.Vector3());
  }

  /**
   * Returns a grounded clone positioned at (x,z). If `height` is given the
   * model is uniformly scaled to that height in meters; otherwise native scale
   * is kept. `yaw` rotates about Y. Returns null if the model wasn't loaded.
   */
  place(
    id: string,
    x: number,
    z: number,
    opts: { yaw?: number; height?: number; scale?: number } = {}
  ): THREE.Object3D | null {
    const proto = this.protos.get(id);
    if (!proto) return null;
    const obj = proto.clone(true);
    let s = opts.scale ?? 1;
    if (opts.height) {
      const nativeH = new THREE.Box3().setFromObject(proto).getSize(new THREE.Vector3()).y || 1;
      s = opts.height / nativeH;
    }
    obj.scale.setScalar(s);
    obj.rotation.y = opts.yaw ?? 0;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.set(x, -box.min.y, z); // drop onto the ground plane
    return obj;
  }
}
