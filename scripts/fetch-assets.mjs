#!/usr/bin/env node
// Fetches CC0 art assets used by the game:
//   - 1 dusk HDRI sky from Poly Haven  (keyless API: api.polyhaven.com)
//   - PBR texture sets from ambientCG  (keyless API: ambientcg.com/api/v2)
// Safe to re-run; already-downloaded assets are skipped. If a download fails,
// the game falls back to flat-color materials for that surface.
import { mkdir, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public', 'assets');
const HEADERS = { 'User-Agent': 'shanghai-citywalk/0.1 (CC0 asset fetch script)' };

// Per surface role, candidate ambientCG asset IDs tried in order.
const MATERIALS = [
  { role: 'asphalt', candidates: ['Asphalt025', 'Asphalt026B', 'Asphalt012', 'Asphalt010'] },
  { role: 'paving', candidates: ['PavingStones138', 'PavingStones128', 'PavingStones070', 'PavingStones037'] },
  { role: 'brick', candidates: ['Bricks066', 'Bricks059', 'Bricks051', 'Bricks023'] },
  { role: 'plaster', candidates: ['Plaster003', 'Plaster001', 'Plaster004'] },
  { role: 'concrete', candidates: ['Concrete034', 'Concrete016', 'Concrete036'] },
  { role: 'bark', candidates: ['Bark012', 'Bark007', 'Bark006'] },
];

// Dusk / golden-hour skies, tried in order.
// Daytime partly-cloudy skies, tried in order (matches the daytime reference photos).
const HDRI_CANDIDATES = [
  'kloofendal_48d_partly_cloudy_puresky',
  'qwantani_puresky',
  'kloppenheim_06_puresky',
  'wasteland_clouds_puresky',
];

// CC0 photoscanned street props from Poly Haven (downloaded as gltf + textures).
const MODELS = [
  'street_lamp_01',
  'modular_electricity_poles',
  'painted_wooden_bench',
  'fire_hydrant',
  'planter_box_01',
  'outdoor_table_chair_set_01',
  'calathea_orbifolia_01',
  'CoffeeCart_01',
];

async function getJSON(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function download(url, dest) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

async function fetchMaterial({ role, candidates }) {
  const dir = path.join(OUT, 'textures', role);
  if (existsSync(path.join(dir, 'color.jpg'))) {
    console.log(`= ${role}: already present, skipping`);
    return true;
  }
  for (const id of candidates) {
    try {
      const data = await getJSON(
        `https://ambientcg.com/api/v2/full_json?id=${id}&include=downloadData`
      );
      const asset = data.foundAssets?.[0];
      const zips =
        asset?.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads ?? [];
      const dl =
        zips.find((d) => d.attribute === '2K-JPG') ??
        zips.find((d) => d.attribute === '1K-JPG');
      if (!dl) continue;

      await mkdir(dir, { recursive: true });
      const zipPath = path.join(dir, '_dl.zip');
      await download(dl.downloadLink, zipPath);
      const tmp = path.join(dir, '_unzip');
      execFileSync('unzip', ['-o', '-q', zipPath, '-d', tmp]);

      const files = await readdir(tmp);
      const wanted = { Color: 'color', NormalGL: 'normal', Roughness: 'roughness', AmbientOcclusion: 'ao' };
      for (const [suffix, name] of Object.entries(wanted)) {
        const f = files.find((f) => f.includes(`_${suffix}.`));
        if (f) await copyFile(path.join(tmp, f), path.join(dir, `${name}.jpg`));
      }
      await rm(zipPath);
      await rm(tmp, { recursive: true });
      console.log(`+ ${role}: ambientCG ${id}`);
      return true;
    } catch (e) {
      console.warn(`  ${role}: candidate ${id} failed (${e.message})`);
    }
  }
  console.warn(`! ${role}: all candidates failed — flat-color fallback will be used`);
  return false;
}

async function fetchHDRI() {
  const dir = path.join(OUT, 'hdri');
  const dest = path.join(dir, 'day.hdr');
  if (existsSync(dest)) {
    console.log('= hdri: already present, skipping');
    return true;
  }
  for (const id of HDRI_CANDIDATES) {
    try {
      const files = await getJSON(`https://api.polyhaven.com/files/${id}`);
      const url = files?.hdri?.['2k']?.hdr?.url;
      if (!url) continue;
      await mkdir(dir, { recursive: true });
      await download(url, dest);
      console.log(`+ hdri: Poly Haven ${id}`);
      return true;
    } catch (e) {
      console.warn(`  hdri: candidate ${id} failed (${e.message})`);
    }
  }
  console.warn('! hdri: all candidates failed — gradient sky fallback will be used');
  return false;
}

// Downloads a Poly Haven model's gltf plus every file in its include map,
// preserving the relative paths the .gltf references (textures/…, .bin).
async function fetchModel(id, res = '2k') {
  const dir = path.join(OUT, 'models', id);
  const marker = path.join(dir, '.ok');
  if (existsSync(marker)) {
    console.log(`= model ${id}: already present, skipping`);
    return true;
  }
  try {
    const files = await getJSON(`https://api.polyhaven.com/files/${id}`);
    const gltfRes = files?.gltf?.[res]?.gltf ?? files?.gltf?.['1k']?.gltf;
    if (!gltfRes?.url) throw new Error('no gltf url');
    await mkdir(path.join(dir, 'textures'), { recursive: true });
    const mainName = path.basename(new URL(gltfRes.url).pathname);
    await download(gltfRes.url, path.join(dir, mainName));
    for (const [rel, info] of Object.entries(gltfRes.include ?? {})) {
      const dest = path.join(dir, rel);
      await mkdir(path.dirname(dest), { recursive: true });
      await download(info.url, dest);
    }
    await writeFile(marker, mainName);
    console.log(`+ model ${id}: ${mainName} (+${Object.keys(gltfRes.include ?? {}).length} files)`);
    return true;
  } catch (e) {
    console.warn(`! model ${id}: failed (${e.message}) — procedural fallback will be used`);
    return false;
  }
}

console.log('Fetching CC0 assets into public/assets/ …');
let ok = 0;
let total = 0;
total++; if (await fetchHDRI()) ok++;
for (const m of MATERIALS) {
  total++;
  if (await fetchMaterial(m)) ok++;
}
for (const id of MODELS) {
  total++;
  if (await fetchModel(id)) ok++;
}
console.log(`Done: ${ok}/${total} asset groups available.`);
