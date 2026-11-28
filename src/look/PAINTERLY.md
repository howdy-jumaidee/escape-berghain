# Painterly surface shader

Disco Elysium-inspired pigment and dry brush for Escape Berghain. This is an original surface treatment, not a reproduction of its hand-painted backgrounds or portraits.

## Try it

Run `npm ci` and `npm run dev`.

- Game: `/?paint=1` (also enabled by default).
- Original materials: `/?paint=0`.
- Skip intro for comparison: `/?debug&skip&trip=0&paint=1` or `paint=0`.
- Your model: `/?viewer=MODEL_NAME&paint=1` (omit `.glb`).

`scene.ts` applies it to opaque Standard/Physical materials, including asynchronous model replacements. `viewer.ts` uses the same treatment. Character roots carry a painterlyRole metadata tag; imported npc_, crowd_ and horse_ models receive the same tag. No gameplay, shared contract, camera or trip-pipeline behavior changes.

## Art controls

Edit `PAINTERLY_DEFAULTS` in `painterly.ts`, or use a separate instance:

```ts
const paint = new PainterlyLook({ strength: 1, characterStrength: 0.86, pigment: 0.38 });
paint.apply(scene);
paint.set({ strength: 0 }); // live A/B; no shader recompile
paint.dispose(); // restore material hooks and release the atlas
```

| Control | Default | Effect |
| --- | ---: | --- |
| strength | 1 | Blend with the original rendering, 0–1 |
| characterStrength | 0.86 | Character multiplier; at full strength: 86% characters, 100% environment |
| brushScale | 1.25 | Repetitions per local-space unit; lower means bigger marks |
| pigment | 0.38 | Broad pigment variation and dry bristles |
| saturation | 0.78 | Muted base colours; lights keep their own colour |
| toneSteps | 7 | Soft light-value bands; lower means more graphic shading |
| edge | 0.22 | Broken dark accents on grazing surfaces |

Set `material.userData.painterly = false` before applying to opt a material out. Transparent materials, custom shader materials and unlit materials are excluded automatically. Emissive radiance remains outside the lighting quantisation.

## Implementation and limits

One deterministic 256×256 RGBA atlas (about 341 KiB including mipmaps), three triplanar texture reads, no extra draw calls or full-screen passes. Brush coordinates follow the mesh's rest-space position, so marks do not swim with camera movement or reset on skeletal animation. No UV unwrap required. Existing compile hooks are called first.

Object scale affects stroke size; separate meshes can have visible pattern changes at seams. Instanced copies share the same surface pattern. Mipmaps soften small strokes in the distance. The current game's 42% render scale and strong trip blur can hide fine brushwork: use the model viewer to inspect it clearly. This shader does not add an isometric camera, change the level, or supply painted assets.

The game scans materials every quarter-second for loaded assets. Newly inserted models may briefly show their original material before being treated. Do not share a material between two independent PainterlyLook instances; use a clone instead.

## Validation (28 November 2026)

- `npm run build`: content checks, strict TypeScript and Vite production build pass. Existing large-bundle warning remains.
- Headless Chromium / SwiftShader: 30-second movement test with camera switching, 35 compiled programs, zero failed programs and no captured JavaScript/shader errors.
- Separate render-target checks: strength 0 matches original pixels exactly; dispose restores original pixels exactly; emissive-only material remains pixel-identical. Full strength produces a measurable image difference.
- Standard, Physical and InstancedMesh shader paths compiled successfully; the GLB model viewer rendered `npc_riddle_horse` successfully.
- Inspected gameplay and model-viewer captures. Surface treatment is subtle under the existing strong grain/blur. Software rendering is not a representative GPU performance benchmark; a target-device visual playtest is still appropriate before merging.

Approved settings: environment 100%, characters 86%. The player, NPCs (including instanced crowds and DJs), patrols and named character models inherit character strength. Shared materials are isolated by role. Preview-only controls are not included in this branch.
