// Original early-2000s PS2-style / horsey Berlin club-inspired low-poly NPC figures for Escape Berghain.
// Run: node scripts/build-npc-models.mjs
// Writes public/models/npc_*.glb. The game loads them through placeModel(); a missing file stays a grey box.
//
// Features:
// - Pure-Node PNG encoder (zlib.deflateSync) embedding crisp 64x64 retro PS2 textures inside each GLB.
// - Tapered/faceted low-poly silhouettes (frustums, angled collars/lapels, tapered limbs, wedge shoes, chiseled heads).
// - Sculpted, unmistakable Horse, Donkey (splayed long ears + pale muzzle), and shimmering Unicorn heads.
// - Articulated limb pivots (body, head, armL, armR, legL, legR) matched to src/npc/index.ts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { Color, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Allow GLTFLoader's image path to fail gracefully in headless Node (we also verify every PNG directly).
globalThis.self ??= globalThis;

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

// ============================================================================
// Pure-Node PNG Encoder & Verifier
// ============================================================================

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tag = Buffer.from(type, 'ascii');
  const body = Buffer.concat([tag, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB (opaque, 25% smaller & better deflate than RGBA)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOut = y * (stride + 1);
    raw[rowOut] = 1; // PNG Sub filter for crisp horizontal runs
    let pr = 0;
    let pg = 0;
    let pb = 0;
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      // Subtle PS2 6-bit color quantization (step 4) keeps retro look crisp & PNGs tiny!
      const r = rgba[si] & 0xfc;
      const g = rgba[si + 1] & 0xfc;
      const b = rgba[si + 2] & 0xfc;
      const di = rowOut + 1 + x * 3;
      raw[di] = (r - pr) & 0xff;
      raw[di + 1] = (g - pg) & 0xff;
      raw[di + 2] = (b - pb) & 0xff;
      pr = r;
      pg = g;
      pb = b;
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function verifyPngBuffer(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error('Invalid PNG signature');
  }
  let off = 8;
  let w = 0;
  let h = 0;
  let colorType = 0;
  const idats = [];
  let sawEnd = false;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('ascii');
    const data = buf.subarray(off + 8, off + 8 + len);
    const expectedCrc = buf.readUInt32BE(off + 8 + len);
    const actualCrc = crc32(buf.subarray(off + 4, off + 8 + len));
    if (expectedCrc !== actualCrc) throw new Error(`PNG CRC mismatch in ${type}`);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      sawEnd = true;
    }
    off += 12 + len;
  }
  if (!sawEnd || w <= 0 || h <= 0) throw new Error('Malformed PNG chunks');
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`Unexpected PNG colorType ${colorType}`);
  const inflated = inflateSync(Buffer.concat(idats));
  if (inflated.length !== (w * bpp + 1) * h) throw new Error('PNG decompressed size mismatch');
}

// ============================================================================
// Retro 64x64 Pixel Texture Painter (PS2 Aesthetic)
// ============================================================================

function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function shadeHex(hex, mul, add = 0) {
  const [r, g, b] = hexToRgb(hex);
  const nr = clampByte(r * mul + add);
  const ng = clampByte(g * mul + add);
  const nb = clampByte(b * mul + add);
  return (nr << 16) | (ng << 8) | nb;
}

function mixHex(a, b, t) {
  const [r0, g0, b0] = hexToRgb(a);
  const [r1, g1, b1] = hexToRgb(b);
  const r = clampByte(r0 + (r1 - r0) * t);
  const g = clampByte(g0 + (g1 - g0) * t);
  const bl = clampByte(b0 + (b1 - b0) * t);
  return (r << 16) | (g << 8) | bl;
}

class TexCanvas {
  constructor(w = 64, h = 64) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4);
  }

  px(x, y, hex, alpha = 255) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    const i = (iy * this.w + ix) * 4;
    const [r, g, b] = hexToRgb(hex);
    if (alpha >= 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    } else if (alpha > 0) {
      const a = alpha / 255;
      const ia = 1 - a;
      this.data[i] = clampByte(r * a + this.data[i] * ia);
      this.data[i + 1] = clampByte(g * a + this.data[i + 1] * ia);
      this.data[i + 2] = clampByte(b * a + this.data[i + 2] * ia);
      this.data[i + 3] = 255;
    }
  }

  fill(hex) {
    const [r, g, b] = hexToRgb(hex);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    }
    return this;
  }

  rect(x, y, w, h, hex, alpha = 255) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.px(xx, yy, hex, alpha);
    }
    return this;
  }

  gradV(y0, y1, hex0, hex1, alpha = 255) {
    const start = Math.max(0, Math.floor(y0));
    const end = Math.min(this.h, Math.ceil(y1));
    const span = Math.max(1, end - start - 1);
    for (let y = start; y < end; y++) {
      const c = mixHex(hex0, hex1, (y - start) / span);
      for (let x = 0; x < this.w; x++) this.px(x, y, c, alpha);
    }
    return this;
  }

  ellipse(cx, cy, rx, ry, hex, alpha = 255) {
    const x0 = Math.max(0, Math.floor(cx - rx - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx + 1));
    const y0 = Math.max(0, Math.floor(cy - ry - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / Math.max(0.5, rx);
        const dy = (y - cy) / Math.max(0.5, ry);
        if (dx * dx + dy * dy <= 1) this.px(x, y, hex, alpha);
      }
    }
    return this;
  }

  line(x0, y0, x1, y1, hex, thick = 1, alpha = 255) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    const r = Math.max(0, (thick - 1) * 0.5);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (r <= 0.4) this.px(x, y, hex, alpha);
      else this.ellipse(x, y, r + 0.3, r + 0.3, hex, alpha);
    }
    return this;
  }

  noise(strength = 6, seed = 1337) {
    // Classic PS2 2x2 ordered subtle dither/grain: authentic retro feel + compresses tightly in PNG
    const bayer = [
      [-0.75, 0.25],
      [0.75, -0.25],
    ];
    const phase = seed & 1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const d = bayer[(y + phase) & 1][(x + phase) & 1] * strength;
        const i = (y * this.w + x) * 4;
        this.data[i] = clampByte(this.data[i] + d);
        this.data[i + 1] = clampByte(this.data[i + 1] + d);
        this.data[i + 2] = clampByte(this.data[i + 2] + d);
      }
    }
    return this;
  }

  /** Subtle PS2 baked side/bottom ambient shading for cloth folds & depth. */
  bakeClothShading(strength = 0.22) {
    for (let y = 0; y < this.h; y++) {
      const vShade = 1 - Math.abs(y / this.h - 0.38) * strength * 0.65;
      for (let x = 0; x < this.w; x++) {
        const edge = Math.abs(x / this.w - 0.5) * 2;
        const hShade = 1 - edge * edge * strength;
        const m = vShade * hShade;
        const i = (y * this.w + x) * 4;
        this.data[i] = clampByte(this.data[i] * m);
        this.data[i + 1] = clampByte(this.data[i + 1] * m);
        this.data[i + 2] = clampByte(this.data[i + 2] * m);
      }
    }
    return this;
  }

  palmLeaf(cx, cy, scale, angle, hex) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const x1 = cx + ca * scale;
    const y1 = cy + sa * scale;
    this.line(cx, cy, x1, y1, hex, 1.5);
    for (let i = 1; i <= 5; i++) {
      const t = i / 5.5;
      const bx = cx + ca * scale * t;
      const by = cy + sa * scale * t;
      const frondLen = scale * (0.55 - Math.abs(t - 0.5) * 0.45);
      for (const side of [-1, 1]) {
        const fa = angle + side * 1.05;
        this.line(bx, by, bx + Math.cos(fa) * frondLen, by + Math.sin(fa) * frondLen, hex, 1.2);
      }
    }
    return this;
  }

  toPng() {
    return encodePng(this.w, this.h, this.data);
  }
}

// ============================================================================
// Procedural PS2 Texture Generators
// ============================================================================

function makeHumanFaceTex(opt) {
  const c = new TexCanvas(64, 64);
  const skin = opt.skin;
  const hair = opt.hair ?? 0x1a1410;
  const darkSkin = shadeHex(skin, 0.72);
  const midShadow = shadeHex(skin, 0.84);
  const hiSkin = shadeHex(skin, 1.12, 8);
  const faceStyle = opt.faceStyle ?? 'normal';

  if (faceStyle === 'mask') {
    // Sleek glossy rubber/latex mask with seam lines, eye slits, breathing vent
    c.gradV(0, 64, 0x222630, 0x0b0d12);
    c.ellipse(32, 16, 20, 10, 0x3b4252, 85); // forehead sheen
    c.line(32, 0, 32, 64, 0x485060, 1, 180); // center latex seam
    c.line(12, 0, 16, 64, 0x323846, 1, 120);
    c.line(52, 0, 48, 64, 0x323846, 1, 120);
    // Eye cutouts with subtle glint
    c.ellipse(20, 27, 7, 4, 0x040507);
    c.ellipse(44, 27, 7, 4, 0x040507);
    c.ellipse(20, 27, 4.5, 2.2, 0x28303c);
    c.ellipse(44, 27, 4.5, 2.2, 0x28303c);
    c.px(19, 26, 0xa8c6e0);
    c.px(43, 26, 0xa8c6e0);
    // Mouth zipper / vent
    c.rect(22, 46, 20, 5, 0x06070a);
    for (let x = 23; x <= 41; x += 3) c.rect(x, 47, 1, 3, 0x7e8896);
    c.noise(5, 91);
    return c.toPng();
  }

  if (faceStyle === 'ghost') {
    c.gradV(0, 64, 0xe8f7ff, 0x9cd6f8);
    c.ellipse(21, 27, 5, 4, 0xffffff, 220);
    c.ellipse(43, 27, 5, 4, 0xffffff, 220);
    c.ellipse(21, 27, 2.5, 2.5, 0x4a98cc, 210);
    c.ellipse(43, 27, 2.5, 2.5, 0x4a98cc, 210);
    c.line(26, 46, 38, 46, 0x62a8d8, 2, 160);
    c.noise(6, 77);
    return c.toPng();
  }

  // Base face gradient + PS2 cheekbone/jaw shading
  c.gradV(0, 64, hiSkin, shadeHex(skin, 0.88));
  c.ellipse(32, 17, 18, 8, hiSkin, 110); // forehead highlight
  c.ellipse(14, 38, 8, 12, midShadow, 120); // left cheek contour
  c.ellipse(50, 38, 8, 12, midShadow, 120); // right cheek contour
  c.rect(0, 56, 64, 8, darkSkin, 125); // under-chin shadow
  c.ellipse(19, 27, 8, 5, midShadow, 115); // eye socket L
  c.ellipse(45, 27, 8, 5, midShadow, 115); // eye socket R

  // Hairline at top of forehead
  if (opt.hairStyle !== 'bald') {
    c.rect(0, 0, 64, 8, hair);
    for (let x = 4; x < 60; x += 6) {
      const drop = opt.hairStyle === 'slick' ? (x > 20 && x < 44 ? 2 : 5) : 3 + ((x * 7) % 4);
      c.rect(x, 7, 5, drop, shadeHex(hair, 0.9));
    }
    // Sideburns
    c.rect(0, 8, 5, 22, hair);
    c.rect(59, 8, 5, 22, hair);
  } else {
    c.ellipse(32, 11, 16, 6, shadeHex(skin, 1.24, 14), 125); // bald head shine
  }

  // Makeup eyeshadow & blush
  if (opt.makeup === 'diva' || opt.makeup === 'glam') {
    const shadowCol = opt.makeup === 'diva' ? 0xd81b84 : 0x20c8e8;
    const blushCol = opt.makeup === 'diva' ? 0xe05a98 : 0xf06ab8;
    c.ellipse(19, 25, 8, 4.5, shadowCol, 175);
    c.ellipse(45, 25, 8, 4.5, shadowCol, 175);
    c.ellipse(14, 37, 6, 4, blushCol, 95);
    c.ellipse(50, 37, 6, 4, blushCol, 95);
  }

  // Eyebrows
  const browHex = opt.hairStyle === 'bald' ? 0x1e1814 : shadeHex(hair, 0.78);
  const stern = opt.expression === 'stern';
  c.line(12, stern ? 19 : 20, 26, stern ? 21 : 19, browHex, 2.4);
  c.line(38, stern ? 21 : 19, 52, stern ? 19 : 20, browHex, 2.4);

  // Eyes (PS2 crisp low-res eyes)
  const irisHex = opt.iris ?? 0x2b3e52;
  for (const ex of [20, 44]) {
    c.ellipse(ex, 27, 5.5, 3.2, 0xf2f0ec);
    c.ellipse(ex, 27, 2.8, 2.6, irisHex);
    c.ellipse(ex, 27, 1.5, 1.5, 0x101012);
    c.px(ex - 1, 26, 0xffffff); // catchlight
    c.line(ex - 6, 24, ex + 6, 24, 0x141012, 1.6); // upper lash
    c.line(ex - 5, 30, ex + 5, 30, darkSkin, 1, 140); // lower lid
  }

  // Painted sunglasses backing if character wears shades (extra crisp look)
  if (opt.glasses === 'aviator' || opt.glasses === 'shades' || opt.glasses === 'tinted') {
    const lens = opt.glasses === 'tinted' ? 0x3a2458 : 0x10141c;
    const rim = opt.glasses === 'aviator' ? 0xc8aa58 : 0x1e2026;
    c.rect(10, 22, 18, 11, rim);
    c.rect(36, 22, 18, 11, rim);
    c.rect(11, 23, 16, 9, lens);
    c.rect(37, 23, 16, 9, lens);
    c.line(28, 24, 36, 24, rim, 2);
    // Retro diagonal specular reflection on shades
    c.line(13, 24, 18, 29, 0x90b8d8, 1.3, 140);
    c.line(39, 24, 44, 29, 0x90b8d8, 1.3, 140);
  }

  // Nose bridge highlight & nostril shadows
  c.rect(30, 26, 4, 12, hiSkin, 110);
  c.line(29, 27, 28, 38, midShadow, 1.2, 150);
  c.line(35, 27, 36, 38, midShadow, 1.2, 150);
  c.rect(28, 38, 8, 3, darkSkin, 150);
  c.px(29, 39, shadeHex(skin, 0.45));
  c.px(35, 39, shadeHex(skin, 0.45));

  // Stubble / Beard / Mustache
  if (opt.stubble) {
    for (let y = 41; y < 60; y++) {
      for (let x = 10; x < 54; x++) {
        if ((x * 13 + y * 29) % 5 === 0) c.px(x, y, shadeHex(skin, 0.62), 145);
      }
    }
  }
  if (opt.mustache) {
    c.rect(21, 41, 22, 4, shadeHex(hair, 0.85));
    c.rect(19, 43, 4, 3, shadeHex(hair, 0.85));
    c.rect(41, 43, 4, 3, shadeHex(hair, 0.85));
  }
  if (opt.beard) {
    c.rect(10, 41, 44, 23, hair, 220);
    c.rect(14, 45, 36, 18, shadeHex(hair, 0.82), 210);
    c.rect(24, 46, 16, 4, skin, 200); // mouth opening
  }

  // Mouth / Lips
  const lipHex =
    opt.makeup === 'diva'
      ? 0xd2145a
      : opt.makeup === 'glam'
        ? 0xe84ca0
        : opt.lipHex ?? shadeHex(skin, 0.64);
  if (opt.makeup === 'diva' || opt.makeup === 'glam' || opt.lipHex) {
    c.ellipse(32, 48, 8, 2.8, lipHex);
    c.line(24, 48, 40, 48, shadeHex(lipHex, 0.55), 1.2);
    c.px(32, 49, 0xffd0e8, 170); // lip gloss
  } else {
    c.line(24, 48, 40, 48, shadeHex(skin, 0.48), 1.8);
    if (opt.expression === 'smirk') {
      c.line(38, 48, 43, 46, shadeHex(skin, 0.48), 1.5);
    }
    c.line(27, 50, 37, 50, darkSkin, 1, 130);
  }

  c.noise(6, (skin & 0xffff) + 17);
  return c.toPng();
}

function makeEquineHeadTex(kind, coat, mane) {
  const c = new TexCanvas(64, 64);
  const darkCoat = shadeHex(coat, 0.68);
  const hiCoat = shadeHex(coat, 1.16, 8);

  c.gradV(0, 64, hiCoat, darkCoat);
  // Hair-direction vertical streaks
  for (let x = 2; x < 62; x += 3) {
    c.line(x, 0, x, 64, x % 2 === 0 ? hiCoat : darkCoat, 1, 45);
  }

  if (kind === 'unicorn') {
    // Pearlescent lavender-white sheen
    c.gradV(0, 64, 0xffffff, 0xe8e2f6);
    c.ellipse(32, 18, 18, 12, 0xf8e8ff, 120);
    // Soft pale pink-silver muzzle
    c.gradV(44, 64, 0xeee4f4, 0xd8c8e2, 220);
    // Serene sapphire eyes
    for (const ex of [14, 50]) {
      c.ellipse(ex, 24, 6, 4, 0xf8f8ff);
      c.ellipse(ex, 24, 3.5, 3.2, 0x3b48a8);
      c.ellipse(ex, 24, 1.8, 1.8, 0x10101e);
      c.px(ex - 1, 23, 0xffffff);
    }
    // Delicate nostrils
    c.ellipse(23, 53, 3.5, 2.2, 0x9080a4);
    c.ellipse(41, 53, 3.5, 2.2, 0x9080a4);
    c.line(24, 60, 40, 60, 0x8a7c9c, 1.4);
  } else if (kind === 'donkey') {
    // Warm grey-taupe donkey with unmistakable pale-cream muzzle & dark dorsal tuft
    c.rect(27, 0, 10, 12, mane, 220); // shaggy dark forelock
    // Pale cream muzzle bottom third
    c.gradV(40, 64, 0xeae4d6, 0xd4cbb8, 245);
    c.ellipse(32, 46, 22, 12, 0xeee8dc, 180);
    // Pale eye rings (classic donkey look!)
    for (const ex of [14, 50]) {
      c.ellipse(ex, 24, 8, 5.5, 0xdcd5c6, 175);
      c.ellipse(ex, 24, 5, 3.5, 0xf0eee8);
      c.ellipse(ex, 24, 2.8, 2.8, 0x1a1612);
      c.px(ex - 1, 23, 0xffffff);
    }
    // Big dark donkey nostrils & mouth
    c.ellipse(21, 52, 4.5, 3, 0x262220);
    c.ellipse(43, 52, 4.5, 3, 0x262220);
    c.line(21, 60, 43, 60, 0x3a342e, 2);
  } else {
    // Classic horse: forehead blaze stripe, expressive lateral eyes, dark velvet muzzle
    c.rect(28, 6, 8, 34, 0xf2ece0, 210); // white blaze
    c.ellipse(32, 12, 7, 5, 0xf6f2e8, 220);
    // Velvet darker muzzle
    c.gradV(44, 64, darkCoat, shadeHex(coat, 0.45), 210);
    for (const ex of [14, 50]) {
      c.ellipse(ex, 24, 6, 3.8, 0xf2f0ea);
      c.ellipse(ex, 24, 3.5, 3.2, 0x2a1a10);
      c.ellipse(ex, 24, 1.8, 1.8, 0x0a0808);
      c.px(ex - 1, 23, 0xffffff);
      c.line(ex - 6, 20, ex + 6, 20, shadeHex(coat, 0.5), 1.6);
    }
    c.ellipse(22, 53, 4, 2.6, 0x161210);
    c.ellipse(42, 53, 4, 2.6, 0x161210);
    c.line(23, 60, 41, 60, 0x1a1410, 1.8);
  }

  c.noise(7, (coat & 0xffff) + 33);
  return c.toPng();
}

function makeOutfitTex(pattern, opt) {
  const c = new TexCanvas(64, 64);
  const top = opt.top;
  const accent = opt.accent ?? shadeHex(top, 1.35, 18);
  const dark = shadeHex(top, 0.65);

  switch (pattern) {
    case 'hawaiian': {
      // Tommy Vercetti loud teal Hawaiian palm-leaf shirt!
      c.gradV(0, 64, 0x1db4c2, 0x0e8696);
      // Repeating palm leaves in navy, mint & coral flowers
      const palms = [
        [12, 16, 14, -0.5, 0x0a4a5e],
        [48, 14, 15, 2.6, 0x0a4a5e],
        [18, 44, 16, -0.9, 0x0d5c6e],
        [52, 46, 14, 2.2, 0x0a4a5e],
        [34, 28, 13, 0.6, 0x56e4d8],
        [8, 56, 12, -0.3, 0x56e4d8],
        [56, 30, 12, 2.8, 0x56e4d8],
      ];
      for (const [x, y, s, a, col] of palms) c.palmLeaf(x, y, s, a, col);
      // Small retro hibiscus pops
      for (const [fx, fy] of [[24, 18], [46, 34], [14, 34], [40, 54]]) {
        c.ellipse(fx, fy, 3, 3, 0xf26b7a);
        c.px(fx, fy, 0xffe478);
      }
      // Open V-collar showing chest skin & center button placket
      for (let y = 0; y < 18; y++) {
        const hw = Math.max(0, Math.round(10 - y * 0.58));
        c.rect(32 - hw, y, hw * 2, 1, opt.skin);
      }
      // Gold chain on chest
      c.line(23, 2, 32, 14, 0xf0c850, 2);
      c.line(41, 2, 32, 14, 0xf0c850, 2);
      // Collar trim & button line
      c.line(21, 0, 32, 18, 0x0c6a78, 2);
      c.line(43, 0, 32, 18, 0x0c6a78, 2);
      c.line(32, 18, 32, 63, 0x0c6270, 1.5);
      for (const by of [24, 35, 46, 56]) c.rect(31, by, 2, 2, 0xeef8f8);
      c.bakeClothShading(0.2);
      c.noise(6, 101);
      break;
    }

    case 'miami_blazer': {
      // Pastel coral/pink 80s Miami jacket open over white tee
      c.gradV(0, 64, 0xf68492, 0xd95f70);
      c.rect(20, 0, 24, 64, 0xf4f2ee); // crisp white tee
      c.gradV(0, 64, 0xffffff, 0xe0ddd8, 90);
      // Turquoise 80s tee graphic stripe
      c.rect(23, 22, 18, 4, 0x26d0ce);
      c.rect(25, 28, 14, 2, 0xffd048);
      // Wide jacket lapels
      c.line(19, 0, 22, 64, 0xb84858, 2);
      c.line(45, 0, 42, 64, 0xb84858, 2);
      c.line(14, 6, 20, 34, 0xffa6b0, 2);
      c.line(50, 6, 44, 34, 0xffa6b0, 2);
      // Pocket flaps
      c.rect(6, 42, 11, 3, 0xb84858);
      c.rect(47, 42, 11, 3, 0xb84858);
      c.bakeClothShading(0.18);
      c.noise(5, 102);
      break;
    }

    case 'cuban_retro': {
      // Bright yellow & turquoise patterned 80s Cuban shirt
      c.gradV(0, 64, 0xf8cc38, 0xdca820);
      // Vertical retro turquoise/coral Cuban stripe panels
      c.rect(10, 0, 10, 64, 0x1cc8c8);
      c.rect(44, 0, 10, 64, 0x1cc8c8);
      for (let y = 4; y < 60; y += 8) {
        c.rect(12, y, 6, 3, 0xf05848);
        c.rect(46, y, 6, 3, 0xf05848);
        c.rect(14, y + 4, 2, 2, 0xfff6d0);
        c.rect(48, y + 4, 2, 2, 0xfff6d0);
      }
      // Open neck + buttons + pockets
      for (let y = 0; y < 14; y++) {
        const hw = Math.max(0, Math.round(8 - y * 0.6));
        c.rect(32 - hw, y, hw * 2, 1, opt.skin);
      }
      c.line(32, 14, 32, 64, 0xb88614, 1.5);
      for (const by of [20, 32, 44, 56]) c.rect(31, by, 2, 2, 0xfff8e0);
      c.rect(8, 38, 12, 12, 0x149ea0, 140);
      c.rect(44, 38, 12, 12, 0x149ea0, 140);
      c.bakeClothShading(0.2);
      c.noise(6, 103);
      break;
    }

    case 'lance_suit': {
      // Crisp pastel off-white double-breasted 80s Miami suit over purple/lavender shirt!
      c.gradV(0, 64, 0xf4f0e6, 0xdcd6c8);
      // Purple/lavender shirt V-opening
      for (let y = 0; y < 28; y++) {
        const hw = Math.max(0, Math.round(13 - y * 0.48));
        c.rect(32 - hw, y, hw * 2, 1, 0x8a4ec8);
      }
      // Dark plum tie
      c.rect(30, 6, 4, 22, 0x2c1238);
      // Peaked double-breasted lapels
      c.line(18, 0, 31, 30, 0xb8b0a0, 2);
      c.line(46, 0, 33, 30, 0xb8b0a0, 2);
      c.line(13, 10, 24, 26, 0xffffff, 2);
      c.line(51, 10, 40, 26, 0xffffff, 2);
      // Double-breasted buttons (2x2)
      for (const bx of [24, 40]) {
        for (const by of [36, 48]) c.ellipse(bx, by, 2, 2, 0x48443c);
      }
      // Lavender pocket square
      c.rect(43, 18, 9, 4, 0xa86ae8);
      c.rect(43, 21, 9, 2, 0xb0a898);
      c.bakeClothShading(0.18);
      c.noise(4, 104);
      break;
    }

    case 'glitter_disco': {
      // 80s Miami roller-disco: neon magenta/cyan crop jacket with metallic stripes
      c.gradV(0, 64, 0xe82496, 0x9c167a);
      // Diagonal cyan & metallic gold lightning/racing stripes
      for (let y = 0; y < 64; y++) {
        c.rect(18 + ((y * 0.35) | 0), y, 6, 1, 0x1ee2f2);
        c.rect(40 - ((y * 0.35) | 0), y, 6, 1, 0x1ee2f2);
      }
      // Silver metallic center zipper + open glam chest
      for (let y = 0; y < 18; y++) {
        const hw = Math.max(0, Math.round(10 - y * 0.55));
        c.rect(32 - hw, y, hw * 2, 1, opt.skin);
      }
      c.rect(30, 18, 4, 46, 0xe8ecf4);
      // Sequin sparkles
      for (let i = 0; i < 42; i++) {
        const sx = (i * 19 + 5) % 60;
        const sy = (i * 29 + 3) % 60;
        c.px(sx, sy, i % 2 === 0 ? 0xffffff : 0xffe46a);
      }
      c.bakeClothShading(0.16);
      break;
    }

    case 'disco_diva': {
      // Metallic fuchsia & gold sequined dress
      c.gradV(0, 64, 0xe01c88, 0x6a0c48);
      // Gold sequined chevron / diamond lattice
      for (let y = 0; y < 64; y += 8) {
        for (let x = 0; x < 64; x += 8) {
          c.line(x, y + 4, x + 4, y, 0xf4c848, 1, 180);
          c.line(x + 4, y, x + 8, y + 4, 0xf4c848, 1, 180);
          c.px(x + 4, y + 4, 0xffef98, 220);
        }
      }
      // Plunging sweetheart neckline
      for (let y = 0; y < 16; y++) {
        const hw = Math.max(0, Math.round(11 - y * 0.7));
        c.rect(32 - hw, y, hw * 2, 1, opt.skin);
      }
      // Gold waist sash
      c.rect(0, 38, 64, 6, 0xe8b838);
      c.rect(28, 37, 8, 8, 0xfff09a);
      c.bakeClothShading(0.2);
      break;
    }

    case 'biker_vest': {
      // Mitch Baker sleeveless dark denim/leather vest over bare chest/chain
      c.gradV(0, 64, 0x262832, 0x12141a);
      // Open front chest with chest hair & chain
      c.rect(22, 0, 20, 48, opt.skin);
      for (let y = 8; y < 38; y += 2) {
        for (let x = 25; x < 39; x += 3) {
          if ((x + y) % 4 === 0) c.px(x, y, shadeHex(opt.hair, 0.8), 150);
        }
      }
      // Gold medallion chain
      c.line(23, 2, 32, 22, 0xe4be4c, 2);
      c.line(41, 2, 32, 22, 0xe4be4c, 2);
      c.ellipse(32, 24, 3, 3, 0xf2d060);
      // Vest seams, silver snaps & pockets
      c.line(21, 0, 21, 64, 0x464a58, 2);
      c.line(43, 0, 43, 64, 0x464a58, 2);
      for (const y of [14, 28, 42, 54]) {
        c.rect(18, y, 2, 2, 0xc8ccd4);
        c.rect(44, y, 2, 2, 0xc8ccd4);
      }
      c.rect(5, 36, 13, 12, 0x1a1c24);
      c.rect(46, 36, 13, 12, 0x1a1c24);
      c.bakeClothShading(0.22);
      c.noise(7, 107);
      break;
    }

    case 'bouncer_suit': {
      // Tailored intimidating black bouncer jacket over charcoal shirt
      c.gradV(0, 64, 0x202228, 0x0b0c10);
      // Subtle tailored pinstripe texture
      for (let x = 4; x < 64; x += 6) c.line(x, 0, x, 64, 0x2b2e36, 1, 90);
      // Dark shirt V + lapel lines
      for (let y = 0; y < 26; y++) {
        const hw = Math.max(0, Math.round(11 - y * 0.42));
        c.rect(32 - hw, y, hw * 2, 1, 0x14161c);
      }
      c.line(20, 0, 32, 28, 0x3a3e48, 2);
      c.line(44, 0, 32, 28, 0x3a3e48, 2);
      c.ellipse(32, 36, 2, 2, 0x484c56);
      c.ellipse(32, 48, 2, 2, 0x484c56);
      // Coiled security earpiece wire on shoulder
      c.line(18, 0, 14, 14, 0x9aa2b0, 1.3);
      c.bakeClothShading(0.22);
      c.noise(5, 108);
      break;
    }

    case 'security_uniform': {
      // Club security uniform: crisp dark navy + khaki accents + silver badge (berliner bouncer look)
      c.gradV(0, 64, 0x20304a, 0x121c2e);
      // Khaki-tan shoulder epaulettes & collar trim
      c.rect(0, 0, 18, 7, 0xb8a47a);
      c.rect(46, 0, 18, 7, 0xb8a47a);
      // Center button strip & dark tie
      c.rect(29, 0, 6, 48, 0x0c1018);
      // Chest pockets with khaki flaps
      c.rect(7, 22, 16, 14, 0x18253a);
      c.rect(7, 22, 16, 4, 0xb8a47a);
      c.rect(41, 22, 16, 14, 0x18253a);
      c.rect(41, 22, 16, 4, 0xb8a47a);
      // Gleaming silver shield badge!
      c.ellipse(15, 16, 4.5, 5, 0xd8e0ec);
      c.ellipse(15, 16, 2.5, 2.8, 0x3a5888);
      c.px(14, 14, 0xffffff);
      // Utility belt with silver buckle
      c.rect(0, 52, 64, 10, 0x0c0d10);
      c.rect(27, 53, 10, 8, 0xd0d6e0);
      c.rect(29, 55, 6, 4, 0x1a1c22);
      c.bakeClothShading(0.18);
      c.noise(5, 109);
      break;
    }

    case 'hivis_vest': {
      // Animal control: high-vis neon yellow safety vest with reflective stripes over navy shirt
      c.gradV(0, 64, 0xf2de28, 0xd0b818);
      // Navy collar/sleeves peek at top
      for (let y = 0; y < 14; y++) {
        const hw = Math.max(0, Math.round(12 - y * 0.85));
        c.rect(32 - hw, y, hw * 2, 1, 0x1c2838);
      }
      // Crisp silver-white reflective safety stripes
      c.rect(0, 34, 64, 6, 0xe8eef6);
      c.rect(0, 48, 64, 6, 0xe8eef6);
      c.rect(14, 0, 6, 36, 0xe8eef6);
      c.rect(44, 0, 6, 36, 0xe8eef6);
      // Zipper down center
      c.line(32, 12, 32, 63, 0x22262e, 2);
      c.bakeClothShading(0.16);
      c.noise(5, 110);
      break;
    }

    case 'leather_studded': {
      // Glossy black leather biker jacket / harness with silver studs, diagonal zip & buckles
      c.gradV(0, 64, 0x1e2026, 0x090a0e);
      // Bare chest V or harness straps
      if (opt.bareChest) {
        c.rect(18, 4, 28, 42, opt.skin);
        // Leather harness cross-straps + silver center O-ring
        c.line(12, 0, 52, 54, 0x0e0f14, 5);
        c.line(52, 0, 12, 54, 0x0e0f14, 5);
        c.rect(0, 42, 64, 6, 0x0c0d12);
        c.ellipse(32, 26, 6, 6, 0xcad0dc);
        c.ellipse(32, 26, 3.5, 3.5, opt.skin);
      } else {
        // Biker lapels & silver diagonal zipper
        c.line(20, 0, 32, 22, 0x383c46, 2);
        c.line(44, 0, 32, 22, 0x383c46, 2);
        c.line(36, 18, 28, 62, 0xd0d6e0, 2);
        c.rect(0, 54, 64, 7, 0x0b0c0f);
        c.rect(27, 55, 10, 5, 0xc8ced8);
      }
      // Silver studs along shoulders & chest
      for (const sx of [6, 12, 18, 46, 52, 58]) {
        c.rect(sx, 5, 2, 2, 0xe2e8f0);
        c.rect(sx, 14, 2, 2, 0xd0d6e0);
      }
      c.bakeClothShading(0.18);
      c.noise(4, 111);
      break;
    }

    case 'rubber_suit': {
      // Sleek glossy black latex suit with crisp geometric seam lines & specular sheen
      c.gradV(0, 64, 0x242834, 0x0c0e14);
      // Specular chest plates
      c.ellipse(20, 20, 10, 8, 0x424a5e, 110);
      c.ellipse(44, 20, 10, 8, 0x424a5e, 110);
      // Geometric architectural seam lines
      c.line(32, 0, 32, 64, 0x626c82, 1.6);
      c.line(10, 12, 32, 32, 0x525c72, 1.4);
      c.line(54, 12, 32, 32, 0x525c72, 1.4);
      c.line(12, 42, 52, 42, 0x525c72, 1.4);
      c.line(16, 54, 48, 54, 0x525c72, 1.4);
      c.bakeClothShading(0.15);
      break;
    }

    case 'windbreaker': {
      // 80s synth-wave windbreaker / tracksuit jacket with neon pink & white V-stripes
      c.gradV(0, 64, 0x243448, 0x162030);
      // Bold 80s chevron stripes across chest
      c.line(0, 14, 32, 32, 0xf0449a, 5);
      c.line(64, 14, 32, 32, 0xf0449a, 5);
      c.line(0, 20, 32, 38, 0x26e0e0, 4);
      c.line(64, 20, 32, 38, 0x26e0e0, 4);
      c.line(0, 25, 32, 43, 0xf4f6f8, 2);
      c.line(64, 25, 32, 43, 0xf4f6f8, 2);
      // Center zip
      c.line(32, 0, 32, 64, 0xd4dce6, 1.5);
      c.bakeClothShading(0.18);
      c.noise(5, 113);
      break;
    }

    case 'turtleneck': {
      // Philosopher: dark charcoal/indigo ribbed turtleneck under dark jacket
      c.gradV(0, 64, 0x242838, 0x141622);
      // Ribbed turtleneck center
      c.rect(20, 0, 24, 64, 0x181a24);
      for (let x = 22; x < 44; x += 3) c.line(x, 0, x, 64, 0x282c3a, 1);
      // Jacket lapels
      c.line(19, 0, 21, 64, 0x363c50, 2);
      c.line(45, 0, 43, 64, 0x363c50, 2);
      c.bakeClothShading(0.2);
      c.noise(6, 114);
      break;
    }

    case 'bomber': {
      // Old raver: worn olive-charcoal bomber jacket over faded rave tee
      c.gradV(0, 64, 0x464a38, 0x2c3024);
      // Open front over faded neon-print charcoal tee
      c.rect(22, 0, 20, 64, 0x1e1f22);
      c.ellipse(32, 26, 7, 7, 0xd8a828, 170); // faded smiley/rave graphic
      c.px(29, 24, 0x181818);
      c.px(35, 24, 0x181818);
      // Orange bomber lining peek
      c.rect(19, 0, 3, 64, 0xd86220);
      c.rect(42, 0, 3, 64, 0xd86220);
      // Knit waist band
      c.rect(0, 56, 64, 8, 0x1e2018);
      c.bakeClothShading(0.22);
      c.noise(7, 115);
      break;
    }

    case 'coveralls': {
      // Cleaner: blue janitor coveralls with chest pockets, nametag, reflective stripe
      c.gradV(0, 64, 0x346ca4, 0x244c78);
      c.line(32, 0, 32, 64, 0x1c3a5c, 2); // zipper placket
      // Pockets & white stitched nametag
      c.rect(8, 16, 16, 12, 0x265484);
      c.rect(40, 16, 16, 12, 0x265484);
      c.rect(10, 12, 12, 4, 0xf0ece2);
      c.line(12, 14, 20, 14, 0xc03232, 1);
      // Waist reflective safety band
      c.rect(0, 50, 64, 5, 0xd8e2ec);
      c.bakeClothShading(0.2);
      c.noise(6, 116);
      break;
    }

    case 'cloak': {
      // Darkroom keeper: shadowy dark velvet cloak with deep vertical folds
      c.gradV(0, 64, 0x181822, 0x06060a);
      for (let x = 8; x < 60; x += 10) {
        c.line(x, 0, x + 2, 64, 0x262634, 2, 120);
        c.line(x + 3, 0, x + 5, 64, 0x040406, 2, 170);
      }
      c.bakeClothShading(0.25);
      c.noise(5, 117);
      break;
    }

    case 'cargo_vest': {
      // Lighting tech: tactical cargo vest with pockets, neon lanyard & gaffer tape
      c.gradV(0, 64, 0x2c3038, 0x181a20);
      c.rect(24, 0, 16, 64, 0x121318); // crew tee underneath
      // Neon backstage lanyard & VIP pass
      c.line(24, 0, 32, 24, 0xf24822, 2);
      c.line(40, 0, 32, 24, 0xf24822, 2);
      c.rect(28, 24, 8, 11, 0xf0f2f4);
      c.rect(29, 25, 6, 3, 0x22b8e6);
      // Utility pockets
      c.rect(5, 28, 15, 14, 0x20242c);
      c.rect(44, 28, 15, 14, 0x20242c);
      c.rect(5, 28, 15, 3, 0x424856);
      c.rect(44, 28, 15, 3, 0x424856);
      c.bakeClothShading(0.2);
      c.noise(6, 118);
      break;
    }

    case 'apron_icecream': {
      // Ice cream horse: retro pastel pink & white striped ice cream parlor apron + bow tie!
      c.gradV(0, 64, 0xfcf8f2, 0xeae2d6);
      for (let x = 4; x < 64; x += 8) c.rect(x, 12, 4, 52, 0xf4a8c0, 190);
      // Crisp white bib top + pastel bow tie
      c.rect(0, 0, 64, 14, 0xf8f6f2);
      c.rect(24, 4, 16, 5, 0xe45888);
      c.rect(30, 3, 4, 7, 0xc23868);
      // Apron pocket
      c.rect(20, 40, 24, 14, 0xffffff, 220);
      c.rect(20, 40, 24, 3, 0x52c8d8);
      c.bakeClothShading(0.15);
      c.noise(4, 119);
      break;
    }

    case 'unicorn_glam': {
      // Pearlescent silver-white harness/vest with pastel lavender-gold trim
      c.gradV(0, 64, 0xeae8f4, 0xc4c0d8);
      c.line(12, 0, 52, 56, 0x9c82d8, 5);
      c.line(52, 0, 12, 56, 0x9c82d8, 5);
      c.ellipse(32, 28, 6, 6, 0xf4d262);
      c.ellipse(32, 28, 3, 3, 0xffffff);
      for (let i = 0; i < 28; i++) {
        c.px((i * 23 + 7) % 62, (i * 17 + 5) % 62, 0xffffff);
      }
      c.bakeClothShading(0.14);
      break;
    }

    case 'donkey_shirt': {
      // Retro coral-red bowling/camp shirt with cream & turquoise chest stripe
      c.gradV(0, 64, 0xdc4c3c, 0xa83226);
      c.rect(0, 20, 64, 8, 0xf2e6cc);
      c.rect(0, 22, 64, 4, 0x24b4b8);
      c.line(32, 0, 32, 64, 0x86241a, 1.5);
      for (const by of [10, 34, 46, 56]) c.rect(31, by, 2, 2, 0xf8f0dc);
      c.bakeClothShading(0.2);
      c.noise(6, 121);
      break;
    }

    case 'ghost_robe': {
      c.gradV(0, 64, 0xdcf4ff, 0x8ec8f0);
      for (let x = 10; x < 56; x += 12) c.line(x, 0, x, 64, 0xffffff, 2, 90);
      c.noise(6, 122);
      break;
    }

    default: {
      c.gradV(0, 64, shadeHex(top, 1.12), dark);
      c.line(32, 0, 32, 64, accent, 1, 80);
      c.bakeClothShading(0.22);
      c.noise(6, 125);
    }
  }
  return c.toPng();
}

function makePantsTex(style, hex) {
  const c = new TexCanvas(32, 32);
  const hi = shadeHex(hex, 1.15);
  const lo = shadeHex(hex, 0.72);
  c.gradV(0, 32, hi, lo);
  if (style === 'denim') {
    // Classic stonewash denim fade & vertical seam
    c.rect(10, 6, 12, 18, shadeHex(hex, 1.24, 10), 100);
    c.line(3, 0, 3, 32, 0xc8a448, 1, 140);
    c.line(28, 0, 28, 32, 0xc8a448, 1, 140);
    c.noise(10, 201);
  } else if (style === 'track') {
    // Side neon stripe
    c.rect(13, 0, 6, 32, 0xf0449a);
    c.rect(15, 0, 2, 32, 0xffffff);
    c.noise(5, 202);
  } else if (style === 'silver') {
    // Metallic disco sheen bands
    c.rect(8, 0, 8, 32, 0xffffff, 110);
    c.rect(20, 0, 4, 32, 0x90a8d0, 90);
  } else if (style === 'leather') {
    c.rect(10, 0, 6, 32, 0x3a404e, 110);
    c.line(16, 0, 16, 32, 0x525868, 1, 130);
    c.noise(4, 204);
  } else {
    c.line(16, 0, 16, 32, lo, 1, 110);
    c.noise(6, 205);
  }
  c.bakeClothShading(0.2);
  return c.toPng();
}

function makeHairTex(hex, style = 'normal') {
  const c = new TexCanvas(32, 32);
  const hi = shadeHex(hex, 1.25, 10);
  const lo = shadeHex(hex, 0.68);
  c.gradV(0, 32, hi, lo);
  for (let x = 1; x < 32; x += 2) {
    c.line(x, 0, x + (style === 'wig' ? 2 : 0), 32, x % 4 === 1 ? hi : lo, 1, 120);
  }
  c.noise(8, (hex & 0xffff) + 41);
  return c.toPng();
}

function makeHornTex() {
  // Golden-iridescent diagonal spiral bands for the rare Unicorn horn!
  const c = new TexCanvas(32, 32);
  c.gradV(0, 32, 0xfff8d0, 0xe4a828);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const band = (x + y * 2) % 10;
      if (band < 2) c.px(x, y, 0xffffff, 220);
      else if (band === 5) c.px(x, y, 0xf2b0e8, 140); // subtle pastel iridescence
      else if (band === 8) c.px(x, y, 0xc28018, 170);
    }
  }
  return c.toPng();
}

// ============================================================================
// Upgraded GLB Exporter (UV-mapped PNG Textures + Faceted Low-Poly Geometry)
// ============================================================================

class Figure {
  constructor() {
    this.prims = [];
    this.textures = []; // { key, png: Buffer }
    this.texByKey = new Map();
    this.cur = null;
    this.part = 'body';
    this.pivot = [0, 0, 0];
    this.pivots = { body: this.pivot };
  }

  /** Register a procedural PNG texture and return its texture index in this GLB. */
  addTex(key, png) {
    if (this.texByKey.has(key)) return this.texByKey.get(key);
    const idx = this.textures.length;
    this.textures.push({ key, png });
    this.texByKey.set(key, idx);
    return idx;
  }

  /** Pivot a limb so the game can swing it. Subsequent geometry is stored relative to this point. */
  limb(name, x, y, z) {
    this.part = name;
    this.pivot = [x, y, z];
    this.pivots[name] = this.pivot;
    this.cur = null;
    return this;
  }

  /**
   * Select material for subsequent geometry.
   * @param {number} hex Base color (use 0xffffff when fully textured)
   * @param {number} metal
   * @param {number} rough
   * @param {{ tex?: number, emissive?: number[], emissiveTex?: boolean, alpha?: number }} [opts]
   */
  use(hex, metal = 0.05, rough = 0.78, opts = {}) {
    const tex = opts.tex ?? -1;
    const em = opts.emissive ? opts.emissive.join(',') : '';
    const emTex = opts.emissiveTex ? 1 : 0;
    const alpha = opts.alpha ?? 1;
    const key = `${this.part}|${hex}|${metal}|${rough}|${tex}|${em}|${emTex}|${alpha}`;
    let p = this.prims.find((x) => x.key === key);
    if (!p) {
      p = {
        key,
        part: this.part,
        hex,
        metal,
        rough,
        tex,
        emissive: opts.emissive ?? null,
        emissiveTex: !!opts.emissiveTex,
        alpha,
        positions: [],
        uvs: [],
        indices: [],
      };
      this.prims.push(p);
    }
    this.cur = p;
    return this;
  }

  /** Standard quad with outward winding (a->b->c->d CCW when viewed from outside) and UVs. */
  quad(a, b, c, d, uv = [[0, 1], [1, 1], [1, 0], [0, 0]]) {
    const p = this.cur;
    const [px, py, pz] = this.pivot;
    const base = p.positions.length / 3;
    const verts = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      const v = verts[i];
      p.positions.push(v[0] - px, v[1] - py, v[2] - pz);
      p.uvs.push(uv[i][0], uv[i][1]);
    }
    p.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  /** Single outward triangle with UVs. */
  tri(a, b, c, uv = [[0, 1], [1, 1], [0.5, 0]]) {
    const p = this.cur;
    const [px, py, pz] = this.pivot;
    const base = p.positions.length / 3;
    const verts = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const v = verts[i];
      p.positions.push(v[0] - px, v[1] - py, v[2] - pz);
      p.uvs.push(uv[i][0], uv[i][1]);
    }
    p.indices.push(base, base + 1, base + 2);
    return this;
  }

  /** Axis-aligned box centred at (cx, cy, cz), size w x h x d. */
  box(cx, cy, cz, w, h, d) {
    return this.taperBox(cx, cy - h / 2, cy + h / 2, cz, w, d, w, d, 0, 0);
  }

  /**
   * Tapered frustum box from y0 (width w0, depth d0, centre cx, cz)
   * to y1 (width w1, depth d1, centre cx + xShift, cz + zShift).
   * UV v=0 is at the top (y1), v=1 is at the bottom (y0) — standard glTF top-down texture mapping.
   */
  taperBox(cx, y0, y1, cz, w0, d0, w1, d1, zShift = 0, xShift = 0, skipFront = false) {
    const bx0 = cx - w0 / 2;
    const bx1 = cx + w0 / 2;
    const bz0 = cz - d0 / 2;
    const bz1 = cz + d0 / 2;

    const tx0 = cx + xShift - w1 / 2;
    const tx1 = cx + xShift + w1 / 2;
    const tz0 = cz + zShift - d1 / 2;
    const tz1 = cz + zShift + d1 / 2;

    const bfl = [bx0, y0, bz1];
    const bfr = [bx1, y0, bz1];
    const bbr = [bx1, y0, bz0];
    const bbl = [bx0, y0, bz0];

    const tfl = [tx0, y1, tz1];
    const tfr = [tx1, y1, tz1];
    const tbr = [tx1, y1, tz0];
    const tbl = [tx0, y1, tz0];

    if (!skipFront) this.quad(bfl, bfr, tfr, tfl); // +Z front
    this.quad(bbr, bbl, tbl, tbr); // -Z back
    this.quad(bfr, bbr, tbr, tfr); // +X right
    this.quad(bbl, bfl, tfl, tbl); // -X left
    this.quad(tfl, tfr, tbr, tbl); // +Y top
    this.quad(bbl, bbr, bfr, bfl); // -Y bottom
    return this;
  }

  /**
   * N-sided tapered prism/cylinder (great for PS2 faceted limbs, necks, afros, caps, horns).
   * Outward winding guaranteed.
   */
  prism(cx, y0, y1, cz, rx0, rz0, rx1, rz1, sides = 6, rot = 0, zShift = 0, xShift = 0) {
    const bot = [];
    const top = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      bot.push([cx + ca * rx0, y0, cz + sa * rz0]);
      top.push([cx + xShift + ca * rx1, y1, cz + zShift + sa * rz1]);
    }
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const u0 = i / sides;
      const u1 = (i + 1) / sides;
      // Note: as angle increases from +X toward +Z, moving i -> j goes CW when viewed from +Y;
      // so outward CCW quad is bot[j] -> bot[i] -> top[i] -> top[j].
      this.quad(bot[j], bot[i], top[i], top[j], [
        [u1, 1],
        [u0, 1],
        [u0, 0],
        [u1, 0],
      ]);
    }
    // Top cap (+Y outward: reverse order j -> i)
    const tc = [cx + xShift, y1, cz + zShift];
    const bc = [cx, y0, cz];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      if (rx1 > 1e-4 && rz1 > 1e-4) this.tri(tc, top[j], top[i], [[0.5, 0.5], [1, 0], [0, 0]]);
      if (rx0 > 1e-4 && rz0 > 1e-4) this.tri(bc, bot[i], bot[j], [[0.5, 0.5], [0, 1], [1, 1]]);
    }
    return this;
  }

  /**
   * Arbitrary 3D oriented tapered box from p0 to p1 (width along right, depth along forward/up).
   * Ideal for angled equine snouts, splayed donkey ears, unicorn horns, lapels, and collars.
   */
  orientedFrustum(p0, p1, w0, d0, w1, d1, refUp = [0, 0, 1]) {
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const len = Math.hypot(ax, ay, az) || 1;
    const ux = ax / len;
    const uy = ay / len;
    const uz = az / len;

    // Pick a stable reference vector not parallel to axis u
    let rxRef = refUp[0];
    let ryRef = refUp[1];
    let rzRef = refUp[2];
    if (Math.abs(ux * rxRef + uy * ryRef + uz * rzRef) > 0.95) {
      rxRef = 1;
      ryRef = 0;
      rzRef = 0;
    }
    // right = normalize(cross(ref, u)) — wait: cross(u, ref) gives a right-handed basis (right, fwd, u)
    let rx = ryRef * uz - rzRef * uy;
    let ry = rzRef * ux - rxRef * uz;
    let rz = rxRef * uy - ryRef * ux;
    const rLen = Math.hypot(rx, ry, rz) || 1;
    rx /= rLen;
    ry /= rLen;
    rz /= rLen;

    // fwd = cross(right, u) so det([right, u, fwd]) = +1 (matches standard right-handed X=right, Y=u, Z=fwd!)
    const fx = ry * uz - rz * uy;
    const fy = rz * ux - rx * uz;
    const fz = rx * uy - ry * ux;

    const pt = (origin, sr, sf) => [
      origin[0] + rx * sr + fx * sf,
      origin[1] + ry * sr + fy * sf,
      origin[2] + rz * sr + fz * sf,
    ];

    const hw0 = w0 / 2;
    const hd0 = d0 / 2;
    const hw1 = w1 / 2;
    const hd1 = d1 / 2;

    const bfl = pt(p0, -hw0, hd0);
    const bfr = pt(p0, hw0, hd0);
    const bbr = pt(p0, hw0, -hd0);
    const bbl = pt(p0, -hw0, -hd0);

    const tfl = pt(p1, -hw1, hd1);
    const tfr = pt(p1, hw1, hd1);
    const tbr = pt(p1, hw1, -hd1);
    const tbl = pt(p1, -hw1, -hd1);

    this.quad(bfl, bfr, tfr, tfl);
    this.quad(bbr, bbl, tbl, tbr);
    this.quad(bfr, bbr, tbr, tfr);
    this.quad(bbl, bfl, tfl, tbl);
    this.quad(tfl, tfr, tbr, tbl);
    this.quad(bbl, bbr, bfr, bfl);
    return this;
  }

  toGlb() {
    let byte = 0;
    const bins = [];
    const bufferViews = [];
    const accessors = [];
    const materials = [];
    const matByKey = new Map();
    const primitives = [];
    const images = [];
    const textures = [];
    const samplers = [];

    const r4 = (n) => Math.round(n * 10000) / 10000;

    const pushBuf = (bufOrTyped, target) => {
      const buf = Buffer.isBuffer(bufOrTyped)
        ? bufOrTyped
        : Buffer.from(bufOrTyped.buffer, bufOrTyped.byteOffset, bufOrTyped.byteLength);
      const pad = (4 - (byte % 4)) % 4;
      if (pad) {
        bins.push(Buffer.alloc(pad));
        byte += pad;
      }
      const view = bufferViews.length;
      const bv = { buffer: 0, byteOffset: byte, byteLength: buf.length };
      if (target !== undefined) bv.target = target;
      bufferViews.push(bv);
      bins.push(buf);
      byte += buf.length;
      return view;
    };

    // Embed PNG images + crisp PS2 retro sampler (NEAREST magFilter, mipmapped LINEAR minFilter)
    if (this.textures.length > 0) {
      samplers.push({ magFilter: 9728, minFilter: 9987, wrapS: 10497, wrapT: 10497 });
      for (const tex of this.textures) {
        const iv = pushBuf(tex.png);
        const imgIdx = images.length;
        images.push({ bufferView: iv, mimeType: 'image/png', name: tex.key });
        textures.push({ sampler: 0, source: imgIdx, name: tex.key });
      }
    }

    // Pack all vertex/index data into 4 shared bufferViews (compact JSON + clean alignment)
    const activePrims = this.prims.filter((p) => p.indices.length > 0);
    const posChunks = [];
    const nrmChunks = [];
    const uvChunks = [];
    const idxChunks = [];
    const primMeta = [];
    let posOff = 0;
    let nrmOff = 0;
    let uvOff = 0;
    let idxOff = 0;

    for (const prim of activePrims) {
      const pos = new Float32Array(prim.positions);
      const uv = new Float32Array(prim.uvs);
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
      if (pos.length / 3 > 65535) throw new Error('too many verts');
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], pos[i + k]);
          max[k] = Math.max(max[k], pos[i + k]);
        }
      }

      const pb = Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength);
      const nb = Buffer.from(nrm.buffer, nrm.byteOffset, nrm.byteLength);
      const ub = Buffer.from(uv.buffer, uv.byteOffset, uv.byteLength);
      let ib = Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength);
      const ipad = (4 - (ib.length % 4)) % 4;
      if (ipad) ib = Buffer.concat([ib, Buffer.alloc(ipad)]);

      primMeta.push({
        prim,
        vCount: pos.length / 3,
        iCount: idx.length,
        posOff,
        nrmOff,
        uvOff,
        idxOff,
        min: min.map(r4),
        max: max.map(r4),
      });
      posChunks.push(pb);
      nrmChunks.push(nb);
      uvChunks.push(ub);
      idxChunks.push(ib);
      posOff += pb.length;
      nrmOff += nb.length;
      uvOff += ub.length;
      idxOff += ib.length;
    }

    const posView = pushBuf(Buffer.concat(posChunks), 34962);
    const nrmView = pushBuf(Buffer.concat(nrmChunks), 34962);
    const uvView = pushBuf(Buffer.concat(uvChunks), 34962);
    const idxView = pushBuf(Buffer.concat(idxChunks), 34963);

    for (const m of primMeta) {
      const prim = m.prim;
      const pa = accessors.length;
      accessors.push({ bufferView: posView, byteOffset: m.posOff, componentType: 5126, count: m.vCount, type: 'VEC3', min: m.min, max: m.max });
      accessors.push({ bufferView: nrmView, byteOffset: m.nrmOff, componentType: 5126, count: m.vCount, type: 'VEC3' });
      accessors.push({ bufferView: uvView, byteOffset: m.uvOff, componentType: 5126, count: m.vCount, type: 'VEC2' });
      accessors.push({ bufferView: idxView, byteOffset: m.idxOff, componentType: 5123, count: m.iCount, type: 'SCALAR' });

      const mKey = `${prim.hex}|${prim.metal}|${prim.rough}|${prim.tex}|${prim.emissive ? prim.emissive.join(',') : ''}|${prim.emissiveTex ? 1 : 0}|${prim.alpha}`;
      let matIdx = matByKey.get(mKey);
      if (matIdx === undefined) {
        const [r, g, b] = linear(prim.hex).map(r4);
        const pbr = {
          baseColorFactor: [r, g, b, r4(prim.alpha)],
          metallicFactor: r4(prim.metal),
          roughnessFactor: r4(prim.rough),
        };
        if (prim.tex >= 0) pbr.baseColorTexture = { index: prim.tex };

        const dark = prim.tex < 0 && r + g + b < 0.08;
        const mat = {
          pbrMetallicRoughness: pbr,
          emissiveFactor: prim.emissive
            ? prim.emissive.map(r4)
            : prim.tex >= 0
              ? [0.085, 0.085, 0.09]
              : dark
                ? [0.015, 0.015, 0.018]
                : [r4(r * 0.035), r4(g * 0.035), r4(b * 0.035)],
        };
        if (prim.tex >= 0 && (prim.emissiveTex || !prim.emissive)) {
          mat.emissiveTexture = { index: prim.tex };
        }
        if (prim.alpha < 0.999) {
          mat.alphaMode = 'BLEND';
        }
        matIdx = materials.length;
        materials.push(mat);
        matByKey.set(mKey, matIdx);
      }

      primitives.push({
        attributes: { POSITION: pa, NORMAL: pa + 1, TEXCOORD_0: pa + 2 },
        indices: pa + 3,
        material: matIdx,
        mode: 4,
      });
    }

    const byPart = new Map();
    primitives.forEach((prim, i) => {
      const part = activePrims[i]?.part ?? 'body';
      if (!byPart.has(part)) byPart.set(part, []);
      byPart.get(part).push(prim);
    });
    const meshes = [];
    const nodes = [{ name: 'rig', children: [] }];
    for (const [part, prims] of byPart) {
      const meshIndex = meshes.length;
      meshes.push({ primitives: prims });
      const nodeIndex = nodes.length;
      const pivot = (this.pivots[part] ?? [0, 0, 0]).map(r4);
      nodes.push({ name: part, mesh: meshIndex, translation: pivot });
      nodes[0].children.push(nodeIndex);
    }

    const bin = Buffer.concat(bins);
    const json = {
      asset: { version: '2.0', generator: 'escape-berghain-npc-horsey' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes,
      meshes,
      materials,
      accessors,
      bufferViews,
      buffers: [{ byteLength: bin.length }],
    };
    if (images.length) {
      json.images = images;
      json.textures = textures;
      json.samplers = samplers;
    }

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

function assertOutwardGeometry() {
  const check = (name, buildFn) => {
    const f = new Figure();
    f.use(0xffffff);
    buildFn(f);
    const p = f.prims[0];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const n = p.positions.length / 3;
    for (let i = 0; i < p.positions.length; i += 3) {
      cx += p.positions[i];
      cy += p.positions[i + 1];
      cz += p.positions[i + 2];
    }
    cx /= n;
    cy /= n;
    cz /= n;
    let ok = 0;
    const tris = p.indices.length / 3;
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
      const mx = (pos[a] + pos[b] + pos[c]) / 3 - cx;
      const my = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3 - cy;
      const mz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3 - cz;
      if (nx * mx + ny * my + nz * mz > -1e-6) ok++;
    }
    if (ok !== tris) throw new Error(`${name} winding failed (${ok}/${tris} outward)`);
  };

  check('box', (f) => f.box(0, 0, 0, 1, 1, 1));
  check('taperBox', (f) => f.taperBox(0, -0.5, 0.5, 0, 0.8, 0.6, 1.2, 0.9, 0.1, -0.05));
  check('prism', (f) => f.prism(0, -0.5, 0.5, 0, 0.4, 0.35, 0.25, 0.2, 6, 0.2, 0.08, 0.05));
  check('orientedFrustum', (f) => f.orientedFrustum([0, 0, 0], [0.2, 0.6, 0.5], 0.3, 0.25, 0.12, 0.1));
}

// ============================================================================
// PS2-style horsey Character Builder (Tapered Limbs, Collars, Sculpted Heads)
// ============================================================================

function buildPerson(opt) {
  const f = new Figure();
  const eyeY = opt.eyeY;
  const faceZ = opt.faceZ;
  const bulk = opt.bulk ?? 1;
  const scale = Math.min(1.15, Math.max(0.55, eyeY / 1.48));
  const shoulderW = 0.44 * bulk * Math.min(1, scale * 1.05);
  const waistW = 0.29 * bulk * Math.min(1, scale * 1.05);
  const hipW = 0.32 * bulk * Math.min(1, scale * 1.05);
  const depth = Math.min(0.25, Math.max(0.14, faceZ * 0.88));
  const hipY = eyeY * 0.5;
  const shoulderY = eyeY - 0.16 * Math.min(1, scale * 1.08);
  const torsoH = Math.max(0.24, shoulderY - hipY);
  const chestY = hipY + torsoH * 0.54;
  const skin = opt.skin;
  const hair = opt.hair ?? 0x1a1410;
  const top = opt.top;
  const bottom = opt.bottom;
  const shoes = opt.shoes;
  const metal = opt.metal ?? 0.08;
  const rough = opt.rough ?? 0.72;
  const alpha = opt.alpha ?? 1;
  const ghostEm = opt.ghostEmissive ?? null;

  // Bake procedural 64x64 / 32x32 textures for this figure (only register textures actually used!)
  const outfitTex = f.addTex('outfit', makeOutfitTex(opt.pattern ?? 'default', opt));
  const pantsTex = opt.outfit === 'dress' ? -1 : f.addTex('pants', makePantsTex(opt.pantsStyle ?? 'plain', bottom));
  const needsHairTex =
    (!opt.head || opt.head === 'human') &&
    (opt.beard || (opt.hairStyle !== 'bald' && opt.hairStyle !== 'cap' && opt.hairStyle !== 'hood'));
  const hairTex = needsHairTex ? f.addTex('hair', makeHairTex(hair, opt.hairStyle)) : -1;

  const outfitOpts = { tex: outfitTex, alpha, emissive: ghostEm, emissiveTex: !!ghostEm };
  const pantsOpts = { tex: pantsTex, alpha, emissive: ghostEm, emissiveTex: !!ghostEm };
  const skinOpts = { alpha, emissive: ghostEm };
  const shoeOpts = { alpha, emissive: ghostEm };

  // ---------- LEGS & WEDGE SHOES (legL, legR) ----------
  const hipX = hipW * 0.36;
  const kneeY = hipY * 0.52;
  const ankleY = 0.075 * scale;
  const thighW = 0.135 * Math.min(bulk, 1.32) * Math.min(1, scale * 1.08);
  const calfW = thighW * 0.76;

  if (opt.outfit === 'dress') {
    // Flared disco gown on body + subtle heel tips on legL/legR so rig pivots exist cleanly
    f.limb('legL', -hipX * 0.75, hipY, 0);
    f.use(shoes, 0.25, 0.35, shoeOpts);
    wedgeShoe(f, -hipX * 0.75, 0.065, 0.09, 0.19, scale);
    f.limb('legR', hipX * 0.75, hipY, 0);
    f.use(shoes, 0.25, 0.35, shoeOpts);
    wedgeShoe(f, hipX * 0.75, 0.065, 0.09, 0.19, scale);

    f.limb('body', 0, 0, 0);
    f.use(0xffffff, metal, rough, outfitOpts);
    // Upper skirt (hips to knee)
    f.taperBox(0, kneeY, hipY + 0.06, 0, hipW * 1.24, depth * 1.18, hipW * 1.02, depth * 1.0, 0);
    // Flared lower gown (floor hem to knee)
    f.taperBox(0, 0.04, kneeY, 0, hipW * 1.72, depth * 1.48, hipW * 1.24, depth * 1.18, 0);
    // Gold hem trim
    if (opt.accent) {
      f.use(opt.accent, 0.55, 0.32, skinOpts);
      f.taperBox(0, 0.025, 0.065, 0, hipW * 1.76, depth * 1.52, hipW * 1.72, depth * 1.48, 0);
    }
  } else {
    for (const [name, side] of [
      ['legL', -1],
      ['legR', 1],
    ]) {
      const lx = side * hipX;
      f.limb(name, lx, hipY, 0);
      // Wedge retro sneaker / boot (heel + sloped toe box!)
      f.use(shoes, opt.shoeMetal ?? 0.12, opt.shoeRough ?? 0.48, shoeOpts);
      wedgeShoe(f, lx, ankleY, thighW * 0.92, 0.22 * Math.min(1, scale * 1.1), scale);
      if (opt.shoeStripe) {
        f.use(opt.shoeStripe, 0.1, 0.45, shoeOpts);
        f.taperBox(lx, 0.02, 0.048, 0.035, thighW * 0.96, 0.12, thighW * 0.94, 0.11, 0.01);
      }
      // Tapered lower leg (calf -> cuff)
      f.use(0xffffff, metal, rough, pantsOpts);
      f.taperBox(lx, ankleY, kneeY, 0, calfW * 0.88, calfW * 0.96, thighW * 0.92, thighW * 0.98, 0.01);
      // Tapered upper leg (knee -> hip with small overlap above pivot for clean swinging)
      f.taperBox(lx, kneeY, hipY + 0.03, 0.01, thighW * 0.92, thighW * 0.98, thighW * 1.06, thighW * 1.08, -0.01);
    }

    // Pelvis / Belt block on body
    f.limb('body', 0, 0, 0);
    f.use(0xffffff, metal, rough, pantsOpts);
    f.taperBox(0, hipY - 0.05, hipY + 0.08, 0, hipW * 1.02, depth * 0.95, waistW * 1.02, depth * 0.92, 0);
    // Belt + buckle
    if (opt.belt !== false) {
      f.use(opt.beltColor ?? 0x161414, 0.25, 0.45, skinOpts);
      f.taperBox(0, hipY + 0.05, hipY + 0.095, 0, waistW * 1.05, depth * 0.98, waistW * 1.05, depth * 0.98, 0);
      f.use(opt.buckleColor ?? 0xd8ba58, 0.78, 0.26, skinOpts);
      f.box(0, hipY + 0.072, depth * 0.5, 0.055, 0.042, 0.018);
    }
  }

  // ---------- TORSO (V-tapered PS2 Silhouette) ----------
  f.limb('body', 0, 0, 0);
  const waistY = hipY + 0.07;
  const midChestY = waistY + (shoulderY - waistY) * 0.52;
  const chestW = shoulderW * 0.92;
  const chestD = depth * 1.04;

  // Lower torso (waist flaring outward to chest)
  f.use(0xffffff, metal, rough, outfitOpts);
  f.taperBox(0, waistY, midChestY, 0, waistW * 0.98, depth * 0.88, chestW * 0.94, chestD, 0.01);
  // Upper torso (broad athletic PS2 chest -> shoulders)
  f.taperBox(0, midChestY, shoulderY + 0.01, 0.01, chestW * 0.94, chestD, shoulderW * 0.98, depth * 0.92, -0.01);
  // Sloped trapezius / shoulder cap
  f.taperBox(0, shoulderY + 0.01, shoulderY + 0.055, 0, shoulderW * 0.96, depth * 0.88, shoulderW * 0.52, depth * 0.62, 0);

  // Coat tails / long jacket / cloak skirt extension
  if (opt.coatTail) {
    f.use(0xffffff, metal, rough, outfitOpts);
    const tailBottom = opt.coatTail === 'long' ? hipY * 0.35 : hipY - 0.16;
    f.taperBox(0, tailBottom, waistY + 0.02, -0.015, hipW * 1.18, depth * 1.05, waistW * 1.04, depth * 0.92, 0.015);
  }

  // 3D Sculpted Open Collar / Jacket Lapels (signature horsey detail!)
  if (opt.collar === 'open' || opt.collar === 'lapels' || opt.collar === 'popped') {
    const colHex = opt.collarColor ?? top;
    f.use(colHex, metal, rough * 0.9, skinOpts);
    const lift = opt.collar === 'popped' ? 0.055 : 0.032;
    // Left & right flared collar wedges
    f.orientedFrustum(
      [-0.085, shoulderY + 0.015, depth * 0.34],
      [-0.125, shoulderY + lift + 0.02, depth * 0.44],
      0.055,
      0.022,
      0.068,
      0.018,
    );
    f.orientedFrustum(
      [0.085, shoulderY + 0.015, depth * 0.34],
      [0.125, shoulderY + lift + 0.02, depth * 0.44],
      0.055,
      0.022,
      0.068,
      0.018,
    );
    // Back collar rim
    f.taperBox(0, shoulderY + 0.02, shoulderY + 0.06 + (opt.collar === 'popped' ? 0.025 : 0), -depth * 0.22, 0.19, 0.04, 0.21, 0.035, -0.01);
  }
  if (opt.collar === 'lapels') {
    const lapHex = opt.collarColor ?? shadeHex(top, 1.08);
    f.use(lapHex, metal, rough * 0.85, skinOpts);
    // Left & right peaked 80s jacket lapels
    f.orientedFrustum(
      [-0.08, shoulderY - 0.01, depth * 0.49],
      [-0.035, midChestY - 0.04, depth * 0.51],
      0.062,
      0.018,
      0.036,
      0.016,
    );
    f.orientedFrustum(
      [0.08, shoulderY - 0.01, depth * 0.49],
      [0.035, midChestY - 0.04, depth * 0.51],
      0.062,
      0.018,
      0.036,
      0.016,
    );
  }

  // Sculpted 80s Shoulder Pads (drag oracle, Miami suits, glam)
  if (opt.pads) {
    f.use(opt.accent ?? top, 0.38, 0.36, skinOpts);
    f.orientedFrustum(
      [-shoulderW * 0.34, shoulderY + 0.025, 0],
      [-shoulderW * 0.6, shoulderY + 0.055, 0],
      0.13,
      depth * 0.72,
      0.075,
      depth * 0.45,
      [0, 1, 0],
    );
    f.orientedFrustum(
      [shoulderW * 0.34, shoulderY + 0.025, 0],
      [shoulderW * 0.6, shoulderY + 0.055, 0],
      0.13,
      depth * 0.72,
      0.075,
      depth * 0.45,
      [0, 1, 0],
    );
  }

  // 3D Harness Straps / Leather Studs (extra sculptural pop)
  if (opt.harness3d) {
    f.use(0x0b0c10, 0.52, 0.28, skinOpts);
    f.orientedFrustum(
      [-shoulderW * 0.32, shoulderY + 0.02, depth * 0.49],
      [shoulderW * 0.26, waistY + 0.06, depth * 0.46],
      0.038,
      0.022,
      0.038,
      0.022,
    );
    f.orientedFrustum(
      [shoulderW * 0.32, shoulderY + 0.02, depth * 0.49],
      [-shoulderW * 0.26, waistY + 0.06, depth * 0.46],
      0.038,
      0.022,
      0.038,
      0.022,
    );
    f.use(0xd4dce6, 0.85, 0.22, skinOpts);
    f.prism(0, chestY - 0.01, chestY + 0.01, depth * 0.52, 0.036, 0.015, 0.036, 0.015, 6);
  }

  // ---------- TAPERED TWO-SEGMENT ARMS (armL, armR) ----------
  const sleeveStyle = opt.sleeves ?? 'long'; // 'long' | 'short' | 'sleeveless' | 'rolled'
  const armLen = torsoH * 0.98;
  const elbowY = shoulderY - armLen * 0.46;
  const wristY = shoulderY - armLen * 0.88;
  const handBottom = shoulderY - armLen;
  const armX = shoulderW * 0.54;
  const armR = 0.054 * Math.min(bulk, 1.32) * Math.min(1, scale * 1.08);
  const sleeveColor = opt.sleeveColor ?? top;

  for (const [name, side] of [
    ['armL', -1],
    ['armR', 1],
  ]) {
    const ax = side * armX;
    f.limb(name, ax, shoulderY, 0);

    // Shoulder deltoid cap (overlaps torso slightly so swinging arms never detach!)
    const upperBare = sleeveStyle === 'sleeveless';
    if (upperBare) f.use(skin, 0.02, 0.78, skinOpts);
    else if (opt.sleeveTextured) f.use(0xffffff, metal, rough, outfitOpts);
    else f.use(sleeveColor, metal, rough, skinOpts);

    f.taperBox(ax - side * 0.015, elbowY, shoulderY + 0.025, 0, armR * 1.75, armR * 1.75, armR * 2.05, armR * 1.95, 0, -side * 0.015);

    // Short sleeve cuff detail if short/rolled
    if (sleeveStyle === 'short' || sleeveStyle === 'rolled') {
      const cuffY = sleeveStyle === 'rolled' ? elbowY + 0.02 : elbowY + 0.05;
      f.use(sleeveStyle === 'rolled' ? opt.cuffColor ?? shadeHex(sleeveColor, 1.15) : shadeHex(sleeveColor, 0.85), metal, rough, skinOpts);
      f.taperBox(ax, cuffY - 0.025, cuffY + 0.025, 0.005, armR * 1.85, armR * 1.85, armR * 1.85, armR * 1.85);
    }

    // Forearm (angled slightly forward for classic horsey idle posture!)
    const forearmBare = sleeveStyle === 'short' || sleeveStyle === 'sleeveless' || sleeveStyle === 'rolled';
    if (forearmBare) f.use(skin, 0.02, 0.8, skinOpts);
    else if (opt.sleeveTextured) f.use(0xffffff, metal, rough, outfitOpts);
    else f.use(sleeveColor, metal, rough, skinOpts);

    f.taperBox(ax, wristY, elbowY + 0.01, 0.032, armR * 1.32, armR * 1.38, armR * 1.65, armR * 1.65, -0.028);

    // Wrist watch / gold bracelet / cuff
    if (opt.watch && side === -1) {
      f.use(0xe4c254, 0.85, 0.22, skinOpts);
      f.taperBox(ax, wristY + 0.01, wristY + 0.04, 0.034, armR * 1.44, armR * 1.48, armR * 1.44, armR * 1.48);
    }

    // Faceted low-poly hand mitt
    f.use(opt.gloves ?? skin, opt.gloves ? 0.45 : 0.02, opt.gloves ? 0.3 : 0.8, skinOpts);
    f.taperBox(ax, handBottom, wristY + 0.005, 0.04, armR * 0.95, armR * 1.3, armR * 1.25, armR * 1.35, -0.008);
  }

  // ---------- HEAD (head pivot at neck base) ----------
  f.limb('head', 0, shoulderY + 0.02, 0);
  if (opt.head === 'human' || !opt.head) {
    buildHumanHead(f, opt, eyeY, faceZ, skin, hair, hairTex, scale, skinOpts);
  } else {
    buildEquineHead(f, opt, eyeY, faceZ, opt.coat, opt.mane);
  }

  // Head-mounted accessories (move WITH head when nodding!)
  if (opt.glasses) buildGlasses(f, opt.glasses, eyeY, faceZ, opt.head && opt.head !== 'human');
  if (opt.headset) buildHeadset(f, eyeY, faceZ);

  // ---------- BODY EXTRAS (chains, lasso, ice cream cone) ----------
  f.limb('body', 0, 0, 0);
  if (opt.chain) buildChain(f, shoulderY, chestY, depth);
  for (const extra of opt.extras ?? []) extra(f, { eyeY, faceZ, shoulderW, depth, chestY, shoulderY, hipY, scale });

  return f;
}

function wedgeShoe(f, cx, h, w, d, scale = 1) {
  // Flat sole + sloped toe box toward +Z
  const soleH = 0.02 * scale;
  f.taperBox(cx, 0, soleH, 0.035 * scale, w * 1.04, d, w * 1.02, d * 0.98, 0);
  // Heel/ankle block
  f.taperBox(cx, soleH, h, -0.015 * scale, w, d * 0.56, w * 0.86, d * 0.48, -0.005);
  // Tapered front toe wedge
  f.taperBox(cx, soleH, h * 0.66, 0.062 * scale, w * 0.96, d * 0.48, w * 0.72, d * 0.34, -0.02 * scale);
}

// ============================================================================
// Chiseled PS2 Human Head (UV-Mapped Painted Face + Sculpted Hair)
// ============================================================================

function buildHumanHead(f, opt, eyeY, faceZ, skin, hair, hairTex, scale, skinOpts) {
  const s = Math.min(1.08, Math.max(0.62, scale));
  const headW = 0.22 * s;
  const headH = 0.275 * s;
  const headD = 0.21 * s;
  const cy = eyeY + 0.032 * s;
  const frontZ = faceZ + 0.012 * s;
  const backZ = frontZ - headD;
  const cz = (frontZ + backZ) * 0.5;
  const neckY0 = eyeY - 0.175 * s;
  const chinY = cy - headH * 0.48;
  const jawY = cy - headH * 0.2;
  const topY = cy + headH * 0.52;

  const faceTex = f.addTex('face', makeHumanFaceTex(opt));

  // Tapered 6-sided neck (reaches inside collar so head tilt shows zero gap)
  f.use(opt.faceStyle === 'mask' ? 0x14161e : skin, opt.faceStyle === 'mask' ? 0.65 : 0.02, opt.faceStyle === 'mask' ? 0.2 : 0.8, skinOpts);
  f.prism(0, neckY0, jawY + 0.01, cz * 0.55, 0.055 * s, 0.055 * s, 0.048 * s, 0.05 * s, 6);

  // Chiseled jaw + main cranium shell (skip front face so our textured front mask owns it cleanly!)
  // Lower jaw tapers sharply down to chin
  f.taperBox(0, chinY, jawY, cz - 0.005 * s, headW * 0.58, headD * 0.68, headW * 0.96, headD * 0.95, 0.008 * s, 0, true);
  // Main upper skull (slight taper at top)
  f.taperBox(0, jawY, topY, cz, headW * 0.96, headD * 0.96, headW * 0.86, headD * 0.88, -0.005 * s, 0, true);

  // Front painted PS2 face (2 angled facets: upper face + tapered jaw/chin, mapped seamlessly to faceTex!)
  f.use(
    0xffffff,
    opt.faceStyle === 'mask' ? 0.55 : 0.02,
    opt.faceStyle === 'mask' ? 0.22 : 0.72,
    {
      tex: faceTex,
      alpha: opt.alpha ?? 1,
      emissive: opt.ghostEmissive ?? null,
      emissiveTex: true,
    },
  );
  const fwTop = headW * 0.43;
  const fwMid = headW * 0.48;
  const fwBot = headW * 0.29;
  const zTop = cz - 0.005 * s + (headD * 0.88) / 2;
  const zMid = cz + (headD * 0.96) / 2;
  const zBot = cz - 0.005 * s + (headD * 0.68) / 2;

  // Upper face quad (forehead -> jaw, UV v: 0.0 -> 0.72)
  f.quad(
    [-fwMid, jawY, zMid],
    [fwMid, jawY, zMid],
    [fwTop, topY, zTop],
    [-fwTop, topY, zTop],
    [
      [0, 0.72],
      [1, 0.72],
      [0.95, 0],
      [0.05, 0],
    ],
  );
  // Lower chin quad (chin -> jaw, UV v: 0.72 -> 1.0)
  f.quad(
    [-fwBot, chinY, zBot],
    [fwBot, chinY, zBot],
    [fwMid, jawY, zMid],
    [-fwMid, jawY, zMid],
    [
      [0.18, 1],
      [0.82, 1],
      [1, 0.72],
      [0, 0.72],
    ],
  );

  // Subtle low-poly protruding nose wedge & ears (not on latex mask)
  if (opt.faceStyle !== 'mask') {
    f.use(shadeHex(skin, 0.96), 0.02, 0.8, skinOpts);
    f.taperBox(0, eyeY - 0.055 * s, eyeY + 0.005 * s, zMid + 0.008 * s, 0.032 * s, 0.03 * s, 0.018 * s, 0.012 * s, -0.008 * s);
    // Low-poly ears
    f.taperBox(-headW * 0.5, eyeY - 0.035 * s, eyeY + 0.02 * s, cz, 0.022 * s, 0.038 * s, 0.026 * s, 0.042 * s);
    f.taperBox(headW * 0.5, eyeY - 0.035 * s, eyeY + 0.02 * s, cz, 0.022 * s, 0.038 * s, 0.026 * s, 0.042 * s);
  } else {
    // Sleek glossy helmet crest / dome on rubber knight
    f.use(0x161922, 0.75, 0.16);
    f.taperBox(0, topY - 0.01, topY + 0.045 * s, cz - 0.005, headW * 0.86, headD * 0.86, headW * 0.55, headD * 0.58);
  }

  // 3D Sculpted Beard chin volume
  if (opt.beard) {
    f.use(0xffffff, 0.04, 0.78, { tex: hairTex });
    f.taperBox(0, chinY - 0.028 * s, jawY + 0.005 * s, zMid - 0.01 * s, headW * 0.44, 0.075 * s, headW * 0.82, 0.08 * s, 0.012 * s);
  }

  // ---------- SCULPTED PS2 HAIR STYLES ----------
  const style = opt.hairStyle ?? 'crop';
  if (style === 'bald') {
    if (opt.faceStyle !== 'mask') {
      // Sculpted cranium dome for bald heads (e.g., intimidating bouncer)
      f.use(skin, 0.04, 0.7, skinOpts);
      f.taperBox(0, topY - 0.008, topY + 0.045 * s, cz - 0.005, headW * 0.84, headD * 0.84, headW * 0.56, headD * 0.58);
    }
    return;
  }

  const hMetal = style === 'cap' || style === 'hood' ? 0.22 : 0.05;
  const hRough = style === 'cap' ? 0.35 : style === 'hood' ? 0.5 : 0.72;
  const hairMatOpts = style === 'cap' || style === 'hood' ? skinOpts : { tex: hairTex, alpha: opt.alpha ?? 1, emissive: opt.ghostEmissive ?? null, emissiveTex: !!opt.ghostEmissive };
  f.use(style === 'cap' || style === 'hood' ? hair : 0xffffff, hMetal, hRough, hairMatOpts);

  if (style === 'slick') {
    // Tommy Vercetti slicked-back 80s PS2 hair with sculpted front wave & tapered back
    f.taperBox(0, topY - 0.025, topY + 0.055 * s, cz - 0.005, headW * 1.02, headD * 1.02, headW * 0.88, headD * 0.94, -0.015);
    // Front swept pompadour wave
    f.taperBox(0, topY - 0.01, topY + 0.062 * s, zTop - 0.01, headW * 0.9, 0.07 * s, headW * 0.74, 0.06 * s, 0.018);
    // Tapered sides & back nape
    f.taperBox(0, jawY - 0.01, topY, backZ - 0.01, headW * 0.88, 0.055 * s, headW * 1.0, 0.065 * s, 0.005);
    f.taperBox(-headW * 0.48, jawY + 0.02, topY, cz - 0.01, 0.035 * s, headD * 0.82, 0.04 * s, headD * 0.9);
    f.taperBox(headW * 0.48, jawY + 0.02, topY, cz - 0.01, 0.035 * s, headD * 0.82, 0.04 * s, headD * 0.9);
  } else if (style === 'bob') {
    // Wavy 80s blonde bob flaring slightly at the jaw
    f.taperBox(0, topY - 0.02, topY + 0.055 * s, cz - 0.01, headW * 1.08, headD * 1.06, headW * 0.92, headD * 0.92);
    f.taperBox(-headW * 0.52, chinY - 0.03, topY, cz - 0.01, 0.075 * s, headD * 0.96, 0.052 * s, headD * 0.9, 0, -0.015);
    f.taperBox(headW * 0.52, chinY - 0.03, topY, cz - 0.01, 0.075 * s, headD * 0.96, 0.052 * s, headD * 0.9, 0, 0.015);
    f.taperBox(0, chinY - 0.04, topY, backZ - 0.015, headW * 1.12, 0.075 * s, headW * 0.98, 0.065 * s);
    // Side-swept bangs
    f.taperBox(0.02, topY - 0.045, topY + 0.03, zTop + 0.008, headW * 0.82, 0.04 * s, headW * 0.88, 0.04 * s);
  } else if (style === 'mullet') {
    // 80s Miami feathered crop + mullet back
    f.taperBox(0, topY - 0.02, topY + 0.055 * s, cz, headW * 1.02, headD * 1.04, headW * 0.86, headD * 0.94);
    f.taperBox(0, chinY - 0.07, topY, backZ - 0.018, headW * 1.04, 0.07 * s, headW * 0.92, 0.06 * s, 0.01);
    f.taperBox(-headW * 0.48, jawY, topY, cz - 0.01, 0.035 * s, headD * 0.8, 0.04 * s, headD * 0.88);
    f.taperBox(headW * 0.48, jawY, topY, cz - 0.01, 0.035 * s, headD * 0.8, 0.04 * s, headD * 0.88);
  } else if (style === 'afro') {
    // Funky 80s feathered disco afro
    f.prism(0, topY - 0.05, topY + 0.165 * s, cz - 0.015, headW * 0.8, headD * 0.78, headW * 0.64, headD * 0.62, 8, 0.2);
    f.prism(0, jawY + 0.02, topY + 0.03, cz - 0.025, headW * 0.74, headD * 0.74, headW * 0.84, headD * 0.82, 8, 0.2);
  } else if (style === 'wig') {
    // Huge iconic sculpted 80s disco diva wig!
    f.prism(0, topY - 0.04, topY + 0.19 * s, cz - 0.01, headW * 0.84, headD * 0.78, headW * 0.72, headD * 0.68, 8, 0.25, -0.02);
    f.taperBox(-headW * 0.64, chinY - 0.12, topY + 0.08, cz - 0.01, 0.11 * s, headD * 0.86, 0.095 * s, headD * 0.9, 0, -0.02);
    f.taperBox(headW * 0.64, chinY - 0.12, topY + 0.08, cz - 0.01, 0.11 * s, headD * 0.86, 0.095 * s, headD * 0.9, 0, 0.02);
    f.taperBox(0, chinY - 0.14, topY + 0.06, backZ - 0.03, headW * 1.32, 0.095 * s, headW * 1.15, 0.09 * s);
  } else if (style === 'bandana') {
    // Biker bandana headband + rugged crop
    f.taperBox(0, topY - 0.015, topY + 0.045 * s, cz, headW * 0.98, headD * 0.98, headW * 0.86, headD * 0.88);
    f.use(opt.bandanaColor ?? 0xb82228, 0.05, 0.75);
    f.taperBox(0, topY - 0.045, topY + 0.005, cz, headW * 1.06, headD * 1.06, headW * 1.04, headD * 1.04);
    // Bandana knot tails at back
    f.orientedFrustum([0, topY - 0.02, backZ - 0.01], [-0.05, jawY - 0.02, backZ - 0.055], 0.032, 0.018, 0.02, 0.012);
    f.orientedFrustum([0, topY - 0.02, backZ - 0.01], [0.045, jawY - 0.03, backZ - 0.055], 0.032, 0.018, 0.02, 0.012);
  } else if (style === 'cap') {
    // Peaked security / biker leather / animal-control cap with angled visor brim!
    f.prism(0, topY - 0.035, topY + 0.065 * s, cz, headW * 0.56, headD * 0.56, headW * 0.52, headD * 0.52, 8, 0.2, 0.008);
    // Glossy angled front visor
    f.use(shadeHex(hair, 0.72), 0.45, 0.25);
    f.orientedFrustum(
      [0, topY - 0.022, zTop - 0.01],
      [0, topY - 0.045, zTop + 0.085 * s],
      headW * 0.86,
      0.016 * s,
      headW * 0.64,
      0.01 * s,
    );
    // Cap badge / silver trim if specified
    if (opt.capBadge) {
      f.use(opt.capBadge, 0.82, 0.22);
      f.box(0, topY + 0.018, zTop + 0.008, 0.036, 0.036, 0.014);
    }
  } else if (style === 'bun') {
    f.taperBox(0, topY - 0.02, topY + 0.042 * s, cz - 0.005, headW * 1.02, headD * 1.0, headW * 0.88, headD * 0.9);
    f.taperBox(0, jawY, topY, backZ - 0.01, headW * 0.92, 0.05 * s, headW * 0.96, 0.055 * s);
    f.prism(0, topY - 0.03, topY + 0.065 * s, backZ - 0.045 * s, 0.058 * s, 0.055 * s, 0.042 * s, 0.042 * s, 6);
  } else if (style === 'hood') {
    // Deep dramatic darkroom hood framing face in shadow
    f.taperBox(0, topY - 0.02, topY + 0.075 * s, cz - 0.015, headW * 1.24, headD * 1.18, headW * 0.86, headD * 0.96, -0.02);
    f.taperBox(-headW * 0.58, chinY - 0.04, topY + 0.02, cz, 0.065 * s, headD * 1.12, 0.06 * s, headD * 1.08);
    f.taperBox(headW * 0.58, chinY - 0.04, topY + 0.02, cz, 0.065 * s, headD * 1.12, 0.06 * s, headD * 1.08);
    f.taperBox(0, chinY - 0.06, topY + 0.02, backZ - 0.025, headW * 1.2, 0.07 * s, headW * 1.15, 0.07 * s);
  } else if (style === 'long') {
    f.taperBox(0, topY - 0.02, topY + 0.05 * s, cz - 0.01, headW * 1.06, headD * 1.04, headW * 0.9, headD * 0.92);
    f.taperBox(-headW * 0.5, chinY - 0.1 * s, topY, cz - 0.01, 0.055 * s, headD * 0.86, 0.05 * s, headD * 0.88);
    f.taperBox(headW * 0.5, chinY - 0.1 * s, topY, cz - 0.01, 0.055 * s, headD * 0.86, 0.05 * s, headD * 0.88);
    f.taperBox(0, chinY - 0.12 * s, topY, backZ - 0.018, headW * 0.98, 0.06 * s, headW * 0.95, 0.06 * s);
  } else {
    // Classic PS2 chiseled crop / tousled raver hair
    f.taperBox(0, topY - 0.022, topY + 0.052 * s, cz - 0.005, headW * 1.02, headD * 1.02, headW * 0.86, headD * 0.92);
    f.taperBox(0, jawY + 0.01, topY, backZ - 0.008, headW * 0.86, 0.045 * s, headW * 0.96, 0.055 * s);
  }
}

// ============================================================================
// Sculpted Equine Heads: Unmistakable Horse, Donkey, and Rare Unicorn
// ============================================================================

function buildEquineHead(f, opt, eyeY, faceZ, coat = 0x6a4324, mane = 0x16120e) {
  const kind = opt.head; // 'horse' | 'donkey' | 'unicorn'
  const cy = eyeY + 0.025;
  const cz = faceZ - 0.085;
  const neckBaseY = eyeY - 0.18;

  const eqTex = f.addTex('equine', makeEquineHeadTex(kind, coat, mane));
  const maneTex = f.addTex('mane', makeHairTex(mane, 'normal'));

  const coatRough = kind === 'unicorn' ? 0.36 : 0.68;
  const coatMetal = kind === 'unicorn' ? 0.18 : 0.05;
  const coatEm = kind === 'unicorn' ? [0.14, 0.13, 0.18] : null;

  // Muscular arched equine neck
  f.use(coat, coatMetal, coatRough, { emissive: coatEm });
  f.orientedFrustum([0, neckBaseY, cz * 0.2], [0, cy + 0.03, cz - 0.02], 0.15, 0.15, 0.14, 0.16);

  // Chiseled cranial skull + cheekbones (textured with painted blaze/eyes/coat!)
  f.use(0xffffff, coatMetal, coatRough, { tex: eqTex, emissive: coatEm, emissiveTex: true });
  const skullW = kind === 'donkey' ? 0.21 : 0.195;
  f.taperBox(0, eyeY - 0.075, cy + 0.115, cz, skullW * 1.04, 0.23, skullW * 0.82, 0.19, -0.015);

  // Elongated angled equine snout tapering toward nostrils!
  const snoutLen = kind === 'donkey' ? 0.19 : 0.245;
  const snoutDrop = kind === 'donkey' ? 0.095 : 0.115;
  const snoutW0 = kind === 'donkey' ? 0.15 : 0.145;
  const snoutW1 = kind === 'donkey' ? 0.125 : 0.098;
  const snoutH0 = kind === 'donkey' ? 0.145 : 0.14;
  const snoutH1 = kind === 'donkey' ? 0.11 : 0.088;

  const snoutStart = [0, eyeY - 0.025, faceZ - 0.04];
  const snoutEnd = [0, eyeY - 0.025 - snoutDrop, faceZ - 0.04 + snoutLen];
  f.orientedFrustum(snoutStart, snoutEnd, snoutW0, snoutH0, snoutW1, snoutH1, [0, 1, 0]);

  // Distinct sculpted muzzle tip & nostrils + lower jaw
  const muzzleHex = kind === 'donkey' ? 0xe6dfd0 : kind === 'unicorn' ? 0xe6d8ee : shadeHex(coat, 0.58);
  f.use(muzzleHex, coatMetal, coatRough + 0.06, { emissive: coatEm });
  const tipEnd = [0, snoutEnd[1] - 0.012, snoutEnd[2] + 0.032];
  f.orientedFrustum(snoutEnd, tipEnd, snoutW1 * 1.04, snoutH1 * 1.02, snoutW1 * 0.88, snoutH1 * 0.86, [0, 1, 0]);

  // Sculpted dark nostrils on sides of muzzle tip
  f.use(0x161212, 0.05, 0.55);
  const nostX = snoutW1 * 0.38;
  f.box(-nostX, snoutEnd[1] + 0.012, snoutEnd[2] + 0.018, 0.024, 0.026, 0.026);
  f.box(nostX, snoutEnd[1] + 0.012, snoutEnd[2] + 0.018, 0.024, 0.026, 0.026);

  // Lower chin/jawline bevel
  f.use(coat, coatMetal, coatRough, { emissive: coatEm });
  f.orientedFrustum(
    [0, eyeY - 0.085, faceZ - 0.08],
    [0, snoutEnd[1] - 0.032, snoutEnd[2] - 0.02],
    0.135,
    0.06,
    snoutW1 * 0.78,
    0.04,
    [0, 1, 0],
  );

  // Expressive 3D protruding equine eyes (cleanly readable at conversation eyeY!)
  for (const side of [-1, 1]) {
    const ex = side * (skullW * 0.44);
    const ez = faceZ - 0.015;
    // Eye socket brow ridge
    f.use(shadeHex(coat, 0.82), coatMetal, coatRough);
    f.box(ex * 1.02, eyeY + 0.028, ez, 0.044, 0.018, 0.046);
    // Sclera
    f.use(0xf6f4ee, 0.02, 0.32);
    f.box(ex, eyeY, ez + 0.008, 0.036, 0.034, 0.034);
    // Dark expressive pupil/iris
    f.use(kind === 'unicorn' ? 0x2c3ca8 : 0x16100c, 0.12, 0.2);
    f.box(ex + side * 0.006, eyeY, ez + 0.02, 0.024, 0.024, 0.018);
    // Specular catchlight dot
    f.use(0xffffff, 0, 0.1, { emissive: [0.35, 0.35, 0.35] });
    f.box(ex + side * 0.008, eyeY + 0.007, ez + 0.028, 0.008, 0.008, 0.006);
  }

  // ---------- UNMISTAKABLE EARS (Horse vs Extra-Long Splayed Donkey vs Unicorn) ----------
  if (kind === 'donkey') {
    // EXTRA-LONG splayed grey donkey ears tilted outward ~28 degrees!
    for (const side of [-1, 1]) {
      const base = [side * 0.072, cy + 0.085, cz - 0.015];
      const tip = [side * 0.235, cy + 0.355, cz + 0.02];
      // Outer grey donkey ear
      f.use(shadeHex(coat, 0.88), 0.04, 0.78);
      f.orientedFrustum(base, tip, 0.068, 0.042, 0.034, 0.018, [0, 0, 1]);
      // Pale cream inner-ear facet facing forward
      f.use(0xe2dacb, 0.02, 0.82);
      f.orientedFrustum(
        [base[0] + side * 0.005, base[1] + 0.015, base[2] + 0.016],
        [tip[0] - side * 0.012, tip[1] - 0.035, tip[2] + 0.01],
        0.042,
        0.016,
        0.018,
        0.01,
        [0, 0, 1],
      );
      // Dark ear tip accent
      f.use(mane, 0.04, 0.78);
      f.orientedFrustum(
        [tip[0] - side * 0.02, tip[1] - 0.035, tip[2]],
        [tip[0] + side * 0.012, tip[1] + 0.022, tip[2] + 0.004],
        0.034,
        0.018,
        0.012,
        0.01,
        [0, 0, 1],
      );
    }
  } else {
    // Pointed upright horse / unicorn ears angled slightly forward
    for (const side of [-1, 1]) {
      const base = [side * 0.068, cy + 0.095, cz - 0.015];
      const tip = [side * 0.098, cy + 0.245, cz + 0.03];
      f.use(coat, coatMetal, coatRough, { emissive: coatEm });
      f.orientedFrustum(base, tip, 0.056, 0.048, 0.014, 0.012, [0, 0, 1]);
      // Inner ear shading
      f.use(kind === 'unicorn' ? 0xf2cce2 : shadeHex(coat, 0.55), 0.04, 0.75);
      f.orientedFrustum(
        [base[0], base[1] + 0.01, base[2] + 0.018],
        [tip[0], tip[1] - 0.025, tip[2] + 0.008],
        0.032,
        0.014,
        0.008,
        0.008,
        [0, 0, 1],
      );
    }
  }

  // ---------- ARCHED MANE CREST ----------
  const maneEm = kind === 'unicorn' ? [0.16, 0.12, 0.24] : null;
  f.use(0xffffff, kind === 'unicorn' ? 0.25 : 0.06, kind === 'unicorn' ? 0.42 : 0.72, {
    tex: maneTex,
    emissive: maneEm,
    emissiveTex: true,
  });

  if (kind === 'donkey') {
    // Shaggy upright dark bristle mane along crest & neck
    f.taperBox(0, cy + 0.07, cy + 0.165, cz - 0.06, 0.065, 0.13, 0.048, 0.11, -0.02);
    f.taperBox(0, neckBaseY + 0.04, cy + 0.09, cz - 0.12, 0.072, 0.085, 0.058, 0.095, 0.02);
    // Shaggy forehead tuft
    f.taperBox(0, cy + 0.06, cy + 0.13, faceZ - 0.03, 0.062, 0.05, 0.045, 0.04, 0.02);
  } else {
    // Sweeping arched equine mane from forelock over poll down neck
    const mw = kind === 'unicorn' ? 0.095 : 0.068;
    // Forelock sweeping forward between ears
    f.orientedFrustum([0, cy + 0.12, cz + 0.01], [0, cy + 0.04, faceZ + 0.02], mw * 0.9, 0.048, mw * 0.45, 0.025, [0, 1, 0]);
    // Crown crest
    f.taperBox(0, cy + 0.08, cy + 0.175, cz - 0.055, mw, 0.14, mw * 0.72, 0.11, -0.025);
    // Upper neck swept mane
    f.taperBox(0, eyeY - 0.06, cy + 0.11, cz - 0.13, mw * 1.15, 0.11, mw * 0.92, 0.1, 0.02);
    // Lower flowing neck mane
    f.taperBox(0, neckBaseY - 0.01, eyeY - 0.02, cz - 0.12, mw * 1.25, 0.11, mw * 1.05, 0.1, -0.02);
    if (kind === 'unicorn') {
      // Extra flowing pastel lavender side locks
      f.use(0xe2b8f6, 0.25, 0.38, { emissive: [0.22, 0.14, 0.3] });
      f.orientedFrustum([-0.045, cy + 0.08, cz - 0.07], [-0.11, neckBaseY + 0.02, cz - 0.09], 0.045, 0.055, 0.022, 0.032);
      f.orientedFrustum([0.045, cy + 0.08, cz - 0.07], [0.11, neckBaseY + 0.02, cz - 0.09], 0.045, 0.055, 0.022, 0.032);
    }
  }

  // ---------- RARE UNICORN GOLDEN-IRIDESCENT SPIRAL HORN ----------
  if (kind === 'unicorn') {
    const hornTex = f.addTex('horn', makeHornTex());
    // Shimmering golden-iridescent spiral horn angled ~26° forward from forehead!
    f.use(0xffffff, 0.65, 0.22, {
      tex: hornTex,
      emissive: [0.85, 0.7, 0.26],
      emissiveTex: true,
    });
    const baseY = cy + 0.095;
    const baseZ = faceZ - 0.015;
    const segs = 4;
    const totalLen = 0.35;
    const tilt = 0.44; // ~25 deg forward
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const r0 = 0.034 * (1 - t0 * 0.88);
      const r1 = 0.034 * (1 - t1 * 0.94);
      const y0 = baseY + Math.cos(tilt) * totalLen * t0;
      const y1 = baseY + Math.cos(tilt) * totalLen * t1;
      const z0 = baseZ + Math.sin(tilt) * totalLen * t0;
      const z1 = baseZ + Math.sin(tilt) * totalLen * t1;
      f.prism(0, y0, y1, z0, r0, r0, r1, r1, 6, i * 0.42, z1 - z0, 0);
    }
  }
}

// ============================================================================
// Accessories (Shades, Chains, Headset, Coiled Lasso, Ice Cream Cone)
// ============================================================================

function buildGlasses(f, style, eyeY, faceZ, isEquine = false) {
  const z = isEquine ? faceZ + 0.025 : faceZ + 0.034;
  const spread = isEquine ? 0.072 : 0.048;
  const frameHex = style === 'aviator' ? 0xd4b65c : style === 'round' ? 0x26262e : 0x16181e;
  const lensHex = style === 'tinted' ? 0x4e2678 : style === 'round' ? 0x2a3648 : 0x10141c;

  // Bridge + temple arms
  f.use(frameHex, 0.65, 0.25);
  f.box(0, eyeY + 0.008, z, spread * 0.9, 0.01, 0.01);
  f.box(-spread * 1.45, eyeY + 0.008, z - 0.055, 0.01, 0.01, 0.11);
  f.box(spread * 1.45, eyeY + 0.008, z - 0.055, 0.01, 0.01, 0.11);

  // Lenses
  f.use(lensHex, 0.55, 0.14, { emissive: style === 'tinted' ? [0.1, 0.04, 0.18] : [0.02, 0.03, 0.05] });
  if (style === 'round') {
    f.prism(-spread, eyeY - 0.022, eyeY + 0.022, z + 0.004, 0.026, 0.01, 0.026, 0.01, 6);
    f.prism(spread, eyeY - 0.022, eyeY + 0.022, z + 0.004, 0.026, 0.01, 0.026, 0.01, 6);
  } else {
    // Tapered aviator / retro shades lenses
    f.taperBox(-spread, eyeY - 0.022, eyeY + 0.022, z + 0.004, 0.046, 0.012, 0.058, 0.012);
    f.taperBox(spread, eyeY - 0.022, eyeY + 0.022, z + 0.004, 0.046, 0.012, 0.058, 0.012);
  }
}

function buildHeadset(f, eyeY, faceZ) {
  const cz = faceZ - 0.08;
  f.use(0x262a34, 0.55, 0.35);
  // Headband over crown
  f.taperBox(0, eyeY + 0.13, eyeY + 0.16, cz, 0.23, 0.032, 0.18, 0.028);
  // Ear cups
  f.prism(-0.118, eyeY - 0.04, eyeY + 0.04, cz, 0.024, 0.042, 0.024, 0.042, 6);
  f.prism(0.118, eyeY - 0.04, eyeY + 0.04, cz, 0.024, 0.042, 0.024, 0.042, 6);
  // Boom mic sweeping to mouth
  f.orientedFrustum([0.115, eyeY - 0.02, cz + 0.02], [0.03, eyeY - 0.085, faceZ + 0.045], 0.012, 0.012, 0.016, 0.016);
  // Tiny green status LED on earcup
  f.use(0x22ee66, 0.1, 0.2, { emissive: [0.1, 0.75, 0.25] });
  f.box(0.132, eyeY + 0.01, cz + 0.015, 0.012, 0.012, 0.012);
}

function buildChain(f, shoulderY, chestY, depth) {
  f.use(0xe8c452, 0.88, 0.22, { emissive: [0.12, 0.09, 0.02] });
  const z = depth * 0.52;
  f.orientedFrustum([-0.068, shoulderY + 0.01, z], [0, chestY + 0.01, z + 0.012], 0.018, 0.014, 0.018, 0.014);
  f.orientedFrustum([0.068, shoulderY + 0.01, z], [0, chestY + 0.01, z + 0.012], 0.018, 0.014, 0.018, 0.014);
  f.prism(0, chestY - 0.012, chestY + 0.012, z + 0.016, 0.024, 0.01, 0.024, 0.01, 6);
}

function buildLasso(f, a) {
  // Coiled rope lasso hanging cleanly on animal control's hip/front
  f.use(0xc8a464, 0.12, 0.72);
  const cx = a.shoulderW * 0.42;
  const cy = a.hipY + 0.05;
  const cz = a.depth * 0.58;
  const segs = 10;
  const rad = 0.14;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * rad * 0.75, cy + Math.sin(a0) * rad, cz + Math.cos(a0) * 0.04];
    const p1 = [cx + Math.cos(a1) * rad * 0.75, cy + Math.sin(a1) * rad, cz + Math.cos(a1) * 0.04];
    f.orientedFrustum(p0, p1, 0.028, 0.028, 0.028, 0.028);
  }
}

function buildIceCreamCone(f, a) {
  const x = a.shoulderW * 0.46;
  const y = a.chestY - 0.08;
  const z = a.faceZ + 0.08;
  // Crisp waffle cone
  f.use(0xd49c56, 0.05, 0.76);
  f.prism(x, y - 0.16, y, z, 0.008, 0.008, 0.05, 0.05, 6);
  // Double scoop pastel strawberry & vanilla!
  f.use(0xf6a6c4, 0.05, 0.48);
  f.prism(x, y - 0.005, y + 0.075, z, 0.056, 0.056, 0.042, 0.042, 6);
  f.use(0xfcf6e8, 0.05, 0.45);
  f.prism(x, y + 0.062, y + 0.125, z, 0.044, 0.044, 0.022, 0.022, 6);
}

// ============================================================================
// The 25 NPC Cast Definitions (horsey / 80s Berlin club cast)
// ============================================================================

const cast = [
  {
    file: 'npc_friday_guy',
    ...faceTarget(HUMAN),
    bulk: 1.06,
    skin: 0xd49b72,
    hair: 0x18120e,
    hairStyle: 'slick',
    stubble: true,
    expression: 'smirk',
    top: 0x18a4b2,
    collarColor: 0x18a4b2,
    sleeveColor: 0x169aa8,
    sleeveTextured: true,
    pattern: 'hawaiian',
    collar: 'open',
    sleeves: 'short',
    bottom: 0x3a5a8c,
    pantsStyle: 'denim',
    beltColor: 0x2a1c12,
    shoes: 0xf0f0ec,
    shoeStripe: 0x18a4b2,
    watch: true,
    chain: true,
    metal: 0.06,
    rough: 0.74,
  },
  {
    file: 'npc_tourists',
    ...faceTarget(HUMAN),
    bulk: 0.9,
    skin: 0xf2c8a8,
    hair: 0xe8c468,
    hairStyle: 'bob',
    glasses: 'shades',
    lipHex: 0xe64a78,
    top: 0xf27a88,
    collarColor: 0xf27a88,
    sleeveColor: 0xf07886,
    cuffColor: 0xf4f2ee,
    pattern: 'miami_blazer',
    collar: 'lapels',
    sleeves: 'rolled',
    pads: true,
    accent: 0xf27a88,
    bottom: 0x42669a,
    pantsStyle: 'denim',
    shoes: 0xf2f0ec,
    shoeStripe: 0xf27a88,
    rough: 0.72,
  },
  {
    file: 'npc_tourists_1',
    ...faceTarget(HUMAN),
    bulk: 1.0,
    skin: 0xe2b08a,
    hair: 0x261c14,
    hairStyle: 'mullet',
    glasses: 'aviator',
    expression: 'smirk',
    top: 0xf4c430,
    collarColor: 0xf4c430,
    sleeveColor: 0xf2c02c,
    sleeveTextured: true,
    pattern: 'cuban_retro',
    collar: 'open',
    sleeves: 'short',
    bottom: 0x365280,
    pantsStyle: 'denim',
    shoes: 0xf0eee8,
    shoeStripe: 0x1cc8c8,
    chain: true,
    rough: 0.74,
  },
  {
    file: 'npc_coat_check',
    ...faceTarget(HUMAN),
    bulk: 0.94,
    skin: 0xd4aa8a,
    hair: 0x1c1410,
    hairStyle: 'bun',
    lipHex: 0xa84862,
    top: 0x223044,
    collarColor: 0xf0449a,
    sleeveColor: 0x223044,
    pattern: 'windbreaker',
    collar: 'popped',
    sleeves: 'long',
    bottom: 0x1a202c,
    pantsStyle: 'track',
    belt: false,
    shoes: 0xeaeaf0,
    shoeStripe: 0xf0449a,
    metal: 0.14,
    rough: 0.54,
  },
  {
    file: 'npc_philosopher',
    ...faceTarget(HUMAN),
    bulk: 0.86,
    skin: 0xd8c4b0,
    hair: 0x443e38,
    hairStyle: 'crop',
    glasses: 'round',
    top: 0x222634,
    collarColor: 0x222634,
    sleeveColor: 0x222634,
    pattern: 'turtleneck',
    collar: 'lapels',
    sleeves: 'long',
    coatTail: 'short',
    bottom: 0x1a1c24,
    pantsStyle: 'plain',
    shoes: 0x181414,
    rough: 0.78,
  },
  {
    file: 'npc_bouncer',
    ...faceTarget(HUMAN),
    bulk: 1.45,
    skin: 0x6e4834,
    hair: 0x121010,
    hairStyle: 'bald',
    glasses: 'aviator',
    expression: 'stern',
    top: 0x16181e,
    collarColor: 0x1c1e26,
    sleeveColor: 0x16181e,
    pattern: 'bouncer_suit',
    collar: 'lapels',
    sleeves: 'long',
    coatTail: 'short',
    bottom: 0x101216,
    pantsStyle: 'plain',
    shoes: 0x0b0c0e,
    shoeMetal: 0.25,
    shoeRough: 0.3,
    metal: 0.16,
    rough: 0.52,
  },
  {
    file: 'npc_security',
    eyeY: 1.85 - 0.32,
    faceZ: 0.2,
    bulk: 1.16,
    skin: 0xc89a78,
    hair: 0x182236,
    hairStyle: 'cap',
    capBadge: 0xd8e0ec,
    glasses: 'aviator',
    mustache: true,
    expression: 'stern',
    top: 0x1c2b44,
    collarColor: 0x1c2b44,
    sleeveColor: 0x1c2b44,
    pattern: 'security_uniform',
    collar: 'open',
    sleeves: 'short',
    bottom: 0x141d2e,
    pantsStyle: 'plain',
    beltColor: 0x0e0f12,
    buckleColor: 0xd8e0ec,
    shoes: 0x0c0e12,
    shoeMetal: 0.25,
    shoeRough: 0.32,
    metal: 0.14,
    rough: 0.62,
  },
  {
    file: 'npc_leather_choir',
    ...faceTarget(HUMAN),
    bulk: 1.02,
    skin: 0xbc8c6c,
    hair: 0x0f1014,
    hairStyle: 'cap',
    capBadge: 0xc8d0dc,
    top: 0x0e0f14,
    sleeveColor: 0x0e0f14,
    pattern: 'leather_studded',
    bareChest: true,
    harness3d: true,
    sleeves: 'sleeveless',
    bottom: 0x0a0b0e,
    pantsStyle: 'leather',
    beltColor: 0x0c0d10,
    buckleColor: 0xd0d6e0,
    shoes: 0x08090c,
    shoeMetal: 0.4,
    shoeRough: 0.25,
    metal: 0.48,
    rough: 0.28,
  },
  {
    file: 'npc_leather_daddy',
    ...faceTarget(FOCUS.leather_daddy),
    bulk: 1.26,
    skin: 0xac7c5c,
    hair: 0x141214,
    hairStyle: 'cap',
    capBadge: 0xd8dfe8,
    beard: true,
    expression: 'stern',
    top: 0x0f1014,
    collarColor: 0x161820,
    sleeveColor: 0x0e0f14,
    pattern: 'leather_studded',
    collar: 'lapels',
    harness3d: true,
    sleeves: 'long',
    gloves: 0x0e0f14,
    bottom: 0x0a0b0e,
    pantsStyle: 'leather',
    buckleColor: 0xd4dce6,
    shoes: 0x08090b,
    shoeMetal: 0.42,
    shoeRough: 0.25,
    chain: true,
    metal: 0.52,
    rough: 0.26,
  },
  {
    file: 'npc_bartender_bear',
    ...faceTarget(FOCUS.bartender_bear),
    bulk: 1.54,
    skin: 0xc89268,
    hair: 0x2c1c12,
    hairStyle: 'bandana',
    bandanaColor: 0xb82428,
    beard: true,
    top: 0x20222a,
    pattern: 'biker_vest',
    sleeves: 'sleeveless',
    bottom: 0x222c3c,
    pantsStyle: 'denim',
    beltColor: 0x221610,
    buckleColor: 0xdcc058,
    shoes: 0x121010,
    chain: true,
    metal: 0.16,
    rough: 0.62,
  },
  {
    file: 'npc_drag_oracle',
    ...faceTarget(FOCUS.drag_oracle),
    bulk: 0.94,
    skin: 0xf2c2a8,
    hair: 0xd61e92,
    hairStyle: 'wig',
    makeup: 'diva',
    top: 0xd81b84,
    sleeveColor: 0xd81b84,
    sleeveTextured: true,
    pattern: 'disco_diva',
    outfit: 'dress',
    sleeves: 'long',
    gloves: 0xf2c2a8,
    pads: true,
    accent: 0xf0c442,
    bottom: 0xd81b84,
    shoes: 0xf0c442,
    shoeMetal: 0.65,
    shoeRough: 0.25,
    metal: 0.36,
    rough: 0.34,
  },
  {
    file: 'npc_rubber_knight',
    ...faceTarget(FOCUS.rubber_knight),
    bulk: 1.14,
    skin: 0x141720,
    hair: 0x10131a,
    hairStyle: 'bald',
    faceStyle: 'mask',
    top: 0x141720,
    sleeveColor: 0x141720,
    sleeveTextured: true,
    pattern: 'rubber_suit',
    sleeves: 'long',
    gloves: 0x12151c,
    bottom: 0x10131a,
    pantsStyle: 'leather',
    beltColor: 0x282d3a,
    buckleColor: 0x7c869a,
    shoes: 0x0c0e14,
    shoeMetal: 0.68,
    shoeRough: 0.16,
    metal: 0.64,
    rough: 0.16,
  },
  {
    file: 'npc_old_raver',
    ...faceTarget(HUMAN),
    bulk: 0.96,
    skin: 0xccaf98,
    hair: 0xc2c2c6,
    hairStyle: 'crop',
    stubble: true,
    top: 0x3e4232,
    collarColor: 0xd86220,
    sleeveColor: 0x3a3e2e,
    pattern: 'bomber',
    collar: 'popped',
    sleeves: 'long',
    bottom: 0x202220,
    pantsStyle: 'plain',
    shoes: 0x1a1a18,
    metal: 0.12,
    rough: 0.68,
  },
  {
    file: 'npc_glitter_boy',
    ...faceTarget(FOCUS.glitter_boy),
    bulk: 0.84,
    skin: 0xf4d4b8,
    hair: 0xf0e4bc,
    hairStyle: 'afro',
    makeup: 'glam',
    top: 0xe62496,
    collarColor: 0x1ee2f2,
    sleeveColor: 0xe62496,
    sleeveTextured: true,
    pattern: 'glitter_disco',
    collar: 'popped',
    sleeves: 'rolled',
    cuffColor: 0x1ee2f2,
    bottom: 0xc8d0e2,
    pantsStyle: 'silver',
    beltColor: 0xe62496,
    buckleColor: 0xffe46a,
    shoes: 0xf4f4fa,
    shoeStripe: 0x1ee2f2,
    chain: true,
    metal: 0.48,
    rough: 0.28,
  },
  {
    file: 'npc_darkroom_keeper',
    ...faceTarget(HUMAN),
    bulk: 0.98,
    skin: 0x9c8678,
    hair: 0x0c0c12,
    hairStyle: 'hood',
    iris: 0x98b4d8,
    top: 0x101016,
    sleeveColor: 0x0d0d12,
    pattern: 'cloak',
    sleeves: 'long',
    coatTail: 'long',
    belt: false,
    bottom: 0x09090d,
    pantsStyle: 'plain',
    shoes: 0x07070a,
    metal: 0.08,
    rough: 0.84,
  },
  {
    file: 'npc_lighting_tech',
    ...faceTarget(HUMAN),
    bulk: 1.0,
    skin: 0xc89a78,
    hair: 0x241a12,
    hairStyle: 'crop',
    stubble: true,
    headset: true,
    top: 0x262a32,
    sleeveColor: 0x14161a,
    pattern: 'cargo_vest',
    sleeves: 'short',
    bottom: 0x1c1e24,
    pantsStyle: 'plain',
    shoes: 0x141518,
    rough: 0.72,
  },
  {
    file: 'npc_cleaner',
    ...faceTarget(HUMAN),
    bulk: 0.98,
    skin: 0xd2a888,
    hair: 0x3c3228,
    hairStyle: 'bun',
    top: 0x2e6094,
    collarColor: 0x2e6094,
    sleeveColor: 0x2e6094,
    pattern: 'coveralls',
    collar: 'open',
    sleeves: 'rolled',
    cuffColor: 0xd8e2ec,
    bottom: 0x265280,
    pantsStyle: 'plain',
    belt: false,
    shoes: 0x1a1c20,
    rough: 0.8,
  },
  {
    file: 'npc_riddle_horse',
    ...faceTarget(HORSE),
    bulk: 1.08,
    skin: 0xc49c7c,
    hair: 0x1a120e,
    top: 0x161418,
    sleeveColor: 0x161418,
    pattern: 'leather_studded',
    bareChest: true,
    harness3d: true,
    sleeves: 'sleeveless',
    bottom: 0x1c1816,
    pantsStyle: 'leather',
    shoes: 0x12100e,
    head: 'horse',
    coat: 0x7a4824,
    mane: 0x16100c,
    metal: 0.36,
    rough: 0.38,
  },
  {
    file: 'npc_patrick',
    ...faceTarget(HORSE),
    bulk: 1.02,
    skin: 0xd8c8b0,
    hair: 0x483e32,
    top: 0xeeeae0,
    collarColor: 0xf4f0e6,
    sleeveColor: 0xeeeae0,
    cuffColor: 0x8a4ec8,
    pattern: 'lance_suit',
    collar: 'lapels',
    pads: true,
    accent: 0xeeeae0,
    sleeves: 'long',
    coatTail: 'short',
    bottom: 0xe6e2d6,
    pantsStyle: 'plain',
    beltColor: 0x3c2058,
    buckleColor: 0xdcc060,
    shoes: 0x2a2420,
    shoeMetal: 0.28,
    shoeRough: 0.28,
    head: 'horse',
    coat: 0x948068,
    mane: 0x362c22,
    glasses: 'tinted',
    watch: true,
    metal: 0.08,
    rough: 0.64,
  },
  {
    file: 'npc_herd',
    ...faceTarget(HORSE),
    bulk: 1.04,
    skin: 0xb89678,
    hair: 0x14100e,
    top: 0x14151a,
    pattern: 'leather_studded',
    bareChest: true,
    harness3d: true,
    sleeves: 'sleeveless',
    bottom: 0x101116,
    pantsStyle: 'leather',
    shoes: 0x0c0c0e,
    head: 'horse',
    coat: 0x4e301c,
    mane: 0x120e0c,
    metal: 0.42,
    rough: 0.34,
  },
  {
    file: 'npc_herd_1',
    ...faceTarget(HORSE),
    bulk: 0.96,
    skin: 0xf4eef8,
    hair: 0xd8c4f4,
    top: 0xe6e4f2,
    collarColor: 0xd4b8f4,
    sleeveColor: 0xe6e4f2,
    pattern: 'unicorn_glam',
    collar: 'popped',
    sleeves: 'sleeveless',
    bottom: 0xd8d8ea,
    pantsStyle: 'silver',
    beltColor: 0x9c82d8,
    buckleColor: 0xf4d262,
    shoes: 0xf4f2fc,
    shoeStripe: 0xf4d262,
    head: 'unicorn',
    coat: 0xf8f6fc,
    mane: 0xcab6f2,
    metal: 0.42,
    rough: 0.3,
  },
  {
    file: 'npc_herd_2',
    ...faceTarget(HORSE),
    bulk: 1.12,
    skin: 0xc8b49e,
    hair: 0x262426,
    top: 0xd84a3a,
    collarColor: 0xd84a3a,
    sleeveColor: 0xd84a3a,
    pattern: 'donkey_shirt',
    collar: 'open',
    sleeves: 'short',
    bottom: 0x38527e,
    pantsStyle: 'denim',
    shoes: 0x242222,
    head: 'donkey',
    coat: 0x8e8880,
    mane: 0x222020,
    chain: true,
    rough: 0.74,
  },
  {
    file: 'npc_ice_cream_horse',
    ...faceTarget(HORSE),
    bulk: 1.0,
    skin: 0xf0e0d0,
    hair: 0xf4f0e8,
    top: 0xfaf6f0,
    collarColor: 0xf4a8c0,
    sleeveColor: 0xf8f4ee,
    pattern: 'apron_icecream',
    collar: 'open',
    sleeves: 'short',
    bottom: 0xe8dfd2,
    pantsStyle: 'plain',
    belt: false,
    shoes: 0xf8f8f8,
    shoeStripe: 0xf4a8c0,
    head: 'horse',
    coat: 0xe2cfb4,
    mane: 0xf6f2e8,
    extras: [(f, a) => buildIceCreamCone(f, a)],
    rough: 0.68,
  },
  {
    file: 'npc_spirit_guide',
    eyeY: 0.74,
    faceZ: 0.1,
    bulk: 0.85,
    skin: 0xd8f0ff,
    hair: 0xf0faff,
    hairStyle: 'long',
    faceStyle: 'ghost',
    top: 0xc4e8ff,
    sleeveColor: 0xb8e2ff,
    pattern: 'ghost_robe',
    sleeves: 'long',
    coatTail: 'long',
    belt: false,
    bottom: 0xaad8fa,
    pantsStyle: 'plain',
    shoes: 0xc4e8ff,
    alpha: 0.72,
    ghostEmissive: [0.42, 0.72, 0.94],
    metal: 0.05,
    rough: 0.3,
  },
  {
    file: 'npc_animal_control',
    ...faceTarget(HUMAN),
    bulk: 1.1,
    skin: 0xd0a888,
    hair: 0x202a36,
    hairStyle: 'cap',
    capBadge: 0xf0dc2a,
    mustache: true,
    expression: 'stern',
    top: 0xf0dc2a,
    collarColor: 0x1c2838,
    sleeveColor: 0x1c2838,
    pattern: 'hivis_vest',
    collar: 'open',
    sleeves: 'short',
    bottom: 0x222c3c,
    pantsStyle: 'plain',
    beltColor: 0x14161a,
    buckleColor: 0xc8ced8,
    shoes: 0x181a1e,
    rough: 0.68,
    extras: [(f, a) => buildLasso(f, a)],
  },
];

// ============================================================================
// Build, Export & Full Verification (Winding, PNG, GLTFLoader, Nodes, Bounds)
// ============================================================================

assertOutwardGeometry();
mkdirSync(OUT, { recursive: true });

const REQUIRED_NODES = ['body', 'head', 'armL', 'armR', 'legL', 'legR'];
const loader = new GLTFLoader();
let failed = 0;

for (const spec of cast) {
  const figure = buildPerson(spec);
  // Verify every embedded PNG before exporting
  for (const tex of figure.textures) verifyPngBuffer(tex.png);

  const glb = figure.toGlb();
  const path = join(OUT, `${spec.file}.glb`);
  writeFileSync(path, glb);

  const buf = readFileSync(path);
  // Extract embedded PNGs back out of the written GLB binary & verify every chunk/CRC/inflate!
  const jsonLen = buf.readUInt32LE(12);
  const glbJson = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binOff = 20 + jsonLen + 8;
  for (const img of glbJson.images ?? []) {
    const bv = glbJson.bufferViews[img.bufferView];
    verifyPngBuffer(buf.subarray(binOff + bv.byteOffset, binOff + bv.byteOffset + bv.byteLength));
  }

  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const origWarn = console.warn;
  const origError = console.error;
  const isNodeBlobMsg = (args) => args.join(' ').includes("Couldn't load texture blob:nodedata:");
  console.warn = (...args) => {
    if (!isNodeBlobMsg(args)) origWarn(...args);
  };
  console.error = (...args) => {
    if (!isNodeBlobMsg(args)) origError(...args);
  };

  try {
    await new Promise((resolve, reject) => {
      loader.parse(
        ab,
        '',
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          const box = { minY: Infinity, maxY: -Infinity, maxX: 0 };
          const v = new Vector3();
          let tris = 0;
          const foundNodes = new Set();

          gltf.scene.traverse((o) => {
            if (o.name) foundNodes.add(o.name);
            const pos = o.geometry?.attributes?.position;
            if (!pos) return;
            if (!o.geometry.attributes.uv) {
              failed++;
              console.error(`${spec.file} missing TEXCOORD_0 on mesh ${o.name}`);
            }
            const idx = o.geometry.index;
            tris += idx ? idx.count / 3 : pos.count / 3;
            for (let i = 0; i < pos.count; i++) {
              v.fromBufferAttribute(pos, i);
              o.localToWorld(v);
              box.minY = Math.min(box.minY, v.y);
              box.maxY = Math.max(box.maxY, v.y);
              box.maxX = Math.max(box.maxX, Math.abs(v.x));
            }
          });

          const missingNodes = REQUIRED_NODES.filter((n) => !foundNodes.has(n));
          const h = box.maxY - box.minY;
          const sizeKb = glb.length / 1024;
          const bad =
            missingNodes.length > 0 ||
            box.minY < -0.05 ||
            box.maxY < 0.5 ||
            h > 2.6 ||
            box.maxX > 1.4 ||
            tris >= 3000 ||
            glb.length >= 80 * 1024;

          if (bad) {
            failed++;
            console.error(
              `FAIL ${spec.file}: y=${box.minY.toFixed(2)}..${box.maxY.toFixed(2)} x±${box.maxX.toFixed(2)} tris=${tris} size=${sizeKb.toFixed(1)}KB missing=[${missingNodes.join(',')}]`,
            );
          } else {
            console.log(
              `${spec.file.padEnd(20)} ${h.toFixed(2)} m  (y ${box.minY.toFixed(2)}..${box.maxY.toFixed(2)})  ${String(tris).padStart(4)} tris  ${figure.textures.length} tex  ${sizeKb.toFixed(1).padStart(5)} KB`,
            );
          }
          resolve();
        },
        reject,
      );
    });
  } finally {
    console.warn = origWarn;
    console.error = origError;
  }
}

if (failed) {
  console.error(`${failed} figures failed verification`);
  process.exit(1);
}
console.log(`wrote & verified ${cast.length} horsey low-poly NPC figures`);
