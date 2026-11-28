// Look: lights, fog, volumetric daylight shafts and industrial dust haze. Owned by Emma.
// World coordinates: CELL = 6, CEILING = 19, FLOOR_HEIGHT = 9. Main hall spans x = 6..66, z = 6..54.
import * as THREE from 'three';
import { CELL, CEILING } from '../contracts';

/** Positions laid out for 4 m cells; S scales them to the current cell size (1.5 for CELL = 6). */
const S = CELL / 4;

const DUST_COUNT = 450;
const DUST_BOUNDS = {
  minX: 8,
  maxX: 64,
  minY: 0.5,
  maxY: 17.5,
  minZ: 8,
  maxZ: 52,
};

export interface Look {
  scene: THREE.Scene;
  /** Flash on the beat. */
  strobes: THREE.PointLight[];
  /** Toilet corridor tube light. Flickers. */
  flicker: THREE.PointLight;
  /** Lasers from the DJ booth. game-boot sweeps them on the beat. */
  lasers: THREE.Group;
  /** House lights: off all night, on at closing time. */
  house: THREE.HemisphereLight;
  /** Per-frame atmosphere animation (floating dust motes and daylight shaft shimmer). */
  update(dt: number): void;
}

/** Deterministic PRNG so dust mote layout is balanced and reproducible. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Soft cloudy smoke puff texture for Berghain fog-machine haze plumes. */
function makeSmokeTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    // Layer offset soft radial blobs so each cloud reads as organic club smoke, not a uniform circle.
    const puffs: [number, number, number, number][] = [
      [64, 64, 58, 0.42],
      [48, 54, 42, 0.28],
      [82, 60, 44, 0.26],
      [58, 78, 40, 0.24],
      [74, 46, 36, 0.2],
    ];
    for (const [cx, cy, r, a] of puffs) {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0.0, `rgba(185, 200, 224, ${a})`);
      grad.addColorStop(0.5, `rgba(140, 156, 185, ${a * 0.45})`);
      grad.addColorStop(1.0, 'rgba(90, 105, 130, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial dot texture for floating industrial dust motes. */
function makeDustTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.28, 'rgba(235, 244, 255, 0.72)');
    grad.addColorStop(0.62, 'rgba(200, 218, 240, 0.18)');
    grad.addColorStop(1.0, 'rgba(180, 200, 225, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Volumetric shaft alpha/streak texture.
 * Canvas y = 0 maps to v = 1 (window top, y = 14 m); canvas y = height maps to v = 0 (concrete floor, y = 0).
 */
function makeShaftTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      // t = 0 at top (window), t = 1 at bottom (floor)
      const t = y / (h - 1);
      // Soft feather at the top rim, peak intensity just below window, smooth falloff to the floor.
      const topFade = Math.min(1, t / 0.09);
      const bottomFade = Math.pow(1 - t, 1.55);
      const vertical = topFade * bottomFade;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        // Subtle vertical light-ray ribs mimicking glass-block mullions.
        const streaks =
          0.74 +
          0.14 * Math.sin(u * Math.PI * 10) +
          0.08 * Math.sin(u * Math.PI * 22 + 1.3) +
          0.04 * Math.cos(u * Math.PI * 34);
        const alpha = Math.max(0, Math.min(1, vertical * streaks));
        const idx = (y * w + x) * 4;
        data[idx] = 216;
        data[idx + 1] = 230;
        data[idx + 2] = 248;
        data[idx + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Build an angled volumetric light cone from window origin (`top`) down to floor landing (`bottom`). */
function createLightShaft(
  top: THREE.Vector3,
  bottom: THREE.Vector3,
  topRadius: number,
  bottomRadius: number,
  material: THREE.MeshBasicMaterial,
): THREE.Mesh {
  const upVec = new THREE.Vector3().subVectors(top, bottom);
  const length = upVec.length();
  const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, length, 20, 1, true);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.addVectors(top, bottom).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upVec.normalize());
  mesh.renderOrder = 2;
  return mesh;
}

export function buildScene(): Look {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020305);
  // Thick, dark Berghain smoke haze: distant concrete and pillars dissolve into heavy gloom.
  scene.fog = new THREE.FogExp2(0x04060a, 0.034); // darker and thicker: harder to read the hall

  // Very low brutalist base fill so shadows stay deep while close silhouettes and textures still read.
  scene.add(new THREE.AmbientLight(0x131722, 0.1));
  scene.add(new THREE.HemisphereLight(0x2a364c, 0x050608, 0.2));

  // Faint 06:12 Berlin pre-dawn seepage from the high north-west glass blocks.
  const nwDaylight = new THREE.DirectionalLight(0x7c98be, 0.18);
  nwDaylight.position.set(-24, 32, -20);
  nwDaylight.target.position.set(36, 4, 30);
  scene.add(nwDaylight, nwDaylight.target);

  // Dim upward cool bounce so 19 m coal hoppers and flared concrete capitals loom out of the smoke.
  const ceilingBounce = new THREE.DirectionalLight(0x30425c, 0.12);
  ceilingBounce.position.set(36, -6, 36);
  ceilingBounce.target.position.set(36, CEILING, 26);
  scene.add(ceilingBounce, ceilingBounce.target);

  // Subtle cold spotlights raking down from the high window bays through the dark haze.
  const westWindowSpot = new THREE.SpotLight(0xa8c4e8, 480, 95, Math.PI / 5.4, 0.72, 1.6);
  westWindowSpot.position.set(7.2, 15.5, 32);
  westWindowSpot.target.position.set(30, 0, 34);
  scene.add(westWindowSpot, westWindowSpot.target);

  const northWindowSpot = new THREE.SpotLight(0x9cb8df, 420, 90, Math.PI / 5.4, 0.72, 1.6);
  northWindowSpot.position.set(28, 15.5, 7.2);
  northWindowSpot.target.position.set(34, 0, 30);
  scene.add(northWindowSpot, northWindowSpot.target);

  // Dim architectural uplights grazing the 9 m catwalk underside and 19 m coal hoppers.
  const uplightWest = new THREE.SpotLight(0x6480aa, 300, 56, Math.PI / 2.5, 0.88, 1.5);
  uplightWest.position.set(21, 5.2, 27);
  uplightWest.target.position.set(24, CEILING, 24);
  scene.add(uplightWest, uplightWest.target);

  const uplightEast = new THREE.SpotLight(0x5a749e, 300, 56, Math.PI / 2.5, 0.88, 1.5);
  uplightEast.position.set(45, 5.2, 33);
  uplightEast.target.position.set(42, CEILING, 30);
  scene.add(uplightEast, uplightEast.target);

  // Red and deep-violet strobes near the DJ booth (pulsed hard on the beat by game-boot).
  const strobes = [0xff1744, 0x8e24ff].map((c, i) => {
    const l = new THREE.PointLight(c, 640, 78, 1.55);
    l.position.set((i === 0 ? 15 : 31) * S, 10.5, 11.5 * S);
    scene.add(l);
    return l;
  });

  // Bar: smoky dirty amber.
  const bar = new THREE.PointLight(0xff7e2e, 380, 40, 1.6);
  bar.position.set(54 * S, 4.5, 9 * S);
  scene.add(bar);

  // Toilet corridor: sick green fluorescent flicker (intensity driven by game-boot).
  const flicker = new THREE.PointLight(0x9affbe, 240, 34, 1.5);
  flicker.position.set(54 * S, 3.6, 28 * S);
  scene.add(flicker);

  // Panorama Bar: hazy rose-magenta.
  const pano = new THREE.PointLight(0xff3e92, 520, 54, 1.6);
  pano.position.set(22 * S, 5.5, 43 * S);
  scene.add(pano);

  // Back exit: green exit sign, morning light leaking under the door.
  const exit = new THREE.PointLight(0x22ff66, 300, 32, 1.55);
  exit.position.set(62 * S, 3.4, 46 * S);
  scene.add(exit);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.4, 0.08),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.35, 0.45), toneMapped: false }),
  );
  sign.position.set(62 * S, 3.2, 47.8 * S);
  scene.add(sign);
  const morning = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.8),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.25, 1.12, 0.88),
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  morning.rotation.x = -Math.PI / 2;
  morning.position.set(62 * S, 0.02, 47.4 * S);
  scene.add(morning);

  // Volumetric daylight shafts pouring at an angle from tall north & west windows (y = 14 m -> floor y = 0).
  const shaftTex = makeShaftTexture();
  const northShaftMat = new THREE.MeshBasicMaterial({
    map: shaftTex,
    color: 0xcfe0f8,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const westShaftMat = new THREE.MeshBasicMaterial({
    map: shaftTex,
    color: 0xd4e4fc,
    transparent: true,
    opacity: 0.085,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // North wall tall window bays (z = 6.3, y = 14 m angling south into main_hall).
  const northShafts: [number, number, number, number][] = [
    [13.5, 15.5, 1.5, 5.2],
    [27.0, 29.5, 1.8, 5.8],
    [40.0, 42.0, 1.8, 5.8],
    [54.0, 55.5, 1.5, 5.2],
  ];
  for (const [topX, botX, topR, botR] of northShafts) {
    scene.add(
      createLightShaft(
        new THREE.Vector3(topX, 14, 6.3),
        new THREE.Vector3(botX, 0, 21.5),
        topR,
        botR,
        northShaftMat,
      ),
    );
  }

  // West wall tall window bays (x = 6.3, y = 14 m angling east over the west 9 m gallery down to the floor).
  const westShafts: [number, number, number, number][] = [
    [17.0, 20.0, 1.6, 5.4],
    [31.0, 34.0, 1.9, 6.0],
    [44.0, 46.5, 1.6, 5.4],
  ];
  for (const [topZ, botZ, topR, botR] of westShafts) {
    scene.add(
      createLightShaft(
        new THREE.Vector3(6.3, 14, topZ),
        new THREE.Vector3(23.0, 0, botZ),
        topR,
        botR,
        westShaftMat,
      ),
    );
  }

  // Club haze cones from the DJ booth rig slicing through the smoke (red and deep violet).
  const clubBeamRed = new THREE.MeshBasicMaterial({
    map: shaftTex,
    color: 0xff224e,
    transparent: true,
    opacity: 0.075,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const clubBeamViolet = new THREE.MeshBasicMaterial({
    map: shaftTex,
    color: 0x8e38ff,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  scene.add(
    createLightShaft(new THREE.Vector3(24, 13.5, 11), new THREE.Vector3(18, 0, 30), 0.7, 5.2, clubBeamRed),
    createLightShaft(new THREE.Vector3(42, 13.5, 11), new THREE.Vector3(48, 0, 32), 0.7, 5.4, clubBeamViolet),
    createLightShaft(new THREE.Vector3(33, 14.5, 10), new THREE.Vector3(33, 0, 38), 0.85, 6.2, clubBeamRed),
  );

  // Berghain fog-machine smoke clouds rolling lazily across the dance floor and upper galleries.
  const smokeTex = makeSmokeTexture();
  const smokeRng = makeRng(47013);
  interface SmokePlume {
    sprite: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    baseX: number;
    baseY: number;
    baseZ: number;
    driftX: number;
    driftZ: number;
    phase: number;
    baseOpacity: number;
  }
  const smokePlumes: SmokePlume[] = [];
  const smokeTints = [0x1c2230, 0x261a2c, 0x2a1822, 0x1a202c];
  for (let i = 0; i < 46; i++) {
    const isMain = i < 28;
    const bx = isMain ? 10 + smokeRng() * 52 : 12 + smokeRng() * 76;
    const bz = isMain ? 10 + smokeRng() * 40 : 12 + smokeRng() * 58;
    const by = i % 5 === 0 ? 9.5 + smokeRng() * 3.5 : 1.5 + smokeRng() * 4.2;
    const baseOpacity = 0.13 + smokeRng() * 0.12;
    const mat = new THREE.SpriteMaterial({
      map: smokeTex,
      color: smokeTints[i % smokeTints.length],
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: true,
    });
    const sprite = new THREE.Sprite(mat);
    const scale = 13 + smokeRng() * 13;
    sprite.scale.set(scale * 1.45, scale * 0.75, 1);
    sprite.position.set(bx, by, bz);
    sprite.renderOrder = 1;
    scene.add(sprite);
    smokePlumes.push({
      sprite,
      mat,
      baseX: bx,
      baseY: by,
      baseZ: bz,
      driftX: 0.45 + smokeRng() * 0.9,
      driftZ: 0.35 + smokeRng() * 0.75,
      phase: smokeRng() * Math.PI * 2,
      baseOpacity,
    });
  }

  // Floating industrial dust motes drifting through the main hall haze and daylight beams.
  const rng = makeRng(13209);
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustColors = new Float32Array(DUST_COUNT * 3);
  const dustVel = new Float32Array(DUST_COUNT * 3);
  const dustPhase = new Float32Array(DUST_COUNT);

  const spanX = DUST_BOUNDS.maxX - DUST_BOUNDS.minX;
  const spanY = DUST_BOUNDS.maxY - DUST_BOUNDS.minY;
  const spanZ = DUST_BOUNDS.maxZ - DUST_BOUNDS.minZ;

  for (let i = 0; i < DUST_COUNT; i++) {
    const x = DUST_BOUNDS.minX + rng() * spanX;
    const y = DUST_BOUNDS.minY + rng() * spanY;
    const z = DUST_BOUNDS.minZ + rng() * spanZ;
    dustPositions[i * 3] = x;
    dustPositions[i * 3 + 1] = y;
    dustPositions[i * 3 + 2] = z;

    // Gentle upward thermal + cross-hall industrial draft.
    dustVel[i * 3] = (rng() - 0.35) * 0.18;
    dustVel[i * 3 + 1] = 0.04 + rng() * 0.11;
    dustVel[i * 3 + 2] = (rng() - 0.4) * 0.16;
    dustPhase[i] = rng() * Math.PI * 2;

    // Motes closer to the north/west daylight shafts catch brighter cool silver light.
    const inBeam = x < 26 || z < 23 ? 1 : 0;
    const lum = (inBeam ? 0.62 : 0.35) + rng() * 0.38;
    dustColors[i * 3] = lum * 0.88;
    dustColors[i * 3 + 1] = lum * 0.94;
    dustColors[i * 3 + 2] = lum;
  }

  const dustGeo = new THREE.BufferGeometry();
  const dustPosAttr = new THREE.BufferAttribute(dustPositions, 3);
  dustGeo.setAttribute('position', dustPosAttr);
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));

  const dustMat = new THREE.PointsMaterial({
    map: makeDustTexture(),
    size: 0.24,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  dustPoints.renderOrder = 3;
  scene.add(dustPoints);

  // Lasers fanning out from the DJ booth (swept by game-boot).
  const lasers = new THREE.Group();
  lasers.position.set(22 * S, 4.2, 7 * S);
  const laserMats = [new THREE.Color(0.25, 1.35, 0.5), new THREE.Color(1.4, 0.14, 0.32)].map(
    (c) =>
      new THREE.MeshBasicMaterial({
        color: c,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
  );
  for (let i = 0; i < 8; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 62), laserMats[i % 2]);
    beam.geometry.translate(0, 0, 31);
    beam.rotation.y = (i / 7 - 0.5) * 1.6;
    beam.rotation.x = 0.1;
    lasers.add(beam);
  }
  scene.add(lasers);

  const house = new THREE.HemisphereLight(0xfff4e0, 0x403830, 0);
  scene.add(house);

  let elapsed = 0;
  function update(dt: number): void {
    elapsed += dt;

    // Subtle pre-dawn seepage drift and pulsing club haze beams.
    northShaftMat.opacity = 0.055 + Math.sin(elapsed * 0.35) * 0.01;
    westShaftMat.opacity = 0.06 + Math.cos(elapsed * 0.28 + 1.1) * 0.01;
    clubBeamRed.opacity = 0.062 + Math.sin(elapsed * 1.9) * 0.022;
    clubBeamViolet.opacity = 0.058 + Math.cos(elapsed * 1.5 + 0.8) * 0.02;

    // Billow fog-machine smoke clouds lazily across the floor.
    for (const s of smokePlumes) {
      s.sprite.position.x = s.baseX + Math.sin(elapsed * 0.16 + s.phase) * s.driftX * 3.2;
      s.sprite.position.z = s.baseZ + Math.cos(elapsed * 0.13 + s.phase * 1.3) * s.driftZ * 2.8;
      s.sprite.position.y = s.baseY + Math.sin(elapsed * 0.22 + s.phase) * 0.35;
      s.mat.opacity = s.baseOpacity * (0.78 + 0.22 * Math.sin(elapsed * 0.35 + s.phase));
    }

    // Drift industrial dust motes lazily through the hall volume.
    for (let i = 0; i < DUST_COUNT; i++) {
      const i3 = i * 3;
      const p = dustPhase[i];
      let x = dustPositions[i3] + (dustVel[i3] + Math.sin(elapsed * 0.42 + p) * 0.09) * dt;
      let y = dustPositions[i3 + 1] + (dustVel[i3 + 1] + Math.cos(elapsed * 0.31 + p * 1.3) * 0.04) * dt;
      let z = dustPositions[i3 + 2] + (dustVel[i3 + 2] + Math.cos(elapsed * 0.37 + p * 0.7) * 0.09) * dt;

      if (x < DUST_BOUNDS.minX) x += spanX;
      else if (x > DUST_BOUNDS.maxX) x -= spanX;
      if (y < DUST_BOUNDS.minY) y += spanY;
      else if (y > DUST_BOUNDS.maxY) y -= spanY;
      if (z < DUST_BOUNDS.minZ) z += spanZ;
      else if (z > DUST_BOUNDS.maxZ) z -= spanZ;

      dustPositions[i3] = x;
      dustPositions[i3 + 1] = y;
      dustPositions[i3 + 2] = z;
    }
    dustPosAttr.needsUpdate = true;
  }

  return { scene, strobes, flicker, lasers, house, update };
}
