import * as THREE from 'three';

export type Role = 'asphalt' | 'paving' | 'brick' | 'plaster' | 'concrete' | 'bark';

// Used when a downloaded texture set is missing (fetch-assets failed/skipped).
const FALLBACK_COLOR: Record<Role, number> = {
  asphalt: 0x393735,
  paving: 0x877e72,
  brick: 0x8a5440,
  plaster: 0xcfc4ae,
  concrete: 0x9a948c,
  bark: 0x6b5a4a,
};

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture | null>>();

function load(url: string): Promise<THREE.Texture | null> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).catch(() => null);
    cache.set(url, p);
  }
  return p;
}

/**
 * Builds MeshStandardMaterials from the CC0 texture sets downloaded by
 * scripts/fetch-assets.mjs, falling back to flat colors when absent.
 */
export class MaterialLib {
  private aniso: number;

  constructor(renderer: THREE.WebGLRenderer) {
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  async pbr(
    role: Role,
    repeatX = 1,
    repeatY = 1,
    opts: { roughness?: number; tint?: number; normalScale?: number } = {}
  ): Promise<THREE.MeshStandardMaterial> {
    const base = `/assets/textures/${role}`;
    const [color, normal, rough, ao] = await Promise.all([
      load(`${base}/color.jpg`),
      load(`${base}/normal.jpg`),
      load(`${base}/roughness.jpg`),
      load(`${base}/ao.jpg`),
    ]);

    const mat = new THREE.MeshStandardMaterial({
      color: color ? (opts.tint ?? 0xffffff) : FALLBACK_COLOR[role],
      roughness: opts.roughness ?? 1,
    });

    const prep = (t: THREE.Texture, srgb: boolean) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repeatX, repeatY);
      c.anisotropy = this.aniso;
      if (srgb) c.colorSpace = THREE.SRGBColorSpace;
      c.needsUpdate = true;
      return c;
    };

    if (color) mat.map = prep(color, true);
    if (normal) {
      mat.normalMap = prep(normal, false);
      const ns = opts.normalScale ?? 0.8;
      mat.normalScale.set(ns, ns);
    }
    if (rough) mat.roughnessMap = prep(rough, false);
    if (ao) {
      mat.aoMap = prep(ao, false);
      mat.aoMapIntensity = 0.9;
    }
    return mat;
  }
}
