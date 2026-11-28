// Converts the 4 rare creature .obj + .png packs in /tmp/special-unpacked/ into
// grounded (minY = 0), +Y up, +Z facing glTF 2.0 .glb files in public/models/.
//
// Run: node scripts/import-special-creatures.mjs
// Outputs:
//   - public/models/special_lemur.glb  (0.85 m)
//   - public/models/special_chimp.glb  (1.15 m, relaxed arms dropped ~55 deg)
//   - public/models/special_panda.glb  (1.32 m)
//   - public/models/special_ghoul.glb  (1.86 m, hunched arms dropped ~62 deg, 2 materials)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Allow GLTFLoader to parse in headless Node without browser globals.
globalThis.self ??= globalThis;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, '..', 'public', 'models');
const SRC_DIR = process.env.SPECIAL_SRC_DIR || '/tmp/special-unpacked';
const TEX_TMP_DIR = '/tmp/special-tex';

const CREATURES = [
  {
    out: 'special_lemur',
    obj: 'Ring-Tailed Lemur/14225/adult.obj',
    targetHeight: 0.85,
    rotateY180: false,
    centerZFilter: (_x, y, z) => z > -0.35 && y < 0.45,
    armDrop: null,
    materials: [
      {
        name: 'lemur_fur',
        srcTex: 'Ring-Tailed Lemur/14225/adult.png',
        downscale: false,
        emissiveFactor: [0.06, 0.06, 0.06],
        roughnessFactor: 0.8,
        metallicFactor: 0.04,
      },
    ],
    matIndexFor: () => 0,
  },
  {
    out: 'special_chimp',
    obj: 'Chimpanzee/13055/adult.obj',
    targetHeight: 1.15,
    rotateY180: false,
    centerZFilter: (x, _y, _z) => Math.abs(x) < 0.24,
    armDrop: {
      dropDeg: 58,
      shoulderX: 0.22,
      blendInnerX: 0.19,
      blendOuterX: 0.29,
      minYFrac: 0.48,
      forwardCurlDeg: 10,
      curlStartDist: 0.32,
    },
    materials: [
      {
        name: 'chimp_fur',
        srcTex: 'Chimpanzee/13055/adult.png',
        downscale: false,
        emissiveFactor: [0.06, 0.06, 0.06],
        roughnessFactor: 0.8,
        metallicFactor: 0.04,
      },
    ],
    matIndexFor: () => 0,
  },
  {
    out: 'special_panda',
    obj: 'Giant Panda/13588/adult.obj',
    targetHeight: 1.32,
    rotateY180: false,
    centerZFilter: () => true,
    armDrop: null,
    materials: [
      {
        name: 'panda_fur',
        srcTex: 'Giant Panda/13588/adult.png',
        downscale: false,
        emissiveFactor: [0.06, 0.06, 0.06],
        roughnessFactor: 0.82,
        metallicFactor: 0.03,
      },
    ],
    matIndexFor: () => 0,
  },
  {
    out: 'special_ghoul',
    obj: 'Ghoul Reaver/Ghoulreaver/ghoulreaver.obj',
    targetHeight: 1.86,
    rotateY180: true, // Raw OBJ faces -Z (toes, head, knees at -Z; hunchback at +Z)
    centerZFilter: (x, y, _z, minY, spanY) => {
      const h = (y - minY) / spanY;
      return Math.abs(x) < spanY * 0.18 && h >= 0.25 && h <= 0.75;
    },
    armDrop: {
      dropDeg: 62,
      shoulderX: 0.22,
      blendInnerX: 0.18,
      blendOuterX: 0.28,
      minYFrac: 0.48,
      forwardCurlDeg: 18,
      curlStartDist: 0.28,
    },
    materials: [
      {
        name: 'ghoul_feral',
        srcTex: 'Ghoul Reaver/Ghoulreaver/ghoulferal.png',
        downscale: true,
        tmpOut: 'ghoulferal.jpg',
        emissiveFactor: [0.04, 0.09, 0.04],
        roughnessFactor: 0.78,
        metallicFactor: 0.06,
      },
      {
        name: 'ghoul_shirt',
        srcTex: 'Ghoul Reaver/Ghoulreaver/ghoulshirt.png',
        downscale: true,
        tmpOut: 'ghoulshirt.jpg',
        emissiveFactor: [0.04, 0.09, 0.04],
        roughnessFactor: 0.85,
        metallicFactor: 0.05,
      },
    ],
    matIndexFor: (mtlName) => (mtlName === 'Material__69' ? 1 : 0),
  },
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

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function computeBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return {
    min,
    max,
    span: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

// ============================================================================
// Multi-material OBJ Parser
// ============================================================================

function parseObjMulti(filePath, matCount, matIndexFor) {
  const text = readFileSync(filePath, 'utf8');
  const rawV = [];
  const rawVT = [];
  const positions = [];
  const uvs = [];
  const primIndices = Array.from({ length: matCount }, () => []);
  const vertMap = new Map();

  let currentMat = 0;
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
    } else if (line.startsWith('usemtl ')) {
      currentMat = clamp(matIndexFor(line.slice(7).trim()), 0, matCount - 1);
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
      const target = primIndices[currentMat];
      for (let i = 1; i + 1 < faceVerts.length; i++) {
        const a = faceVerts[0];
        const b = faceVerts[i];
        const c = faceVerts[i + 1];
        if (a !== b && b !== c && a !== c) {
          target.push(a, b, c);
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    primIndices: primIndices.map((arr) => new Uint32Array(arr)),
    vertexCount: positions.length / 3,
  };
}

// ============================================================================
// Geometry Processing: Orientation, Scaling, Arm Drop, Winding & Normals
// ============================================================================

function computeSignedVolume(positions, primIndices) {
  let vol6 = 0;
  for (const indices of primIndices) {
    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i] * 3;
      const ib = indices[i + 1] * 3;
      const ic = indices[i + 2] * 3;
      const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
      const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
      const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
      vol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    }
  }
  return vol6 / 6;
}

function computeSmoothNormals(positions, primIndices) {
  const nVerts = positions.length / 3;
  const accum = new Map();
  const keys = new Array(nVerts);

  for (let v = 0; v < nVerts; v++) {
    const key = `${Math.round(positions[v * 3] * 1e4)},${Math.round(positions[v * 3 + 1] * 1e4)},${Math.round(positions[v * 3 + 2] * 1e4)}`;
    keys[v] = key;
    if (!accum.has(key)) accum.set(key, [0, 0, 0]);
  }

  for (const indices of primIndices) {
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

function processCreature(parsed, spec) {
  const pos = new Float32Array(parsed.positions);
  const uvs = new Float32Array(parsed.uvs);
  const primIndices = parsed.primIndices.map((arr) => new Uint32Array(arr));
  const nVerts = parsed.vertexCount;

  // 1. Optional 180 deg rotation around +Y (det = +1) so creature faces +Z.
  if (spec.rotateY180) {
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = -pos[i];
      pos[i + 2] = -pos[i + 2];
    }
  }

  // 2. Uniformly scale to targetHeight, ground minY = 0, center X and body Z around 0.
  const b0 = computeBounds(pos);
  const scale = spec.targetHeight / b0.span[1];

  let xSum = 0;
  let zSum = 0;
  let cN = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    if (spec.centerZFilter(x, y, z, b0.min[1], b0.span[1])) {
      xSum += x;
      zSum += z;
      cN++;
    }
  }
  const centerX = cN > 0 ? xSum / cN : (b0.min[0] + b0.max[0]) * 0.5;
  const centerZ = cN > 0 ? zSum / cN : (b0.min[2] + b0.max[2]) * 0.5;
  const minY0 = b0.min[1];

  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - centerX) * scale;
    pos[i + 1] = (pos[i + 1] - minY0) * scale;
    pos[i + 2] = (pos[i + 2] - centerZ) * scale;
  }

  // 3. Optional T-pose arm drop around shoulders so chimp & ghoul have relaxed club poses.
  const H = spec.targetHeight;
  if (spec.armDrop) {
    const { dropDeg, shoulderX, blendInnerX, blendOuterX, minYFrac, forwardCurlDeg, curlStartDist } = spec.armDrop;

    // Measure actual shoulder Y and Z from vertices near |x| ≈ shoulderX on upper body.
    let shYSum = 0;
    let shZSum = 0;
    let shN = 0;
    for (let v = 0; v < nVerts; v++) {
      const ax = Math.abs(pos[v * 3]);
      const y = pos[v * 3 + 1];
      const z = pos[v * 3 + 2];
      if (ax >= blendInnerX && ax <= blendOuterX + 0.08 && y >= minYFrac * H && y <= 0.92 * H) {
        shYSum += y;
        shZSum += z;
        shN++;
      }
    }
    const shoulderY = shN > 0 ? shYSum / shN : 0.78 * H;
    const shoulderZ = shN > 0 ? shZSum / shN : 0;

    const dropRad = degToRad(dropDeg);
    const curlRad = degToRad(forwardCurlDeg);

    for (let v = 0; v < nVerts; v++) {
      const x = pos[v * 3];
      const y = pos[v * 3 + 1];
      const z = pos[v * 3 + 2];
      const ax = Math.abs(x);
      if (ax <= blendInnerX || y < (minYFrac - 0.06) * H) continue;

      const xWeight = smoothstep(blendInnerX, blendOuterX, ax);
      const yWeight = smoothstep((minYFrac - 0.06) * H, (minYFrac + 0.06) * H, y);
      const w = xWeight * yWeight;
      if (w <= 1e-4) continue;

      const side = x >= 0 ? 1 : -1;
      const sx = side * shoulderX;

      // Local arm coordinates with u >= 0 pointing outward along the arm.
      const u = (x - sx) * side;
      const dy = y - shoulderY;
      const dz = z - shoulderZ;

      const ang = dropRad * w;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);

      // Rotate arm downward from horizontal toward -Y.
      const uRot = u * ca + dy * sa;
      let yRot = -u * sa + dy * ca;
      let zRot = dz;

      // Gentle forward forearm/hand curl toward +Z past the elbow for an expressive club stance.
      const distOut = Math.hypot(Math.max(0, u), dy);
      if (curlRad > 0 && distOut > curlStartDist) {
        const cw = smoothstep(curlStartDist, curlStartDist + 0.22, distOut) * w;
        const cAng = curlRad * cw;
        const cc = Math.cos(cAng);
        const cs = Math.sin(cAng);
        // Pivot forearm forward (+Z) around elbow offset along lowered arm (fy < 0 swings toward +Z).
        const ey = -curlStartDist * Math.sin(dropRad);
        const fy = yRot - ey;
        const fz = zRot;
        yRot = ey + fy * cc + fz * cs;
        zRot = -fy * cs + fz * cc;
      }

      pos[v * 3] = sx + side * uRot;
      pos[v * 3 + 1] = shoulderY + yRot;
      pos[v * 3 + 2] = shoulderZ + zRot;
    }

    // Re-ground minY = 0 and preserve exact targetHeight after arm drop.
    const bAfter = computeBounds(pos);
    const reScale = spec.targetHeight / bAfter.span[1];
    const reMinY = bAfter.min[1];
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] *= reScale;
      pos[i + 1] = (pos[i + 1] - reMinY) * reScale;
      pos[i + 2] *= reScale;
    }
  }

  // 4. Preserve original OBJ UVs with standard glTF V-flip (1 - v).
  for (let i = 1; i < uvs.length; i += 2) {
    uvs[i] = 1 - uvs[i];
  }

  // 5. Guarantee outward winding (signedVol > 0).
  let signedVol = computeSignedVolume(pos, primIndices);
  if (signedVol < 0) {
    for (const indices of primIndices) {
      for (let i = 0; i < indices.length; i += 3) {
        const tmp = indices[i + 1];
        indices[i + 1] = indices[i + 2];
        indices[i + 2] = tmp;
      }
    }
    signedVol = -signedVol;
  }

  // 6. Compute smooth outward normals after all pose transforms.
  const normals = computeSmoothNormals(pos, primIndices);

  return {
    positions: pos,
    normals,
    uvs,
    primIndices,
    signedVol,
  };
}

// ============================================================================
// Texture preparation (downscale large Ghoul PNGs via macOS sips)
// ============================================================================

function prepareTexture(matSpec) {
  const srcPath = join(SRC_DIR, matSpec.srcTex);
  if (!existsSync(srcPath)) throw new Error(`Missing texture: ${srcPath}`);

  if (!matSpec.downscale) {
    return {
      buffer: readFileSync(srcPath),
      mimeType: 'image/png',
    };
  }

  mkdirSync(TEX_TMP_DIR, { recursive: true });
  const outPath = join(TEX_TMP_DIR, matSpec.tmpOut);
  execFileSync('sips', ['-Z', '512', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', srcPath, '--out', outPath], {
    stdio: 'pipe',
  });
  return {
    buffer: readFileSync(outPath),
    mimeType: 'image/jpeg',
  };
}

function readImageDimensions(buf, mimeType) {
  if (mimeType === 'image/png') {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
      if (buf[i] !== sig[i]) throw new Error('Invalid PNG signature');
    }
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (mimeType === 'image/jpeg') {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Invalid JPEG SOI');
    let off = 2;
    while (off + 8 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
      }
      const segLen = buf.readUInt16BE(off + 2);
      if (segLen < 2) break;
      off += 2 + segLen;
    }
    throw new Error('JPEG SOF marker not found');
  }
  throw new Error(`Unsupported mimeType: ${mimeType}`);
}

// ============================================================================
// Multi-primitive GLB 2.0 Packer
// ============================================================================

function pad4(buf) {
  const rem = buf.length % 4;
  return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem)]);
}

function buildGlb(processed, textures, spec) {
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
    const comps = type === 'SCALAR' ? 1 : type === 'VEC2' ? 2 : 3;
    const count = typed.length / comps;
    const acc = { bufferView: bvIdx, componentType, count, type };
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
  const UNSIGNED_SHORT = 5123;
  const UNSIGNED_INT = 5125;
  const FLOAT = 5126;

  const posAcc = pushAccessor(processed.positions, 'VEC3', FLOAT, ARRAY_BUFFER, true);
  const normAcc = pushAccessor(processed.normals, 'VEC3', FLOAT, ARRAY_BUFFER, false);
  const uvAcc = pushAccessor(processed.uvs, 'VEC2', FLOAT, ARRAY_BUFFER, false);

  const useU16 = processed.positions.length / 3 <= 65535;
  const primitives = [];
  for (let m = 0; m < processed.primIndices.length; m++) {
    const rawIdx = processed.primIndices[m];
    if (rawIdx.length === 0) continue;
    const idxTyped = useU16 ? new Uint16Array(rawIdx) : rawIdx;
    const idxAcc = pushAccessor(idxTyped, 'SCALAR', useU16 ? UNSIGNED_SHORT : UNSIGNED_INT, ELEMENT_ARRAY_BUFFER, false);
    primitives.push({
      attributes: {
        POSITION: posAcc,
        NORMAL: normAcc,
        TEXCOORD_0: uvAcc,
      },
      indices: idxAcc,
      material: m,
    });
  }

  const images = [];
  const gltfTextures = [];
  const materials = [];
  for (let m = 0; m < spec.materials.length; m++) {
    const ms = spec.materials[m];
    const tex = textures[m];
    const imgViewIdx = pushView(tex.buffer, undefined);
    images.push({ bufferView: imgViewIdx, mimeType: tex.mimeType });
    gltfTextures.push({ sampler: 0, source: m });
    materials.push({
      name: ms.name,
      pbrMetallicRoughness: {
        baseColorTexture: { index: m },
        baseColorFactor: [1, 1, 1, 1],
        roughnessFactor: ms.roughnessFactor,
        metallicFactor: ms.metallicFactor,
      },
      emissiveTexture: { index: m },
      emissiveFactor: ms.emissiveFactor,
      doubleSided: true,
    });
  }

  const gltf = {
    asset: { version: '2.0', generator: 'escape-berghain import-special-creatures.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: spec.out, mesh: 0 }],
    meshes: [{ name: spec.out, primitives }],
    materials,
    textures: gltfTextures,
    samplers: [
      {
        magFilter: 9729, // LINEAR
        minFilter: 9987, // LINEAR_MIPMAP_LINEAR
        wrapS: 10497, // REPEAT
        wrapT: 10497, // REPEAT
      },
    ],
    images,
    buffers: [{ byteLength: byteOffset }],
    bufferViews,
    accessors,
  };

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
// Verification via GLTFLoader
// ============================================================================

async function verifyGlb(glbPath, spec) {
  const buf = readFileSync(glbPath);

  // Verify embedded images and sampler config directly in the glTF JSON/BIN chunks.
  const jsonLen = buf.readUInt32LE(12);
  const gltfJson = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;

  const sampler = gltfJson.samplers[0];
  if (sampler.wrapS !== 10497 || sampler.wrapT !== 10497 || sampler.magFilter !== 9729 || sampler.minFilter !== 9987) {
    throw new Error(`${spec.out}: unexpected sampler settings`);
  }

  const texInfo = [];
  for (const img of gltfJson.images) {
    const bv = gltfJson.bufferViews[img.bufferView];
    const slice = buf.subarray(binStart + bv.byteOffset, binStart + bv.byteOffset + bv.byteLength);
    const dims = readImageDimensions(slice, img.mimeType);
    texInfo.push(`${dims.w}x${dims.h}(${img.mimeType.split('/')[1]})`);
  }

  // Parse with Three.js GLTFLoader (suppress expected headless-Node blob texture warning/error).
  const loader = new GLTFLoader();
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const origWarn = console.warn;
  const origErr = console.error;
  const filterBlob = (orig) => (...args) => {
    if (typeof args[0] === 'string' && args[0].includes("Couldn't load texture blob:")) return;
    orig(...args);
  };
  console.warn = filterBlob(origWarn);
  console.error = filterBlob(origErr);
  let gltf;
  try {
    gltf = await new Promise((resolve, reject) => {
      loader.parse(ab, '', resolve, reject);
    });
  } finally {
    console.warn = origWarn;
    console.error = origErr;
  }

  const meshes = [];
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });

  if (meshes.length !== spec.materials.length) {
    throw new Error(`${spec.out}: expected ${spec.materials.length} mesh primitive(s), got ${meshes.length}`);
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let totalTris = 0;
  let signedVol = 0;
  let uvMinU = Infinity, uvMaxU = -Infinity, uvMinV = Infinity, uvMaxV = -Infinity;
  let normalLenBad = 0;

  for (const mesh of meshes) {
    const posAttr = mesh.geometry.getAttribute('position');
    const normAttr = mesh.geometry.getAttribute('normal');
    const uvAttr = mesh.geometry.getAttribute('uv');
    const idxAttr = mesh.geometry.getIndex();
    if (!posAttr || !normAttr || !uvAttr || !idxAttr) {
      throw new Error(`${spec.out}: missing geometry attributes`);
    }

    const pArr = posAttr.array;
    const nArr = normAttr.array;
    for (let v = 0; v < posAttr.count; v++) {
      const x = pArr[v * 3], y = pArr[v * 3 + 1], z = pArr[v * 3 + 2];
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;

      const u = uvAttr.getX(v);
      const vv = uvAttr.getY(v);
      if (u < uvMinU) uvMinU = u;
      if (u > uvMaxU) uvMaxU = u;
      if (vv < uvMinV) uvMinV = vv;
      if (vv > uvMaxV) uvMaxV = vv;

      const nl = Math.hypot(nArr[v * 3], nArr[v * 3 + 1], nArr[v * 3 + 2]);
      if (Math.abs(nl - 1) > 0.05) normalLenBad++;
    }

    const idx = idxAttr.array;
    totalTris += idx.length / 3;
    for (let i = 0; i < idx.length; i += 3) {
      const ia = idx[i] * 3, ib = idx[i + 1] * 3, ic = idx[i + 2] * 3;
      const ax = pArr[ia], ay = pArr[ia + 1], az = pArr[ia + 2];
      const bx = pArr[ib], by = pArr[ib + 1], bz = pArr[ib + 2];
      const cx = pArr[ic], cy = pArr[ic + 1], cz = pArr[ic + 2];
      signedVol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    }
  }

  const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (Math.abs(span[1] - spec.targetHeight) > 0.02) {
    throw new Error(`${spec.out}: height ${span[1].toFixed(3)} != expected ${spec.targetHeight}`);
  }
  if (Math.abs(min[1]) > 0.01) {
    throw new Error(`${spec.out}: minY ${min[1].toFixed(4)} not grounded at 0`);
  }
  if (signedVol <= 0) {
    throw new Error(`${spec.out}: signedVol ${signedVol.toFixed(4)} <= 0 (inverted winding)`);
  }
  if (normalLenBad > 0) {
    throw new Error(`${spec.out}: ${normalLenBad} degenerate normals`);
  }
  if (uvMinU < -0.05 || uvMaxU > 1.05 || uvMinV < -0.05 || uvMaxV > 1.05) {
    throw new Error(`${spec.out}: UVs out of expected [0,1] range: u=[${uvMinU.toFixed(2)},${uvMaxU.toFixed(2)}] v=[${uvMinV.toFixed(2)},${uvMaxV.toFixed(2)}]`);
  }

  return {
    out: spec.out,
    prims: meshes.length,
    tris: totalTris,
    kb: buf.length / 1024,
    min,
    max,
    span,
    signedVol,
    texInfo: texInfo.join(' + '),
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = [];

  for (const spec of CREATURES) {
    const objPath = join(SRC_DIR, spec.obj);
    if (!existsSync(objPath)) throw new Error(`Missing OBJ: ${objPath}`);

    const parsed = parseObjMulti(objPath, spec.materials.length, spec.matIndexFor);
    const textures = spec.materials.map(prepareTexture);
    const processed = processCreature(parsed, spec);
    const glb = buildGlb(processed, textures, spec);

    const outPath = join(OUT_DIR, `${spec.out}.glb`);
    writeFileSync(outPath, glb);

    const v = await verifyGlb(outPath, spec);
    rows.push(v);
  }

  console.log('\n=== Rare Creature GLB Verification (4/4 passed) ===');
  console.log(
    'Model'.padEnd(16) +
      'Prims'.padStart(6) +
      'Tris'.padStart(7) +
      'Size'.padStart(8) +
      'Width(X)'.padStart(10) +
      'Height(Y)'.padStart(11) +
      'Depth(Z)'.padStart(10) +
      'MinY'.padStart(8) +
      '  Textures',
  );
  console.log('-'.repeat(106));
  for (const r of rows) {
    console.log(
      r.out.padEnd(16) +
        String(r.prims).padStart(6) +
        String(r.tris).padStart(7) +
        `${r.kb.toFixed(0)}KB`.padStart(8) +
        `${r.span[0].toFixed(2)}m`.padStart(10) +
        `${r.span[1].toFixed(2)}m`.padStart(11) +
        `${r.span[2].toFixed(2)}m`.padStart(10) +
        `${r.min[1].toFixed(3)}`.padStart(8) +
        `  ${r.texInfo}`,
    );
  }
}

main().catch((err) => {
  console.error('IMPORT FAILED:', err);
  process.exit(1);
});
