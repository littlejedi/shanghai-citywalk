import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { Colliders } from './player/Collision';
import { PlayerControls } from './player/Controls';
import { MaterialLib } from './textures/materials';
import { createComposer } from './postfx';
import { buildStreets } from './world/Streets';
import { buildMansion } from './world/WukangMansion';
import { buildBuildings } from './world/Buildings';
import { plantTrees } from './world/Trees';
import { buildProps } from './world/Props';
import { buildVehicles } from './world/Vehicles';
import { buildPedestrians } from './world/Pedestrians';
import { ModelLib } from './world/Models';
import { makeLots, makeTrees, SPAWN } from './world/layout';

const app = document.getElementById('app')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;
const loadMsg = document.getElementById('loadmsg')!;
const fpsDiv = document.getElementById('fps')!;

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
  stencil: false,
  depth: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the composer
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// light, slightly hazy daytime air (matches the partly-cloudy reference photos)
scene.fog = new THREE.FogExp2(0xc7cbce, 0.0042);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 900);
camera.rotation.order = 'YXZ';
camera.position.set(SPAWN.x, 1.7, SPAWN.z);
camera.rotation.y = SPAWN.yaw;

// midday sun, high and slightly warm
const sun = new THREE.DirectionalLight(0xfff4e2, 2.8);
sun.position.set(-70, 120, 60);
sun.target.position.set(10, 0, -40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -190;
sun.shadow.camera.right = 190;
sun.shadow.camera.top = 190;
sun.shadow.camera.bottom = -190;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 450;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.5;
scene.add(sun, sun.target);

// cool sky fill; mostly superseded once the HDRI environment loads
const hemi = new THREE.HemisphereLight(0xa9c4dc, 0x6b6155, 0.6);
scene.add(hemi);

const colliders = new Colliders();
const controls = new PlayerControls(camera, renderer.domElement, colliders);

async function loadSky(): Promise<void> {
  try {
    const tex = await new RGBELoader().loadAsync('/assets/hdri/day.hdr');
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    scene.environment = env;
    scene.environmentIntensity = 1.0;
    scene.background = tex;
    scene.backgroundIntensity = 1.0;
    hemi.intensity = 0.25;
  } catch {
    // no HDRI downloaded — plain daytime sky fallback
    scene.background = new THREE.Color(0xb9cdd8);
    hemi.intensity = 1.2;
    sun.intensity = 3.4;
  }
}

async function init(): Promise<void> {
  const lib = new MaterialLib(renderer);
  const models = new ModelLib();
  // (street_lamp_01 / modular_electricity_poles are fetched but unused — the
  // former is a wall bracket, so lamps and poles are procedural instead.)
  const MODEL_IDS = [
    'painted_wooden_bench',
    'fire_hydrant',
    'planter_box_01',
    'outdoor_table_chair_set_01',
    'calathea_orbifolia_01',
    'CoffeeCart_01',
  ];
  await Promise.all([
    loadSky(),
    buildStreets(scene, lib, colliders),
    plantTrees(scene, makeTrees(), lib, colliders),
    ...MODEL_IDS.map((id) => models.load(id)),
  ]);
  buildMansion(scene, colliders);
  buildBuildings(scene, makeLots(), colliders);
  buildProps(scene, colliders, models);
  buildVehicles(scene, colliders, models);
  const updatePedestrians = buildPedestrians(scene);

  // Daytime grade: the facade/sign emissive maps were authored to glow at
  // dusk. In daylight lit windows should read as dark glass, so damp the
  // self-illumination scene-wide (kept slightly >0 so a few interiors hint).
  scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material;
    const damp = (m: THREE.Material) => {
      const sm = m as THREE.MeshStandardMaterial;
      if (sm && sm.emissiveMap && sm.emissiveIntensity > 0.3) sm.emissiveIntensity *= 0.22;
    };
    if (Array.isArray(mat)) mat.forEach(damp);
    else if (mat) damp(mat);
  });

  const composer = createComposer(renderer, scene, camera);

  startBtn.disabled = false;
  startBtn.textContent = '开始漫步 · Start walking';
  startBtn.addEventListener('click', () => controls.lock());
  controls.plc.addEventListener('lock', () => overlay.classList.add('hidden'));
  controls.plc.addEventListener('unlock', () => {
    overlay.classList.remove('hidden');
    startBtn.textContent = '继续漫步 · Resume';
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    composer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') {
      fpsDiv.style.display = fpsDiv.style.display === 'block' ? 'none' : 'block';
    }
  });

  // camera teleport hook for the headless screenshot script
  (window as unknown as Record<string, unknown>).__setCam = (
    x: number,
    z: number,
    yaw: number,
    pitch: number
  ) => {
    camera.position.set(x, 1.7, z);
    camera.rotation.set(pitch, yaw, 0); // positive pitch looks up
  };

  const clock = new THREE.Clock();
  let frames = 0;
  let fpsTimer = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    controls.update(dt);
    updatePedestrians(dt);
    scene.userData.updateVehicles?.(dt);
    composer.render(dt);
    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      fpsDiv.textContent = `${Math.round(frames / fpsTimer)} fps`;
      frames = 0;
      fpsTimer = 0;
    }
  });
}

init().catch((err) => {
  loadMsg.textContent = `加载失败 Load failed: ${err?.message ?? err}`;
  console.error(err);
});
