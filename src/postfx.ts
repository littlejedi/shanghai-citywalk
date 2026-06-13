import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

/**
 * HDR pipeline: render → N8AO ambient occlusion → bloom (lit windows, signs,
 * streetlights) → ACES filmic tone mapping → SMAA.
 */
export function createComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): EffectComposer {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  const n8ao = new N8AOPostPass(scene, camera, window.innerWidth, window.innerHeight);
  n8ao.configuration.aoRadius = 2.0;
  n8ao.configuration.intensity = 2.5;
  n8ao.configuration.distanceFalloff = 1.0;
  n8ao.setQualityMode('Medium');
  composer.addPass(n8ao);

  const bloom = new BloomEffect({
    intensity: 0.35,
    luminanceThreshold: 1.6,
    luminanceSmoothing: 0.3,
    mipmapBlur: true,
    radius: 0.6,
  });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.32 });
  composer.addPass(new EffectPass(camera, bloom, tone, vignette, new SMAAEffect()));
  return composer;
}
