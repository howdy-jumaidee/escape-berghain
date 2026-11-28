// Original low-poly NPC figures for Escape Berghain.
// Run: node scripts/build-npc-models.mjs
// Writes public/models/npc_*.glb. The game loads them through placeModel(); a missing file stays a grey box.
//
// Loose inspiration only: early-2000s street-crowd silhouettes (street clothes, a loud shirt, bouncers,
// glam, leather) refit as a Berlin techno club. No third-party meshes, textures, or character names.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Color } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');

const HUMAN = { y: 1.8, z: 0.35 };
const HORSE = { y: 2.2, z: 0.45 };
const FOCUS = {
  bartender_bear: { y: 1.9, z: 0.5 },
  drag_oracle: { y: 2.15, z: 0.35 },
  rubber_knight: { y: 1.95, z: 0.42 },
  glitter_boy: { y: 1.7, z: 0.3 },
  leather_daddy: { y: 1.88, z: 0.42 },
};

function faceTarget(size) {
  return { eyeY: size.y - 0.32, faceZ: size.z / 2 };
}

class Figure {
  constructor() {
    /** @type {{ hex: number, metal: number, rough: number, positions: number[], indices: number[] }[]} */
    this.prims = [];
    this.cur = null;
  }

  /** @param {number} hex @param {number} metal @param {number} rough */
  use(hex, metal = 0.05, rough = 0.78) {
    const key = `${hex}|${metal}|${rough}`;
    let p = this.prims.find((x) => x.key === key);
    if (!p) {
      p = { key, hex, metal, rough, positions: [], indices: [] };
      this.prims.push(p);
    }
    this.cur = p;
    return this;
  }

  /** Box centred at (cx, cy, cz), size w×h×d. Outward faces, flat normals computed at export. */
  box(cx, cy, cz, w, h, d) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const y0 = cy - h / 2;
    const y1 = cy + h / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const q = (a, b, c, d) => this.#quad(a, b, c, d);
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    return this;
  }

  #quad(a, b, c, d) {
    const p = this.cur;
    const base = p.positions.length / 3;
    for (const v of [a, b, c, d]) p.positions.push(v[0], v[1], v[2]);
    p.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  toGlb() {
    const parts = [];
    let byte = 0;
    /** @type {Buffer[]} */
    const bins = [];
    const bufferViews = [];
    const accessors = [];
    const materials = [];
    const primitives = [];

    const pushBuf = (arr, target) => {
      const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
      const pad = (4 - (byte % 4)) % 4;
      if (pad) {
        bins.push(Buffer.alloc(pad));
        byte += pad;
      }
      const view = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset: byte, byteLength: buf.length, target });
      bins.push(buf);
      byte += buf.length;
      return view;
    };

    for (const prim of this.prims) {
      if (!prim.indices.length) continue;
      const pos = new Float32Array(prim.positions);
      const nrm = new Float32Array(pos.length);
      for (let i = 0; i < prim.indices.length; i += 3) {
        const ia = prim.indices[i] * 3;
        const ib = prim.indices[i + 1] * 3;
        const ic = prim.indices[i + 2] * 3;
        const ax = pos[ib] - pos[ia];
        const ay = pos[ib + 1] - pos[ia + 1];
        const az = pos[ib + 2] - pos[ia + 2];
        const bx = pos[ic] - pos[ia];
        const by = pos[ic + 1] - pos[ia + 1];
        const bz = pos[ic + 2] - pos[ia + 2];
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        for (const k of [ia, ib, ic]) {
          nrm[k] = nx;
          nrm[k + 1] = ny;
          nrm[k + 2] = nz;
        }
      }
      const idx = new Uint16Array(prim.indices);
      if (prim.indices.length / 3 > 65535) throw new Error('too many verts');
      let min = [Infinity, Infinity, Infinity];
      let max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], pos[i + k]);
          max[k] = Math.max(max[k], pos[i + k]);
        }
      }
      const pv = pushBuf(pos, 34962);
      const nv = pushBuf(nrm, 34962);
      const iv = pushBuf(idx, 34963);
      const pa = accessors.length;
      accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
      accessors.push({ bufferView: nv, componentType: 5126, count: nrm.length / 3, type: 'VEC3' });
      accessors.push({ bufferView: iv, componentType: 5123, count: idx.length, type: 'SCALAR' });
      const [r, g, b] = linear(prim.hex);
      const dark = r + g + b < 0.08;
      materials.push({
        pbrMetallicRoughness: {
          baseColorFactor: [r, g, b, 1],
          metallicFactor: prim.metal,
          roughnessFactor: prim.rough,
        },
        emissiveFactor: dark ? [0.012, 0.012, 0.015] : [r * 0.025, g * 0.025, b * 0.025],
      });
      primitives.push({
        attributes: { POSITION: pa, NORMAL: pa + 1 },
        indices: pa + 2,
        material: materials.length - 1,
        mode: 4,
      });
    }

    const bin = Buffer.concat(bins);
    const json = {
      asset: { version: '2.0', generator: 'escape-berghain-npc' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'npc', mesh: 0 }],
      meshes: [{ primitives }],
      materials,
      accessors,
      bufferViews,
      buffers: [{ byteLength: bin.length }],
    };
    const jsonBuf = Buffer.from(JSON.stringify(json));
    const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
    const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4, 0);
    const jsonChunk = Buffer.concat([jsonBuf, jsonPad]);
    const binChunk = Buffer.concat([bin, binPad]);
    const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(total, 8);
    const jh = Buffer.alloc(8);
    jh.writeUInt32LE(jsonChunk.length, 0);
    jh.writeUInt32LE(0x4e4f534a, 4);
    const bh = Buffer.alloc(8);
    bh.writeUInt32LE(binChunk.length, 0);
    bh.writeUInt32LE(0x004e4942, 4);
    return Buffer.concat([header, jh, jsonChunk, bh, binChunk]);
  }
}

function linear(hex) {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

function assertOutwardBox() {
  const f = new Figure();
  f.use(0xffffff).box(0, 0, 0, 1, 1, 1);
  const p = f.prims[0];
  let up = 0;
  for (let i = 0; i < p.indices.length; i += 3) {
    const a = p.indices[i] * 3;
    const b = p.indices[i + 1] * 3;
    const c = p.indices[i + 2] * 3;
    const pos = p.positions;
    const ax = pos[b] - pos[a];
    const ay = pos[b + 1] - pos[a + 1];
    const az = pos[b + 2] - pos[a + 2];
    const bx = pos[c] - pos[a];
    const by = pos[c + 1] - pos[a + 1];
    const bz = pos[c + 2] - pos[a + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const mx = (pos[a] + pos[b] + pos[c]) / 3;
    const my = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3;
    const mz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    if (nx * mx + ny * my + nz * mz > 0) up++;
  }
  if (up !== 12) throw new Error(`box winding failed (${up}/12 outward)`);
}

/**
 * Shared upright body. Head is human or an equine (horse, unicorn, donkey).
 * eyeY / faceZ match the conversation camera (size.y - 0.32, size.z / 2).
 */
function buildPerson(opt) {
  const f = new Figure();
  const eyeY = opt.eyeY;
  const faceZ = opt.faceZ;
  const bulk = opt.bulk ?? 1;
  const shoulderW = 0.42 * bulk;
  const hipW = 0.3 * bulk;
  const depth = Math.min(0.24, Math.max(0.15, faceZ * 0.85));
  const hipY = eyeY * 0.5;
  const shoulderY = eyeY - 0.16;
  const torsoH = Math.max(0.28, shoulderY - hipY);
  const chestY = hipY + torsoH * 0.55;
  const skin = opt.skin;
  const hair = opt.hair;
  const top = opt.top;
  const bottom = opt.bottom;
  const shoes = opt.shoes;
  const metal = opt.metal ?? 0.08;
  const rough = opt.rough ?? 0.72;

  f.use(shoes, 0.1, 0.55);
  f.box(-hipW * 0.38, 0.035, 0.03, 0.12, 0.07, 0.22);
  f.box(hipW * 0.38, 0.035, 0.03, 0.12, 0.07, 0.22);

  const legTop = opt.outfit === 'dress' ? hipY + 0.02 : hipY;
  f.use(opt.outfit === 'dress' ? top : bottom, metal, rough);
  if (opt.outfit === 'dress') {
    f.box(0, legTop * 0.45, 0, hipW * 1.15, legTop * 0.9, depth * 1.15);
    f.box(0, legTop * 0.15, 0, hipW * 1.7, legTop * 0.28, depth * 1.5);
  } else {
    f.box(-hipW * 0.36, legTop * 0.5, 0, 0.12 * Math.min(bulk, 1.3), legTop, 0.13);
    f.box(hipW * 0.36, legTop * 0.5, 0, 0.12 * Math.min(bulk, 1.3), legTop, 0.13);
    f.box(0, hipY, 0, hipW, 0.14, depth);
  }

  if (opt.outfit === 'harness' || opt.outfit === 'rubber') {
    f.use(opt.outfit === 'rubber' ? top : skin, opt.outfit === 'rubber' ? 0.65 : 0.02, opt.outfit === 'rubber' ? 0.28 : 0.8);
    f.box(0, chestY, 0, shoulderW * 0.78, torsoH, depth * 0.92);
  } else {
    f.use(top, metal, rough);
    f.box(0, chestY, 0, shoulderW * 0.86, torsoH, depth);
  }
  f.use(top, metal, rough);
  f.box(0, shoulderY, 0, shoulderW, 0.1, depth * 0.85);

  if (opt.outfit === 'harness') {
    f.use(0x0c0c0e, 0.45, 0.4);
    f.box(-0.06, chestY, depth * 0.42, 0.035, torsoH * 0.85, 0.03);
    f.box(0.06, chestY, depth * 0.42, 0.035, torsoH * 0.85, 0.03);
    f.box(0, shoulderY - 0.04, depth * 0.42, shoulderW * 0.7, 0.03, 0.03);
  }
  if (opt.outfit === 'suit') {
    f.use(0xd8d4cc, 0.02, 0.7);
    f.box(0, chestY + 0.02, depth * 0.48, 0.1, torsoH * 0.55, 0.02);
    f.use(0x6a1a2a, 0.1, 0.5);
    f.box(0, chestY - 0.02, depth * 0.5, 0.045, torsoH * 0.5, 0.015);
  }
  if (opt.outfit === 'apron') {
    f.use(0xf2efe6, 0.02, 0.85);
    f.box(0, chestY - 0.04, depth * 0.55, shoulderW * 0.7, torsoH * 0.9, 0.03);
  }
  if (opt.pads) {
    f.use(opt.accent ?? top, 0.2, 0.45);
    f.box(-shoulderW * 0.48, shoulderY + 0.02, 0, 0.14, 0.08, depth * 0.7);
    f.box(shoulderW * 0.48, shoulderY + 0.02, 0, 0.14, 0.08, depth * 0.7);
  }

  const armH = torsoH * 0.95;
  const armMat = opt.outfit === 'rubber' ? top : skin;
  f.use(armMat, opt.outfit === 'rubber' ? 0.65 : 0.02, opt.outfit === 'rubber' ? 0.28 : 0.82);
  f.box(-shoulderW * 0.56, shoulderY - armH * 0.45, 0, 0.09, armH, 0.09);
  f.box(shoulderW * 0.56, shoulderY - armH * 0.45, 0, 0.09, armH, 0.09);

  if (opt.head === 'human' || !opt.head) humanHead(f, opt, eyeY, faceZ, skin, hair);
  else equineHead(f, opt.head, eyeY, faceZ, opt.coat, opt.mane);

  for (const extra of opt.extras ?? []) extra(f, { eyeY, faceZ, shoulderW, depth, chestY, shoulderY });
  return f;
}

function humanHead(f, opt, eyeY, faceZ, skin, hair) {
  const headW = 0.23;
  const headH = 0.25;
  const headD = 0.2;
  const cy = eyeY + 0.02;
  const cz = faceZ - headD / 2 + 0.01;
  f.use(skin, 0.02, 0.8);
  f.box(0, shoulderYSafe(eyeY) + 0.06, cz * 0.4, 0.09, 0.1, 0.09);
  f.box(0, cy, cz, headW, headH, headD);
  f.box(0, eyeY - 0.05, faceZ + 0.02, 0.04, 0.045, 0.04);
  f.use(0xf4f4f4, 0, 0.4);
  f.box(-0.05, eyeY, faceZ + 0.012, 0.038, 0.028, 0.016);
  f.box(0.05, eyeY, faceZ + 0.012, 0.038, 0.028, 0.016);
  f.use(0x141414, 0, 0.35);
  f.box(-0.05, eyeY, faceZ + 0.022, 0.016, 0.016, 0.01);
  f.box(0.05, eyeY, faceZ + 0.022, 0.016, 0.016, 0.01);
  f.box(0, eyeY - 0.09, faceZ + 0.012, 0.05, 0.012, 0.012);

  const style = opt.hairStyle ?? 'crop';
  if (style === 'bald') return;
  f.use(hair, style === 'hood' ? 0.2 : 0.05, style === 'hood' ? 0.45 : 0.7);
  if (style === 'crop' || style === 'mohawk') {
    f.box(0, cy + headH * 0.42, cz - 0.01, style === 'mohawk' ? 0.05 : headW * 0.96, 0.08, headD * 0.9);
    if (style === 'mohawk') f.box(0, cy + headH * 0.7, cz, 0.04, 0.16, 0.06);
  } else if (style === 'long') {
    f.box(0, cy + 0.08, cz - 0.02, headW, 0.1, headD);
    f.box(-headW * 0.48, cy - 0.06, cz, 0.06, 0.28, headD * 0.8);
    f.box(headW * 0.48, cy - 0.06, cz, 0.06, 0.28, headD * 0.8);
    f.box(0, cy - 0.02, cz - headD * 0.4, headW * 0.8, 0.32, 0.06);
  } else if (style === 'bun') {
    f.box(0, cy + 0.08, cz, headW * 0.9, 0.07, headD * 0.85);
    f.box(0, cy + 0.02, cz - headD * 0.45, 0.1, 0.1, 0.1);
  } else if (style === 'wig') {
    f.box(0, cy + 0.16, cz, 0.32, 0.22, 0.28);
    f.box(-0.14, cy - 0.02, cz, 0.08, 0.36, 0.12);
    f.box(0.14, cy - 0.02, cz, 0.08, 0.36, 0.12);
  } else if (style === 'cap') {
    f.box(0, cy + headH * 0.4, cz + 0.01, headW * 1.05, 0.07, headD * 1.05);
    f.box(0, cy + headH * 0.28, cz + headD * 0.35, headW * 0.7, 0.03, 0.08);
  } else if (style === 'hood') {
    f.box(0, cy + 0.06, cz - 0.02, headW + 0.08, headH + 0.06, headD * 0.7);
    f.box(-headW * 0.52, cy, cz, 0.06, headH, headD);
    f.box(headW * 0.52, cy, cz, 0.06, headH, headD);
  } else if (style === 'grey') {
    f.box(0, cy + 0.1, cz, headW, 0.08, headD * 0.95);
  }
  if (opt.beard) {
    f.use(hair, 0.04, 0.75);
    f.box(0, eyeY - 0.12, faceZ + 0.01, 0.12, 0.08, 0.06);
  }
}

function shoulderYSafe(eyeY) {
  return eyeY - 0.16;
}

function equineHead(f, kind, eyeY, faceZ, coat = 0x6a4324, mane = 0x16120e) {
  const cy = eyeY + 0.02;
  const cz = faceZ - 0.08;
  f.use(coat, 0.06, 0.72);
  f.box(0, shoulderYSafe(eyeY) + 0.05, cz * 0.35, 0.12, 0.16, 0.12);
  f.box(0, cy, cz, kind === 'donkey' ? 0.22 : 0.2, 0.2, 0.22);
  const snoutD = kind === 'donkey' ? 0.12 : 0.18;
  f.box(0, eyeY - 0.07, faceZ + snoutD * 0.35, kind === 'donkey' ? 0.12 : 0.1, 0.08, snoutD);
  f.use(0xf4f4f4, 0, 0.4);
  f.box(-0.05, eyeY, faceZ + 0.01, 0.04, 0.03, 0.016);
  f.box(0.05, eyeY, faceZ + 0.01, 0.04, 0.03, 0.016);
  f.use(0x141414, 0, 0.4);
  f.box(-0.05, eyeY, faceZ + 0.02, 0.016, 0.016, 0.01);
  f.box(0.05, eyeY, faceZ + 0.02, 0.016, 0.016, 0.01);
  f.use(mane, 0.08, 0.65);
  const earH = kind === 'donkey' ? 0.3 : 0.14;
  f.box(-0.07, cy + 0.16, cz, 0.04, earH, 0.05);
  f.box(0.07, cy + 0.16, cz, 0.04, earH, 0.05);
  f.box(0, cy + 0.08, cz - 0.08, 0.08, 0.14, 0.08);
  if (kind === 'unicorn') {
    f.use(0xf6e7a8, 0.35, 0.35);
    f.box(0, cy + 0.2, faceZ - 0.02, 0.045, 0.12, 0.045);
    f.box(0, cy + 0.32, faceZ - 0.02, 0.028, 0.12, 0.028);
    f.box(0, cy + 0.42, faceZ - 0.02, 0.014, 0.08, 0.014);
  }
}

function glasses(f, eyeY, faceZ) {
  f.use(0x1a1a1a, 0.4, 0.25);
  f.box(-0.05, eyeY, faceZ + 0.035, 0.055, 0.04, 0.012);
  f.box(0.05, eyeY, faceZ + 0.035, 0.055, 0.04, 0.012);
  f.box(0, eyeY, faceZ + 0.03, 0.03, 0.012, 0.012);
}

function chain(f, chestY, faceZ) {
  f.use(0xd4b15a, 0.8, 0.3);
  f.box(0, chestY, faceZ + 0.02, 0.16, 0.02, 0.02);
  f.box(0, chestY - 0.08, faceZ + 0.02, 0.1, 0.02, 0.02);
}

function lasso(f, eyeY, faceZ) {
  f.use(0xc4a46a, 0.15, 0.6);
  const y = eyeY - 0.45;
  const z = faceZ + 0.22;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    f.box(Math.cos(a) * 0.16, y + Math.sin(a) * 0.16, z, 0.035, 0.035, 0.035);
  }
}

const cast = [
  {
    file: 'npc_friday_guy',
    ...faceTarget(HUMAN),
    bulk: 1.02,
    skin: 0xc48a6a,
    hair: 0x1a120e,
    hairStyle: 'crop',
    top: 0x121216,
    bottom: 0x101014,
    shoes: 0x0c0c0e,
    outfit: 'harness',
    metal: 0.35,
    rough: 0.42,
  },
  {
    file: 'npc_tourists',
    ...faceTarget(HUMAN),
    skin: 0xf0c8a8,
    hair: 0x6b4528,
    hairStyle: 'long',
    top: 0xd5d0c8,
    bottom: 0x3a4d72,
    shoes: 0xe8e8e8,
    outfit: 'jacket',
    rough: 0.8,
  },
  {
    file: 'npc_tourists_1',
    ...faceTarget(HUMAN),
    skin: 0xe0b090,
    hair: 0x2a2118,
    hairStyle: 'crop',
    top: 0xc4473a,
    bottom: 0x3a4d72,
    shoes: 0xf0f0f0,
    outfit: 'shirt',
    extras: [(f, a) => chain(f, a.chestY, a.faceZ)],
  },
  {
    file: 'npc_coat_check',
    ...faceTarget(HUMAN),
    skin: 0xd0a888,
    hair: 0x1c140f,
    hairStyle: 'bun',
    top: 0x141418,
    bottom: 0x101014,
    shoes: 0x0c0c0e,
    outfit: 'harness',
    metal: 0.3,
    rough: 0.45,
  },
  {
    file: 'npc_philosopher',
    ...faceTarget(HUMAN),
    bulk: 0.86,
    skin: 0xd2c2ae,
    hair: 0x3a342c,
    hairStyle: 'crop',
    top: 0x1a1c28,
    bottom: 0x14141a,
    shoes: 0x101014,
    outfit: 'jacket',
    extras: [(f, a) => glasses(f, a.eyeY, a.faceZ)],
  },
  {
    file: 'npc_bouncer',
    ...faceTarget(HUMAN),
    bulk: 1.45,
    skin: 0x6b4632,
    hair: 0x111,
    hairStyle: 'bald',
    top: 0x0e0e10,
    bottom: 0x0c0c0e,
    shoes: 0x080808,
    outfit: 'jacket',
    metal: 0.2,
    rough: 0.5,
  },
  {
    file: 'npc_security',
    eyeY: 1.85 - 0.32,
    faceZ: 0.2,
    bulk: 1.15,
    skin: 0xc49a78,
    hair: 0x1a120e,
    hairStyle: 'cap',
    top: 0x141820,
    bottom: 0x101216,
    shoes: 0x0c0c0e,
    outfit: 'jacket',
  },
  {
    file: 'npc_leather_choir',
    ...faceTarget(HUMAN),
    skin: 0xb88868,
    hair: 0x120e0c,
    hairStyle: 'cap',
    top: 0x0a0a0c,
    bottom: 0x08080a,
    shoes: 0x070708,
    outfit: 'harness',
    metal: 0.5,
    rough: 0.35,
  },
  {
    file: 'npc_leather_daddy',
    ...faceTarget(FOCUS.leather_daddy),
    bulk: 1.25,
    skin: 0xa87858,
    hair: 0x1a120e,
    hairStyle: 'cap',
    beard: true,
    top: 0x0b0b0d,
    bottom: 0x09090b,
    shoes: 0x070708,
    outfit: 'harness',
    metal: 0.5,
    rough: 0.34,
    extras: [(f, a) => chain(f, a.chestY, a.faceZ)],
  },
  {
    file: 'npc_bartender_bear',
    ...faceTarget(FOCUS.bartender_bear),
    bulk: 1.55,
    skin: 0xc49068,
    hair: 0x2a1c12,
    hairStyle: 'crop',
    beard: true,
    top: 0x16161a,
    bottom: 0x121216,
    shoes: 0x0c0c0e,
    outfit: 'shirt',
    extras: [(f, a) => chain(f, a.chestY, a.faceZ)],
  },
  {
    file: 'npc_drag_oracle',
    ...faceTarget(FOCUS.drag_oracle),
    bulk: 0.92,
    skin: 0xf0c0a8,
    hair: 0xc81e8c,
    hairStyle: 'wig',
    top: 0x3a1030,
    bottom: 0x3a1030,
    shoes: 0x1a0a14,
    outfit: 'dress',
    pads: true,
    accent: 0xe24aa0,
    metal: 0.25,
    rough: 0.4,
  },
  {
    file: 'npc_rubber_knight',
    ...faceTarget(FOCUS.rubber_knight),
    bulk: 1.12,
    skin: 0x1a1c20,
    hair: 0x111418,
    hairStyle: 'bald',
    top: 0x14161c,
    bottom: 0x101216,
    shoes: 0x0c0e12,
    outfit: 'rubber',
    metal: 0.72,
    rough: 0.22,
  },
  {
    file: 'npc_old_raver',
    ...faceTarget(HUMAN),
    bulk: 0.95,
    skin: 0xc8b09a,
    hair: 0xb8b8b8,
    hairStyle: 'grey',
    top: 0x2a2a24,
    bottom: 0x1a1a18,
    shoes: 0x141410,
    outfit: 'jacket',
    metal: 0.15,
    rough: 0.7,
  },
  {
    file: 'npc_glitter_boy',
    ...faceTarget(FOCUS.glitter_boy),
    bulk: 0.82,
    skin: 0xf3d2b8,
    hair: 0xe8e0c8,
    hairStyle: 'crop',
    top: 0xd8d4ee,
    bottom: 0x1a1a22,
    shoes: 0xf0f0f0,
    outfit: 'shirt',
    metal: 0.45,
    rough: 0.32,
    extras: [(f, a) => chain(f, a.chestY, a.faceZ)],
  },
  {
    file: 'npc_darkroom_keeper',
    ...faceTarget(HUMAN),
    skin: 0x8a7060,
    hair: 0x07070a,
    hairStyle: 'hood',
    top: 0x08080c,
    bottom: 0x060608,
    shoes: 0x050506,
    outfit: 'jacket',
  },
  {
    file: 'npc_lighting_tech',
    ...faceTarget(HUMAN),
    skin: 0xc49878,
    hair: 0x221810,
    hairStyle: 'crop',
    top: 0x1a1a1e,
    bottom: 0x141418,
    shoes: 0x101012,
    outfit: 'shirt',
    extras: [
      (f, a) => {
        f.use(0x22262c, 0.4, 0.4);
        f.box(0, a.eyeY + 0.08, a.faceZ - 0.02, 0.2, 0.03, 0.04);
        f.box(0.1, a.eyeY + 0.04, a.faceZ, 0.03, 0.08, 0.03);
      },
    ],
  },
  {
    file: 'npc_cleaner',
    ...faceTarget(HUMAN),
    skin: 0xd0a888,
    hair: 0x3a3028,
    hairStyle: 'bun',
    top: 0x2a5a8a,
    bottom: 0x243848,
    shoes: 0x1a1a1c,
    outfit: 'shirt',
    rough: 0.85,
  },
  {
    file: 'npc_riddle_horse',
    ...faceTarget(HORSE),
    bulk: 1.05,
    skin: 0xc4a080,
    hair: 0x1a120e,
    top: 0x3d2a1e,
    bottom: 0x241810,
    shoes: 0x14100e,
    outfit: 'harness',
    head: 'horse',
    coat: 0x6a4324,
    mane: 0x140e0c,
    metal: 0.3,
    rough: 0.48,
  },
  {
    file: 'npc_patrick',
    ...faceTarget(HORSE),
    skin: 0xd8c8b0,
    hair: 0x6a6458,
    top: 0x6d6a5a,
    bottom: 0x4a483e,
    shoes: 0x2a2820,
    outfit: 'suit',
    head: 'horse',
    coat: 0x8a7d68,
    mane: 0x3a3428,
    extras: [(f, a) => glasses(f, a.eyeY, a.faceZ)],
  },
  {
    file: 'npc_herd',
    ...faceTarget(HORSE),
    skin: 0xb89878,
    hair: 0x111,
    top: 0x16161a,
    bottom: 0x101014,
    shoes: 0x0c0c0e,
    outfit: 'harness',
    head: 'horse',
    coat: 0x4a3020,
    mane: 0x12100e,
    metal: 0.4,
    rough: 0.4,
  },
  {
    file: 'npc_herd_1',
    ...faceTarget(HORSE),
    bulk: 0.96,
    skin: 0xf0e6dc,
    hair: 0xddd,
    top: 0xc8ccd4,
    bottom: 0x1a1c22,
    shoes: 0xe8e8ee,
    outfit: 'harness',
    head: 'unicorn',
    coat: 0xf3f0ea,
    mane: 0xd9d4ea,
    metal: 0.55,
    rough: 0.32,
  },
  {
    file: 'npc_herd_2',
    ...faceTarget(HORSE),
    bulk: 1.12,
    skin: 0xc8b8a4,
    hair: 0x333,
    top: 0xd24a3a,
    bottom: 0x3a4d72,
    shoes: 0x222,
    outfit: 'shirt',
    head: 'donkey',
    coat: 0x8e8e94,
    mane: 0x2a2a2e,
    extras: [(f, a) => chain(f, a.chestY, a.faceZ)],
  },
  {
    file: 'npc_ice_cream_horse',
    ...faceTarget(HORSE),
    skin: 0xf0e0d0,
    hair: 0xeee,
    top: 0xf4f0ea,
    bottom: 0xe4d8cc,
    shoes: 0xf8f8f8,
    outfit: 'apron',
    head: 'horse',
    coat: 0xe6d7c4,
    mane: 0xf2f2f2,
    extras: [
      (f, a) => {
        f.use(0xf2c6d8, 0.05, 0.5);
        f.box(a.shoulderW * 0.4, a.chestY - 0.15, a.faceZ + 0.12, 0.08, 0.16, 0.08);
        f.use(0xd8d8d8, 0.1, 0.4);
        f.box(a.shoulderW * 0.4, a.chestY - 0.28, a.faceZ + 0.12, 0.035, 0.12, 0.035);
      },
    ],
  },
  {
    file: 'npc_spirit_guide',
    eyeY: 0.74,
    faceZ: 0.1,
    bulk: 0.85,
    skin: 0xd7ecff,
    hair: 0xeef7ff,
    hairStyle: 'long',
    top: 0xc5e4ff,
    bottom: 0xb7d4ef,
    shoes: 0xc5e4ff,
    outfit: 'shirt',
    metal: 0.05,
    rough: 0.35,
  },
  {
    file: 'npc_animal_control',
    ...faceTarget(HUMAN),
    bulk: 1.08,
    skin: 0xd0a888,
    hair: 0x2a241c,
    hairStyle: 'cap',
    top: 0xf0d23a,
    bottom: 0x243040,
    shoes: 0x1a1a1c,
    outfit: 'jacket',
    rough: 0.7,
    extras: [(f, a) => lasso(f, a.eyeY, a.faceZ)],
  },
];

assertOutwardBox();
mkdirSync(OUT, { recursive: true });

const loader = new GLTFLoader();
let failed = 0;
for (const spec of cast) {
  const figure = buildPerson(spec);
  const glb = figure.toGlb();
  const path = join(OUT, `${spec.file}.glb`);
  writeFileSync(path, glb);
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  await new Promise((resolve, reject) => {
    loader.parse(
      ab,
      '',
      (gltf) => {
        gltf.scene.updateWorldMatrix(true, true);
        const box = { minY: Infinity, maxY: -Infinity, maxX: 0 };
        gltf.scene.traverse((o) => {
          const pos = o.geometry?.attributes?.position;
          if (!pos) return;
          for (let i = 0; i < pos.count; i++) {
            box.minY = Math.min(box.minY, pos.getY(i));
            box.maxY = Math.max(box.maxY, pos.getY(i));
            box.maxX = Math.max(box.maxX, Math.abs(pos.getX(i)));
          }
        });
        const h = box.maxY - box.minY;
        if (box.minY < -0.05 || box.maxY < 0.5 || h > 2.6 || box.maxX > 1.4) {
          failed++;
          console.error(`${spec.file} bounds y ${box.minY.toFixed(2)}..${box.maxY.toFixed(2)} x±${box.maxX.toFixed(2)}`);
        } else {
          console.log(`${spec.file}  ${h.toFixed(2)} m  ${glb.length} B`);
        }
        resolve();
      },
      reject,
    );
  });
}
if (failed) {
  console.error(`${failed} figures out of range`);
  process.exit(1);
}
console.log(`wrote ${cast.length} figures`);
