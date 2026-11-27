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
  scene.background = new THREE.Color(0x06070a);
  // Cold industrial Kraftwerk haze: deep enough for monumental scale, clear enough to read 19 m hoppers.
  scene.fog = new THREE.FogExp2(0x0c0f15, 0.0108);

  // Tight brutalist base fill so recessed concrete stays stark while upper structure remains readable.
  scene.add(new THREE.AmbientLight(0x242a34, 0.9));
  scene.add(new THREE.HemisphereLight(0x556880, 0x0e0f12, 1.15));

  // Angled cool overcast daylight pouring from high north-west glass-block windows across the hall.
  const nwDaylight = new THREE.DirectionalLight(0xc8daf0, 1.35);
  nwDaylight.position.set(-24, 32, -20);
  nwDaylight.target.position.set(36, 4, 30);
  scene.add(nwDaylight, nwDaylight.target);

  // Soft upward cool bounce so 19 m concrete ceiling slab, coal hoppers, and flared capitals read in haze.
  const ceilingBounce = new THREE.DirectionalLight(0x6e86a6, 0.55);
  ceilingBounce.position.set(36, -6, 36);
  ceilingBounce.target.position.set(36, CEILING, 26);
  scene.add(ceilingBounce, ceilingBounce.target);

  // Two cold daylight spotlights raking diagonally from the west and north window banks across galleries and floor.
  const westWindowSpot = new THREE.SpotLight(0xdce8ff, 3400, 95, Math.PI / 5.2, 0.65, 1.6);
  westWindowSpot.position.set(7.2, 15.5, 32);
  westWindowSpot.target.position.set(30, 0, 34);
  scene.add(westWindowSpot, westWindowSpot.target);

  const northWindowSpot = new THREE.SpotLight(0xd4e2f8, 3000, 90, Math.PI / 5.2, 0.65, 1.6);
  northWindowSpot.position.set(28, 15.5, 7.2);
  northWindowSpot.target.position.set(34, 0, 30);
  scene.add(northWindowSpot, northWindowSpot.target);

  // Architectural uplights grazing the flared pillar capitals, 9 m steel catwalk underside, and 19 m coal hoppers.
  const uplightWest = new THREE.SpotLight(0x8aa8ce, 1650, 56, Math.PI / 2.5, 0.85, 1.5);
  uplightWest.position.set(21, 5.2, 27);
  uplightWest.target.position.set(24, CEILING, 24);
  scene.add(uplightWest, uplightWest.target);

  const uplightEast = new THREE.SpotLight(0x7c98be, 1650, 56, Math.PI / 2.5, 0.85, 1.5);
  uplightEast.position.set(45, 5.2, 33);
  uplightEast.target.position.set(42, CEILING, 30);
  scene.add(uplightEast, uplightEast.target);

  // Red and purple strobes near the DJ booth (intensities pulsed on beat by game-boot).
  const strobes = [0xff1744, 0x9c27ff].map((c, i) => {
    const l = new THREE.PointLight(c, 700, 74, 1.6);
    l.position.set((i === 0 ? 15 : 31) * S, 10.5, 11.5 * S);
    scene.add(l);
    return l;
  });

  // Bar: dirty amber.
  const bar = new THREE.PointLight(0xff8a3c, 520, 38, 1.65);
  bar.position.set(54 * S, 4.5, 9 * S);
  scene.add(bar);

  // Toilet corridor: sick green fluorescent flicker (intensity driven by game-boot).
  const flicker = new THREE.PointLight(0xaaffc8, 340, 34, 1.5);
  flicker.position.set(54 * S, 3.6, 28 * S);
  scene.add(flicker);

  // Panorama Bar: warmer, pinker.
  const pano = new THREE.PointLight(0xff4fa0, 820, 56, 1.6);
  pano.position.set(22 * S, 5.5, 43 * S);
  scene.add(pano);

  // Back exit: green exit sign, morning light leaking under the door.
  const exit = new THREE.PointLight(0x22ff66, 360, 30, 1.6);
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
    opacity: 0.13,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const westShaftMat = new THREE.MeshBasicMaterial({
    map: shaftTex,
    color: 0xd4e4fc,
    transparent: true,
    opacity: 0.14,
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
    opacity: 0.56,
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

    // Gentle overcast cloud drift on the daylight shafts.
    northShaftMat.opacity = 0.125 + Math.sin(elapsed * 0.35) * 0.014;
    westShaftMat.opacity = 0.135 + Math.cos(elapsed * 0.28 + 1.1) * 0.014;

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
