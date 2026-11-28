// Converts unpacked GTA Vice City character .obj + .png packs into oriented,
// non-T-posing, smoothly 6-bone-skinned glTF 2.0 .glb models for Escape Berghain.
//
// Run: node scripts/import-vice-city.mjs
// Source: /tmp/vc-unpacked/ (or VC_SRC_DIR env var)
// Outputs:
//   - 19 human/regular NPCs: public/models/npc_<id>.glb (6-bone skinned)
//   - 8 crowd dancers:       public/models/crowd_0.glb .. crowd_7.glb (single-mesh for InstancedMesh)
// Never overwrites the 6 equine GLBs (npc_riddle_horse, npc_patrick, npc_ice_cream_horse, npc_herd*).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Allow GLTFLoader to parse in headless Node without browser globals.
globalThis.self ??= globalThis;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, '..', 'public', 'models');
const SRC_DIR = process.env.VC_SRC_DIR || '/tmp/vc-unpacked';

const PROTECTED_EQUINES = new Set([
  'npc_riddle_horse',
  'npc_patrick',
  'npc_ice_cream_horse',
  'npc_herd',
  'npc_herd_1',
  'npc_herd_2',
]);

const NPC_CAST = [
  { out: 'npc_friday_guy', obj: 'Jezz Torrent/JezzTorrent.obj', png: 'Jezz Torrent/jezz.PNG', height: 1.80 },
  { out: 'npc_leather_daddy', obj: 'Mitch Baker/bigm.obj', png: 'Mitch Baker/mitch.PNG', height: 1.88 },
  { out: 'npc_leather_choir', obj: 'Alex Shrub/AlexShrub.obj', png: 'Alex Shrub/csalscb.PNG', height: 1.80 },
  { out: 'npc_rubber_knight', obj: 'SWAT/SWAT/swat.obj', png: 'SWAT/SWAT/swat.png', height: 1.95 },
  { out: 'npc_bartender_bear', obj: 'Steve Scott/Director.obj', png: 'Steve Scott/direc.PNG', height: 1.90 },
  { out: 'npc_drag_oracle', obj: 'Mercedes Cortez/merc1.obj', png: 'Mercedes Cortez/merc.PNG', height: 2.10 },
  { out: 'npc_glitter_boy', obj: 'Percy/percy.obj', png: 'Percy/percy.PNG', height: 1.72 },
  { out: 'npc_bouncer', obj: 'Sonny Forelli/SonnyForelli.obj', png: 'Sonny Forelli/sonny.png', height: 1.92 },
  {
    out: 'npc_darkroom_keeper',
    obj: 'Avery Carrington/Avery Carrington/CSavery.obj',
    png: 'Avery Carrington/Avery Carrington/avery.png',
    height: 1.80,
  },
  { out: 'npc_coat_check', obj: 'BJ Smith/BJ.obj', png: 'BJ Smith/BJ.PNG', height: 1.80 },
  { out: 'npc_philosopher', obj: 'Phil Cassidy/Phil.obj', png: 'Phil Cassidy/phil.PNG', height: 1.80 },
  { out: 'npc_old_raver', obj: 'Kent Paul/KentPaul.obj', png: 'Kent Paul/kentpaul.PNG', height: 1.80 },
  { out: 'npc_lighting_tech', obj: 'Alex Shrub/AlexShrub2.obj', png: 'Alex Shrub/csalscb2.PNG', height: 1.80 },
  { out: 'npc_cleaner', obj: 'Cam Jones/CamJones.obj', png: 'Cam Jones/mike.PNG', height: 1.80 },
  { out: 'npc_tourists', obj: 'Candy Suxxx/CandySuxxx.obj', png: 'Candy Suxxx/cscandy.PNG', height: 1.80 },
  { out: 'npc_tourists_1', obj: 'Tommy Vercetti/Tommy Vercetti.obj', png: 'Tommy Vercetti/player.png', height: 1.80 },
  { out: 'npc_security', obj: 'Police Officer/VCPD Cop/cop.obj', png: 'Police Officer/VCPD Cop/cop.png', height: 1.85 },
  { out: 'npc_animal_control', obj: 'Army/army.obj', png: 'Army/army.png', height: 1.80 },
  {
    out: 'npc_spirit_guide',
    obj: 'Jezz Torrent/JezzTorrent.obj',
    png: 'Jezz Torrent/jezz.PNG',
    height: 0.90,
    baseColorFactor: [0.72, 0.88, 1.0, 1.0],
    emissiveFactor: [0.18, 0.35, 0.52],
  },
];

const CROWD_CAST = [
  { out: 'crowd_0', obj: 'Alex Shrub/AlexShrub.obj', png: 'Alex Shrub/csalscb.PNG', height: 1.78, elbowBendDeg: 22, armSplayDeg: 17 },
  { out: 'crowd_1', obj: 'Jezz Torrent/JezzTorrent.obj', png: 'Jezz Torrent/jezz.PNG', height: 1.78, elbowBendDeg: 20, armSplayDeg: 18 },
  { out: 'crowd_2', obj: 'Mitch Baker/bigm.obj', png: 'Mitch Baker/mitch.PNG', height: 1.78, elbowBendDeg: 16, armSplayDeg: 16 },
  { out: 'crowd_3', obj: 'Phil Cassidy/Phil.obj', png: 'Phil Cassidy/phil.PNG', height: 1.78, elbowBendDeg: 24, armSplayDeg: 17 },
  { out: 'crowd_4', obj: 'SWAT/SWAT/swat.obj', png: 'SWAT/SWAT/swat.png', height: 1.78, elbowBendDeg: 18, armSplayDeg: 16 },
  { out: 'crowd_5', obj: 'Candy Suxxx/CandySuxxx.obj', png: 'Candy Suxxx/cscandy.PNG', height: 1.78, elbowBendDeg: 25, armSplayDeg: 18 },
  { out: 'crowd_6', obj: 'Mercedes Cortez/merc1.obj', png: 'Mercedes Cortez/merc.PNG', height: 1.78, elbowBendDeg: 22, armSplayDeg: 17 },
  { out: 'crowd_7', obj: 'Percy/percy.obj', png: 'Percy/percy.PNG', height: 1.78, elbowBendDeg: 24, armSplayDeg: 18 },
];

// ============================================================================
// Math helpers
// ============================================================================

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0, edge1, x) {
  if (Math.abs(edge1 - edge0) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mod1(v) {
  return ((v % 1) + 1) % 1;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = clamp(Math.floor(sorted.length * p), 0, sorted.length - 1);
  return sorted[idx];
}

// ============================================================================
// OBJ Parser
// ============================================================================

function parseObj(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const rawV = [];
  const rawVT = [];
  const positions = [];
  const uvs = [];
  const indices = [];
  const vertMap = new Map();

  const resolveIndex = (idx, len) => (idx < 0 ? len + idx : idx - 1);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      rawV.push([parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])]);
    } else if (line.startsWith('vt ')) {
      const p = line.split(/\s+/);
      rawVT.push([parseFloat(p[1]), parseFloat(p[2])]);
    } else if (line.startsWith('f ')) {
      const tokens = line.split(/\s+/).slice(1);
      if (tokens.length < 3) continue;
      const faceVerts = [];
      for (const tok of tokens) {
        const parts = tok.split('/');
        const vi = resolveIndex(parseInt(parts[0], 10), rawV.length);
        const vti = parts[1] ? resolveIndex(parseInt(parts[1], 10), rawVT.length) : -1;
        if (vi < 0 || vi >= rawV.length) continue;
        const key = `${vi}/${vti}`;
        let outIdx = vertMap.get(key);
        if (outIdx === undefined) {
          outIdx = positions.length / 3;
          vertMap.set(key, outIdx);
          const v = rawV[vi];
          positions.push(v[0], v[1], v[2]);
          if (vti >= 0 && vti < rawVT.length) {
            uvs.push(rawVT[vti][0], rawVT[vti][1]);
          } else {
            uvs.push(0.5, 0.5);
          }
        }
        faceVerts.push(outIdx);
      }
      // Triangulate n-gon fan
      for (let i = 1; i + 1 < faceVerts.length; i++) {
        const a = faceVerts[0];
        const b = faceVerts[i];
        const c = faceVerts[i + 1];
        if (a !== b && b !== c && a !== c) {
          indices.push(a, b, c);
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };
}

// ============================================================================
// Orientation, Normalization, UV Check, Arm Drop, Normals & Skinning
// ============================================================================

function computeBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const val = positions[i + k];
      if (val < min[k]) min[k] = val;
      if (val > max[k]) max[k] = val;
    }
  }
  return {
    min,
    max,
    span: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

function measureToeDir(positions, minY, spanY) {
  let footMinZ = Infinity;
  let footMaxZ = -Infinity;
  let legSumZ = 0;
  let legN = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const h = (positions[i + 1] - minY) / spanY;
    const z = positions[i + 2];
    if (h < 0.06) {
      if (z < footMinZ) footMinZ = z;
      if (z > footMaxZ) footMaxZ = z;
    } else if (h >= 0.08 && h <= 0.35) {
      legSumZ += z;
      legN++;
    }
  }
  if (!Number.isFinite(footMinZ) || !Number.isFinite(footMaxZ) || legN === 0) return 0;
  const legMeanZ = legSumZ / legN;
  return (footMaxZ - legMeanZ) - (legMeanZ - footMinZ);
}

function computeSignedVolume(positions, indices) {
  let vol6 = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
    vol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return vol6 / 6;
}

function computeSmoothNormals(positions, indices) {
  const nVerts = positions.length / 3;
  const accum = new Map();
  const keys = new Array(nVerts);

  for (let v = 0; v < nVerts; v++) {
    const key = `${Math.round(positions[v * 3] * 1e4)},${Math.round(positions[v * 3 + 1] * 1e4)},${Math.round(positions[v * 3 + 2] * 1e4)}`;
    keys[v] = key;
    if (!accum.has(key)) accum.set(key, [0, 0, 0]);
  }

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const e1x = positions[ib] - positions[ia];
    const e1y = positions[ib + 1] - positions[ia + 1];
    const e1z = positions[ib + 2] - positions[ia + 2];
    const e2x = positions[ic] - positions[ia];
    const e2y = positions[ic + 1] - positions[ia + 1];
    const e2z = positions[ic + 2] - positions[ia + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const vi of [indices[i], indices[i + 1], indices[i + 2]]) {
      const acc = accum.get(keys[vi]);
      acc[0] += nx;
      acc[1] += ny;
      acc[2] += nz;
    }
  }

  const normals = new Float32Array(positions.length);
  for (let v = 0; v < nVerts; v++) {
    const acc = accum.get(keys[v]);
    const len = Math.hypot(acc[0], acc[1], acc[2]);
    if (len > 1e-8) {
      normals[v * 3] = acc[0] / len;
      normals[v * 3 + 1] = acc[1] / len;
      normals[v * 3 + 2] = acc[2] / len;
    } else {
      normals[v * 3] = 0;
      normals[v * 3 + 1] = 1;
      normals[v * 3 + 2] = 0;
    }
  }
  return normals;
}

function processCharacterMesh(mesh, options) {
  const { targetHeight, skinned, elbowBendDeg = 12, armSplayDeg = 16 } = options;
  const pos = new Float32Array(mesh.positions);
  const uvs = new Float32Array(mesh.uvs);
  const indices = new Uint32Array(mesh.indices);
  const nVerts = mesh.vertexCount;

  // 1. Auto-detect vertical axis (Y or Z) and HEAD vs FEET end via shoulder width profile.
  const rawBounds = computeBounds(pos);
  const upAxis = rawBounds.span[2] > rawBounds.span[1] ? 2 : 1;
  const xMinB = Array(10).fill(Infinity);
  const xMaxB = Array(10).fill(-Infinity);
  for (let i = 0; i < pos.length; i += 3) {
    const b = clamp(Math.floor(((pos[i + upAxis] - rawBounds.min[upAxis]) / rawBounds.span[upAxis]) * 10), 0, 9);
    if (pos[i] < xMinB[b]) xMinB[b] = pos[i];
    if (pos[i] > xMaxB[b]) xMaxB[b] = pos[i];
  }
  const lowShoulder = Math.max(
    Number.isFinite(xMinB[1]) ? xMaxB[1] - xMinB[1] : 0,
    Number.isFinite(xMinB[2]) ? xMaxB[2] - xMinB[2] : 0,
  );
  const highShoulder = Math.max(
    Number.isFinite(xMinB[7]) ? xMaxB[7] - xMinB[7] : 0,
    Number.isFinite(xMinB[8]) ? xMaxB[8] - xMinB[8] : 0,
  );
  const headAtMin = lowShoulder > highShoulder;

  // 2. Apply exact right-handed rotation (det = +1) so upright is +Y.
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    if (upAxis === 2 && headAtMin) {
      // Rx(+90°): -Z -> +Y, +Y -> +Z, +X -> +X
      pos[i] = x;
      pos[i + 1] = -z;
      pos[i + 2] = y;
    } else if (upAxis === 2 && !headAtMin) {
      // Rx(-90°): +Z -> +Y, -Y -> +Z, +X -> +X
      pos[i] = x;
      pos[i + 1] = z;
      pos[i + 2] = -y;
    } else if (upAxis === 1 && headAtMin) {
      // Rx(180°): -Y -> +Y, -Z -> +Z, +X -> +X
      pos[i] = x;
      pos[i + 1] = -y;
      pos[i + 2] = -z;
    }
    // else upAxis === 1 && !headAtMin -> identity
  }

  // 3. Auto-detect front (+Z) vs back (-Z) from toes vs lower legs; rotate Ry(180°) if needed (det = +1).
  let b = computeBounds(pos);
  const toeDirBefore = measureToeDir(pos, b.min[1], b.span[1]);
  let rotatedFront = false;
  if (toeDirBefore < 0) {
    rotatedFront = true;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = -pos[i];
      pos[i + 2] = -pos[i + 2];
    }
    b = computeBounds(pos);
  }

  // 4. Scale uniformly to targetHeight, ground minY = 0, center torso X and Z around 0.
  const scale = targetHeight / b.span[1];
  const midRawX = (b.min[0] + b.max[0]) * 0.5;
  let torsoXSum = 0;
  let torsoZSum = 0;
  let torsoN = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const h = (pos[i + 1] - b.min[1]) / b.span[1];
    if (h >= 0.30 && h <= 0.72 && Math.abs(pos[i] - midRawX) < b.span[1] * 0.18) {
      torsoXSum += pos[i];
      torsoZSum += pos[i + 2];
      torsoN++;
    }
  }
  const centerX = torsoN > 0 ? torsoXSum / torsoN : midRawX;
  const centerZ = torsoN > 0 ? torsoZSum / torsoN : (b.min[2] + b.max[2]) * 0.5;
  const minY = b.min[1];

  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - centerX) * scale;
    pos[i + 1] = (pos[i + 1] - minY) * scale;
    pos[i + 2] = (pos[i + 2] - centerZ) * scale;
  }

  const H = targetHeight;
  const s = H / 1.80;

  // 5. UV conversion (OBJ bottom-left -> glTF top-left) + explicit head-UV orientation guard.
  let minV = Infinity;
  for (let i = 1; i < uvs.length; i += 2) {
    uvs[i] = 1 - uvs[i];
    if (uvs[i] < minV) minV = uvs[i];
  }
  // Shift negative-V exports (which land in [1, 2] after 1-v) cleanly into [0, 1] by an exact integer.
  if (minV >= 0.9) {
    const vShift = Math.floor(minV);
    for (let i = 1; i < uvs.length; i += 2) uvs[i] -= vShift;
  }
  const avgHeadV = () => {
    let sum = 0;
    let count = 0;
    for (let v = 0; v < nVerts; v++) {
      if (pos[v * 3 + 1] > 0.85 * H) {
        sum += mod1(uvs[v * 2 + 1]);
        count++;
      }
    }
    return count > 0 ? sum / count : 0.25;
  };
  let headV = avgHeadV();
  let uvFlippedBack = false;
  if (headV > 0.5) {
    uvFlippedBack = true;
    let minV2 = Infinity;
    for (let i = 1; i < uvs.length; i += 2) {
      uvs[i] = 1 - uvs[i];
      if (uvs[i] < minV2) minV2 = uvs[i];
    }
    if (minV2 >= 0.9 || minV2 < -0.1) {
      const vShift2 = Math.floor(minV2);
      for (let i = 1; i < uvs.length; i += 2) uvs[i] -= vShift2;
    }
    headV = avgHeadV();
  }

  // 6. Measure pre-drop anatomy (torso half-width, shoulder pivot, arm elevation angle).
  const preBounds = computeBounds(pos);
  const rawMaxAbsX = Math.max(Math.abs(preBounds.min[0]), Math.abs(preBounds.max[0]));

  const chestAbsX = [];
  for (let v = 0; v < nVerts; v++) {
    const ax = Math.abs(pos[v * 3]);
    const y = pos[v * 3 + 1];
    if (y >= 0.56 * H && y <= 0.72 * H && ax < 0.26 * s) {
      chestAbsX.push(ax);
    }
  }
  const torsoHalfW = clamp(percentile(chestAbsX, 0.92), 0.145 * s, 0.22 * s);
  const shoulderX = torsoHalfW * 0.92;

  // Estimate shoulderY and shoulderZ from upper-arm vertices just outside the torso.
  let shYSum = 0;
  let shZSum = 0;
  let shN = 0;
  const isTPose = rawMaxAbsX > 0.68 * s;
  for (let v = 0; v < nVerts; v++) {
    const ax = Math.abs(pos[v * 3]);
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    if (isTPose) {
      if (ax > torsoHalfW * 1.15 && ax < 0.45 * s && y >= 0.72 * H && y <= 0.90 * H) {
        shYSum += y;
        shZSum += z;
        shN++;
      }
    } else {
      if (ax > torsoHalfW * 0.95 && ax < 0.34 * s && y >= 0.73 * H && y <= 0.87 * H) {
        shYSum += y;
        shZSum += z;
        shN++;
      }
    }
  }
  const shoulderY = clamp(shN > 0 ? shYSum / shN : 0.815 * H, 0.78 * H, 0.845 * H);
  const shoulderZ = shN > 0 ? shZSum / shN : 0;

  // Measure actual current arm elevation angle from straight-down vertical (0° = hanging down, 90° = T-pose).
  let dxSum = 0;
  let dySum = 0;
  let armSampleN = 0;
  for (let v = 0; v < nVerts; v++) {
    const ax = Math.abs(pos[v * 3]);
    const y = pos[v * 3 + 1];
    if (ax > Math.max(0.32 * s, torsoHalfW * 1.55) && y >= 0.42 * H && y <= 0.92 * H) {
      dxSum += ax - shoulderX;
      dySum += y - shoulderY;
      armSampleN++;
    }
  }
  const armAngleFromVert = armSampleN > 0 ? Math.atan2(Math.max(1e-4, dxSum / armSampleN), -(dySum / armSampleN)) : Math.PI / 2;
  const targetAngleFromVert = degToRad(armSplayDeg);
  const dropAngle = clamp(armAngleFromVert - targetAngleFromVert, 0, degToRad(88));
  const elbowBendRad = degToRad(elbowBendDeg);

  // 7. Compute smooth pre-drop arm membership mask (BEFORE lowering arms, so hands never mix with hips!).
  const armMask = new Float32Array(nVerts);
  const armSide = new Int8Array(nVerts);
  for (let v = 0; v < nVerts; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const ax = Math.abs(x);
    armSide[v] = x >= 0 ? 1 : -1;

    let mask;
    if (isTPose) {
      const xBlend = smoothstep(torsoHalfW * 0.78, torsoHalfW * 1.28, ax);
      const yBlend = smoothstep(0.67 * H, 0.75 * H, y) * smoothstep(0.97 * H, 0.92 * H, y);
      mask = xBlend * yBlend;
    } else {
      // A-pose (Jezz, AlexShrub2): arms angle downward clear of the torso waist/hips.
      const localTorsoW = torsoHalfW * (y > 0.68 * H ? 1.0 : 0.92);
      const xBlend = smoothstep(localTorsoW * 0.85, localTorsoW * 1.22, ax);
      const yBlend = smoothstep(0.40 * H, 0.47 * H, y) * smoothstep(0.95 * H, 0.89 * H, y);
      mask = xBlend * yBlend;
    }
    armMask[v] = mask;
  }

  // 8. Drop arms smoothly around shoulder pivots (sx, shoulderY, shoulderZ) + natural slight forward elbow bend.
  for (let v = 0; v < nVerts; v++) {
    const w = armMask[v];
    if (w <= 1e-4) continue;
    const side = armSide[v];
    const px = side * shoulderX;
    const py = shoulderY;
    const pz = shoulderZ;

    let dx = pos[v * 3] - px;
    let dy = pos[v * 3 + 1] - py;
    let dz = pos[v * 3 + 2] - pz;

    const armDist = Math.hypot(dx, dy);

    // Rotate around Z downward toward body: +X arm rotates by -angle, -X arm rotates by +angle.
    const theta = -side * dropAngle * w;
    const c = Math.cos(theta);
    const sn = Math.sin(theta);
    const rx = dx * c - dy * sn;
    const ry = dx * sn + dy * c;
    dx = rx;
    dy = ry;

    // Gentle forward bend from elbow to hand (around local X axis at elbow pivot ~0.27*s down the arm).
    const elbowW = smoothstep(0.20 * s, 0.34 * s, armDist) * w;
    if (elbowW > 1e-4 && elbowBendRad > 0) {
      const ex = side * Math.sin(targetAngleFromVert) * 0.25 * s;
      const ey = -Math.cos(targetAngleFromVert) * 0.25 * s;
      const fdy = dy - ey;
      const fdz = dz;
      // Rotate forearm forward (+Z) around X: positive rotation around X moves -Y toward +Z!
      // Wait: Ry' = y*cos(a) - z*sin(a), Rz' = y*sin(a) + z*cos(a).
      // For y < 0 (hanging down), to move toward +Z we need y*sin(a) > 0 => sin(a) < 0 => a = -elbowBendRad!
      const a = -elbowBendRad * elbowW;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      dy = ey + (fdy * ca - fdz * sa);
      dz = fdy * sa + fdz * ca;
      dx = dx + (ex - ex); // unchanged
    }

    pos[v * 3] = px + dx;
    pos[v * 3 + 1] = py + dy;
    pos[v * 3 + 2] = pz + dz;
  }

  // Re-ground minY exactly to 0 in case anything shifted numerically (keeps exact height).
  const postBounds = computeBounds(pos);
  if (Math.abs(postBounds.min[1]) > 1e-5) {
    for (let i = 1; i < pos.length; i += 3) pos[i] -= postBounds.min[1];
  }

  // 9. Verify outward winding and recompute smooth vertex normals on the final posed mesh.
  const signedVol = computeSignedVolume(pos, indices);
  if (signedVol < 0) {
    throw new Error(`Negative signed volume (${signedVol.toFixed(4)}) detected — winding inverted!`);
  }
  const normals = computeSmoothNormals(pos, indices);

  // 10. Compute 6-bone smooth skin weights & joint pivots (for npc_*.glb).
  // Joint order: 0=body, 1=head, 2=armL (+X), 3=armR (-X), 4=legL (+X), 5=legR (-X)
  const hipY = 0.50 * H;
  const hipX = 0.095 * s;
  const neckY = 0.855 * H;
  let neckZSum = 0;
  let neckZN = 0;
  for (let v = 0; v < nVerts; v++) {
    const y = pos[v * 3 + 1];
    if (y >= 0.83 * H && y <= 0.88 * H && Math.abs(pos[v * 3]) < 0.08 * s) {
      neckZSum += pos[v * 3 + 2];
      neckZN++;
    }
  }
  const neckZ = neckZN > 0 ? neckZSum / neckZN : 0;

  let joints = null;
  let weights = null;
  let skeleton = null;

  if (skinned) {
    joints = new Uint8Array(nVerts * 4);
    weights = new Float32Array(nVerts * 4);

    for (let v = 0; v < nVerts; v++) {
      const x = pos[v * 3];
      const y = pos[v * 3 + 1];

      const wArm = armMask[v];
      const rem = 1 - wArm;
      const wHead = rem * smoothstep(0.835 * H, 0.885 * H, y);
      const rem2 = rem - wHead;

      const wLegTotal = smoothstep(0.54 * H, 0.44 * H, y);
      const legEps = y > 0.43 * H ? 0.035 * s : 0.008 * s;
      const leftShare = smoothstep(-legEps, legEps, x);

      const wLegL = rem2 * wLegTotal * leftShare;
      const wLegR = rem2 * wLegTotal * (1 - leftShare);
      const wBody = rem2 * (1 - wLegTotal);

      const pairs = [
        [0, wBody],
        [1, wHead],
        [armSide[v] > 0 ? 2 : 3, wArm],
        [4, wLegL],
        [5, wLegR],
      ];
      pairs.sort((a, bPair) => bPair[1] - a[1]);

      // Keep top 4 weights and re-normalize to exact sum = 1.0
      let sum = pairs[0][1] + pairs[1][1] + pairs[2][1] + pairs[3][1];
      if (sum < 1e-6) {
        pairs[0] = [0, 1];
        pairs[1] = [0, 0];
        pairs[2] = [0, 0];
        pairs[3] = [0, 0];
        sum = 1;
      }
      for (let k = 0; k < 4; k++) {
        const wNorm = pairs[k][1] / sum;
        joints[v * 4 + k] = wNorm > 1e-6 ? pairs[k][0] : 0;
        weights[v * 4 + k] = wNorm;
      }
    }

    const worldJointPos = [
      [0, hipY, 0],                        // 0: body
      [0, neckY, neckZ],                   // 1: head
      [shoulderX, shoulderY, shoulderZ],   // 2: armL (+X)
      [-shoulderX, shoulderY, shoulderZ],  // 3: armR (-X)
      [hipX, hipY, 0],                     // 4: legL (+X)
      [-hipX, hipY, 0],                    // 5: legR (-X)
    ];

    const localJointTrans = [
      [0, hipY, 0],
      [0, neckY - hipY, neckZ],
      [shoulderX, shoulderY - hipY, shoulderZ],
      [-shoulderX, shoulderY - hipY, shoulderZ],
      [hipX, 0, 0],
      [-hipX, 0, 0],
    ];

    const ibm = new Float32Array(6 * 16);
    for (let j = 0; j < 6; j++) {
      const off = j * 16;
      ibm[off + 0] = 1;
      ibm[off + 5] = 1;
      ibm[off + 10] = 1;
      ibm[off + 15] = 1;
      ibm[off + 12] = -worldJointPos[j][0];
      ibm[off + 13] = -worldJointPos[j][1];
      ibm[off + 14] = -worldJointPos[j][2];
    }

    skeleton = {
      names: ['body', 'head', 'armL', 'armR', 'legL', 'legR'],
      localJointTrans,
      ibm,
    };
  }

  return {
    positions: pos,
    normals,
    uvs,
    indices,
    joints,
    weights,
    skeleton,
    stats: {
      upAxis: upAxis === 2 ? 'Z' : 'Y',
      headAtMin,
      rotatedFront,
      uvFlippedBack,
      headV,
      dropAngleDeg: (dropAngle * 180) / Math.PI,
      signedVol,
      toeDirAfter: measureToeDir(pos, 0, H),
    },
  };
}

// ============================================================================
// GLB 2.0 Packer
// ============================================================================

function pad4(buf) {
  const rem = buf.length % 4;
  return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem)]);
}

function buildGlb(processed, pngBuffer, spec) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteOffset = 0;

  const pushView = (typedOrBuf, target) => {
    const raw = Buffer.isBuffer(typedOrBuf)
      ? typedOrBuf
      : Buffer.from(typedOrBuf.buffer, typedOrBuf.byteOffset, typedOrBuf.byteLength);
    const padded = pad4(raw);
    const bv = { buffer: 0, byteOffset, byteLength: raw.length };
    if (target) bv.target = target;
    const idx = bufferViews.length;
    bufferViews.push(bv);
    chunks.push(padded);
    byteOffset += padded.length;
    return idx;
  };

  const pushAccessor = (typed, type, componentType, target, withMinMax = false) => {
    const bvIdx = pushView(typed, target);
    const comps = type === 'SCALAR' ? 1 : type === 'VEC2' ? 2 : type === 'VEC3' ? 3 : type === 'VEC4' ? 4 : 16;
    const count = typed.length / comps;
    const acc = {
      bufferView: bvIdx,
      componentType,
      count,
      type,
    };
    if (withMinMax) {
      const mn = Array(comps).fill(Infinity);
      const mx = Array(comps).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < comps; k++) {
          const val = typed[i * comps + k];
          if (val < mn[k]) mn[k] = val;
          if (val > mx[k]) mx[k] = val;
        }
      }
      acc.min = mn;
      acc.max = mx;
    }
    const idx = accessors.length;
    accessors.push(acc);
    return idx;
  };

  const ARRAY_BUFFER = 34962;
  const ELEMENT_ARRAY_BUFFER = 34963;
  const UNSIGNED_BYTE = 5121;
  const UNSIGNED_SHORT = 5123;
  const UNSIGNED_INT = 5125;
  const FLOAT = 5126;

  const posAcc = pushAccessor(processed.positions, 'VEC3', FLOAT, ARRAY_BUFFER, true);
  const normAcc = pushAccessor(processed.normals, 'VEC3', FLOAT, ARRAY_BUFFER, false);
  const uvAcc = pushAccessor(processed.uvs, 'VEC2', FLOAT, ARRAY_BUFFER, false);

  const useU16 = processed.positions.length / 3 <= 65535;
  const idxTyped = useU16 ? new Uint16Array(processed.indices) : processed.indices;
  const idxAcc = pushAccessor(idxTyped, 'SCALAR', useU16 ? UNSIGNED_SHORT : UNSIGNED_INT, ELEMENT_ARRAY_BUFFER, false);

  const attributes = {
    POSITION: posAcc,
    NORMAL: normAcc,
    TEXCOORD_0: uvAcc,
  };

  let ibmAcc = -1;
  if (processed.skeleton) {
    attributes.JOINTS_0 = pushAccessor(processed.joints, 'VEC4', UNSIGNED_BYTE, ARRAY_BUFFER, false);
    attributes.WEIGHTS_0 = pushAccessor(processed.weights, 'VEC4', FLOAT, ARRAY_BUFFER, false);
    ibmAcc = pushAccessor(processed.skeleton.ibm, 'MAT4', FLOAT, undefined, false);
  }

  const imgViewIdx = pushView(pngBuffer, undefined);

  const baseColorFactor = spec.baseColorFactor ?? [1, 1, 1, 1];
  const emissiveFactor = spec.emissiveFactor ?? [0.06, 0.06, 0.06];

  const gltf = {
    asset: { version: '2.0', generator: 'escape-berghain import-vice-city.mjs' },
    scene: 0,
    scenes: [{ nodes: processed.skeleton ? [0, 1] : [0] }],
    nodes: [],
    meshes: [
      {
        name: spec.out,
        primitives: [
          {
            attributes,
            indices: idxAcc,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: `${spec.out}_mat`,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          baseColorFactor,
          roughnessFactor: 0.78,
          metallicFactor: 0.06,
        },
        emissiveTexture: { index: 0 },
        emissiveFactor,
        doubleSided: true,
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [
      {
        magFilter: 9729, // LINEAR
        minFilter: 9987, // LINEAR_MIPMAP_LINEAR
        wrapS: 10497, // REPEAT
        wrapT: 10497, // REPEAT
      },
    ],
    images: [{ bufferView: imgViewIdx, mimeType: 'image/png' }],
    buffers: [{ byteLength: byteOffset }],
    bufferViews,
    accessors,
  };

  if (processed.skeleton) {
    // Node 0: SkinnedMesh node at identity; Nodes 1..6: body root + 5 child joints
    gltf.nodes.push({ name: spec.out, mesh: 0, skin: 0 });
    for (let j = 0; j < 6; j++) {
      const node = {
        name: processed.skeleton.names[j],
        translation: processed.skeleton.localJointTrans[j],
      };
      if (j === 0) node.children = [2, 3, 4, 5, 6];
      gltf.nodes.push(node);
    }
    gltf.skins = [
      {
        name: `${spec.out}_skin`,
        inverseBindMatrices: ibmAcc,
        skeleton: 1,
        joints: [1, 2, 3, 4, 5, 6],
      },
    ];
  } else {
    gltf.nodes.push({ name: spec.out, mesh: 0 });
  }

  const binBuf = Buffer.concat(chunks);
  let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonBuf.length, 0);
  jsonHdr.writeUInt32LE(0x4e4f534a, 4); // "JSON"

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binBuf.length, 0);
  binHdr.writeUInt32LE(0x004e4942, 4); // "BIN\0"

  return Buffer.concat([header, jsonHdr, jsonBuf, binHdr, binBuf]);
}

// ============================================================================
// GLB Verification via GLTFLoader
// ============================================================================

async function verifyGlb(glbPath, spec, expectSkinned) {
  const buf = readFileSync(glbPath);

  // Verify embedded PNG signature & dimensions from JSON/BIN chunks
  const jsonLen = buf.readUInt32LE(12);
  const gltfJson = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const imgBv = gltfJson.bufferViews[gltfJson.images[0].bufferView];
  const pngSlice = buf.subarray(binStart + imgBv.byteOffset, binStart + imgBv.byteOffset + imgBv.byteLength);
  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (pngSlice[i] !== PNG_SIG[i]) throw new Error(`${spec.out}: invalid embedded PNG header`);
  }
  const pngW = pngSlice.readUInt32BE(16);
  const pngH = pngSlice.readUInt32BE(20);

  // Load with Three.js GLTFLoader (suppress expected headless-Node blob image warning; PNG bytes verified above)
  const loader = new GLTFLoader();
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const origWarn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes("Couldn't load texture blob:")) return;
    origWarn(...args);
  };
  let gltf;
  try {
    gltf = await new Promise((resolve, reject) => {
      loader.parse(ab, '', resolve, reject);
    });
  } finally {
    console.warn = origWarn;
  }

  const meshes = [];
  const boneNames = new Set();
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
    if (obj.isBone) boneNames.add(obj.name);
  });

  if (meshes.length !== 1) throw new Error(`${spec.out}: expected 1 mesh, got ${meshes.length}`);
  const mesh = meshes[0];
  if (expectSkinned && !mesh.isSkinnedMesh) throw new Error(`${spec.out}: expected SkinnedMesh`);
  if (!expectSkinned && mesh.isSkinnedMesh) throw new Error(`${spec.out}: crowd mesh must NOT be skinned`);

  const posAttr = mesh.geometry.getAttribute('position');
  const uvAttr = mesh.geometry.getAttribute('uv');
  const idxAttr = mesh.geometry.getIndex();
  const posArr = posAttr.array;

  const b = computeBounds(posArr);
  const height = b.max[1] - b.min[1];
  const minY = b.min[1];
  const maxAbsX = Math.max(Math.abs(b.min[0]), Math.abs(b.max[0]));
  const toeDir = measureToeDir(posArr, b.min[1], height);
  const signedVol = computeSignedVolume(posArr, idxAttr.array);

  // Check head UVs (top 15% of height)
  let headVSum = 0;
  let headVN = 0;
  for (let v = 0; v < posAttr.count; v++) {
    if (posArr[v * 3 + 1] > b.min[1] + 0.85 * height) {
      headVSum += mod1(uvAttr.getY(v));
      headVN++;
    }
  }
  const headV = headVN > 0 ? headVSum / headVN : 1;

  // Assertions
  if (Math.abs(height - spec.height) > 0.02) {
    throw new Error(`${spec.out}: height ${height.toFixed(3)} != expected ${spec.height}`);
  }
  if (Math.abs(minY) > 0.01) {
    throw new Error(`${spec.out}: minY ${minY.toFixed(4)} not grounded at 0`);
  }
  if (maxAbsX > 0.48) {
    throw new Error(`${spec.out}: maxAbsX ${maxAbsX.toFixed(3)} > 0.48 m (still T-posing!)`);
  }
  if (toeDir <= 0) {
    throw new Error(`${spec.out}: toeDir ${toeDir.toFixed(3)} <= 0 (facing backwards!)`);
  }
  if (headV >= 0.5) {
    throw new Error(`${spec.out}: headV ${headV.toFixed(3)} >= 0.50 (upside-down face texture!)`);
  }
  if (signedVol <= 0) {
    throw new Error(`${spec.out}: signedVol ${signedVol.toFixed(4)} <= 0 (inverted winding!)`);
  }

  let maxWeightErr = 0;
  if (expectSkinned) {
    const required = ['body', 'head', 'armL', 'armR', 'legL', 'legR'];
    for (const r of required) {
      if (!boneNames.has(r)) throw new Error(`${spec.out}: missing bone "${r}"`);
    }
    const wAttr = mesh.geometry.getAttribute('skinWeight');
    if (!wAttr) throw new Error(`${spec.out}: missing skinWeight attribute`);
    for (let v = 0; v < wAttr.count; v++) {
      const s = wAttr.getX(v) + wAttr.getY(v) + wAttr.getZ(v) + wAttr.getW(v);
      const err = Math.abs(s - 1);
      if (err > maxWeightErr) maxWeightErr = err;
    }
    if (maxWeightErr > 1e-3) {
      throw new Error(`${spec.out}: skin weights do not sum to 1 (maxErr=${maxWeightErr})`);
    }
    // Verify SkeletonUtils.clone produces independent bones bound to the cloned SkinnedMesh
    const cloned = cloneSkinned(gltf.scene);
    let clonedSkinned = null;
    cloned.traverse((o) => {
      if (o.isSkinnedMesh) clonedSkinned = o;
    });
    if (!clonedSkinned || clonedSkinned.skeleton === mesh.skeleton) {
      throw new Error(`${spec.out}: SkeletonUtils.clone failed to create independent skeleton`);
    }
    if (clonedSkinned.skeleton.bones[0] === mesh.skeleton.bones[0]) {
      throw new Error(`${spec.out}: SkeletonUtils.clone shares bone instances!`);
    }
  }

  return {
    out: spec.out,
    kind: expectSkinned ? 'NPC(6b)' : 'CROWD',
    tris: idxAttr.count / 3,
    kb: buf.length / 1024,
    height,
    minY,
    maxAbsX,
    toeDir,
    headV,
    png: `${pngW}x${pngH}`,
    bones: expectSkinned ? boneNames.size : 0,
    maxWeightErr,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const jobs = [
    ...NPC_CAST.map((s) => ({ spec: s, skinned: true })),
    ...CROWD_CAST.map((s) => ({ spec: s, skinned: false })),
  ];

  // Safety check: never touch equine GLBs
  for (const { spec } of jobs) {
    if (PROTECTED_EQUINES.has(spec.out)) {
      throw new Error(`Refusing to overwrite protected equine model: ${spec.out}`);
    }
  }

  const parsedObjCache = new Map();
  const rows = [];

  for (const { spec, skinned } of jobs) {
    const objPath = join(SRC_DIR, spec.obj);
    const pngPath = join(SRC_DIR, spec.png);
    if (!existsSync(objPath)) throw new Error(`Missing OBJ: ${objPath}`);
    if (!existsSync(pngPath)) throw new Error(`Missing PNG: ${pngPath}`);

    let parsed = parsedObjCache.get(objPath);
    if (!parsed) {
      parsed = parseObj(objPath);
      parsedObjCache.set(objPath, parsed);
    }
    const pngBuffer = readFileSync(pngPath);

    const processed = processCharacterMesh(parsed, {
      targetHeight: spec.height,
      skinned,
      elbowBendDeg: spec.elbowBendDeg ?? 12,
      armSplayDeg: spec.armSplayDeg ?? 16,
    });

    const glb = buildGlb(processed, pngBuffer, spec);
    const outPath = join(OUT_DIR, `${spec.out}.glb`);
    writeFileSync(outPath, glb);

    const v = await verifyGlb(outPath, spec, skinned);
    rows.push({ ...v, dropDeg: processed.stats.dropAngleDeg, up: processed.stats.upAxis });
  }

  console.log('\n=== Vice City GLB Import Verification (27/27 passed) ===');
  console.log(
    'Model'.padEnd(22) +
      'Kind'.padEnd(9) +
      'Tris'.padStart(6) +
      'Size'.padStart(8) +
      'Height'.padStart(8) +
      'MinY'.padStart(7) +
      'Max|X|'.padStart(8) +
      'Drop°'.padStart(7) +
      'Toe+Z'.padStart(8) +
      'HeadV'.padStart(7) +
      '  PNG       Bones',
  );
  console.log('-'.repeat(108));
  for (const r of rows) {
    console.log(
      r.out.padEnd(22) +
        r.kind.padEnd(9) +
        String(r.tris).padStart(6) +
        `${r.kb.toFixed(0)}KB`.padStart(8) +
        `${r.height.toFixed(2)}m`.padStart(8) +
        `${r.minY.toFixed(3)}`.padStart(7) +
        `${r.maxAbsX.toFixed(2)}m`.padStart(8) +
        `${r.dropDeg.toFixed(0)}°`.padStart(7) +
        `+${r.toeDir.toFixed(2)}`.padStart(8) +
        `${r.headV.toFixed(2)}`.padStart(7) +
        `  ${r.png.padEnd(10)}${r.bones > 0 ? `${r.bones} (err<${r.maxWeightErr.toExponential(0)})` : 'static'}`,
    );
  }
  console.log('\nProtected equine GLBs untouched:', [...PROTECTED_EQUINES].join(', '));
}

main().catch((err) => {
  console.error('IMPORT FAILED:', err);
  process.exit(1);
});
