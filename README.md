# shanghai-citywalk · 武康路

A first-person dusk walk through the blocks around **Wukang Road** in Shanghai's
former French Concession — the wedge-shaped Wukang Mansion (武康大楼), plane-tree
lined streets, garden houses, shopfronts and the Huaihai Rd intersection.

Browser-based MVP built with **Three.js + TypeScript + Vite**, set on a
partly-cloudy daytime. Art is either generated procedurally (facades with
normal-mapped window depth, signs and road markings drawn to canvas at runtime;
plane trees with alpha leaf-cards; vehicles and pedestrians) or fetched from
keyless CC0 libraries (Poly Haven daytime HDRI + GLTF street props such as
benches, fire hydrants, planters, café sets; ambientCG PBR textures).
Rendering uses an HDR pipeline with N8AO ambient occlusion, bloom, ACES tone
mapping and a subtle vignette.

## Run it

```sh
npm install
npm run fetch-assets   # downloads CC0 HDRI + PBR textures + GLTF props into public/assets/
npm run dev            # open http://localhost:5173
```

Without `fetch-assets` the game still runs, falling back to flat-color
materials and procedural props.

**Controls:** WASD / arrows to walk, mouse to look, Shift to stride, Esc to pause, F for fps.

## Scripts

- `npm run dev` — dev server
- `npm run build` — typecheck + production bundle
- `npm run preview` — serve the production bundle
- `npm run fetch-assets` — (re)download CC0 assets
- `node scripts/screenshot.mjs` — headless smoke test: renders several viewpoints
  to `/tmp/citywalk-*.png` and reports console errors (needs a Playwright
  chromium in the local cache)

## Layout

- `src/world/layout.ts` — data-driven map: streets, lots, trees, lamps, signs
- `src/world/` — streets, parametric buildings, the Wukang Mansion, trees, props
- `src/textures/` — canvas-drawn facades/signs + CC0 PBR material loader
- `src/player/` — pointer-lock FPS controls and capsule-vs-AABB collision
- `src/postfx.ts` — N8AO → bloom → ACES → SMAA composer
