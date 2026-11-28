/** Surface-bound oil/gouache treatment. No screen blur, extra render pass or dependency. */
import * as THREE from 'three';

export interface PainterlyOptions {
  /** 0 = original materials; 1 = full treatment. */
  strength: number;
  /** Character multiplier relative to strength (0.86 at full environment strength). */
  characterStrength: number;
  /** Texture repetitions per local-space unit. */
  brushScale: number;
  pigment: number;
  saturation: number;
  /** Soft luminance bands, rather than RGB posterisation. */
  toneSteps: number;
  edge: number;
}

export const PAINTERLY_DEFAULTS: Readonly<PainterlyOptions> = Object.freeze({
  strength: 1,
  characterStrength: 0.86,
  brushScale: 1.25,
  pigment: 0.38,
  saturation: 0.78,
  toneSteps: 7,
  edge: 0.22,
});

const declarations = /* glsl */ `
uniform sampler2D paintTexture;
uniform float paintStrength;
uniform float paintScale;
uniform float paintPigment;
uniform float paintSaturation;
uniform float paintSteps;
uniform float paintEdge;
varying vec3 vPaintPosition;
varying vec3 vPaintNormal;

vec3 paintSample() {
  vec3 weights = pow(abs(normalize(vPaintNormal)), vec3(4.0));
  weights /= max(dot(weights, vec3(1.0)), 0.0001);
  vec3 p = vPaintPosition * paintScale;
  return texture2D(paintTexture, p.yz).rgb * weights.x
       + texture2D(paintTexture, p.zx).rgb * weights.y
       + texture2D(paintTexture, p.xy).rgb * weights.z;
}
`;

const pigmentShader = /* glsl */ `
// RGB packs broad pigment masses, directional dry bristles and fine paper tooth.
vec3 paintMark = paintSample();
float paintBroken = (paintMark.r - 0.5) * 1.35 + (paintMark.g - 0.5) * 0.45;
float paintLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
vec3 paintBase = mix(vec3(paintLuma), diffuseColor.rgb, paintSaturation);
paintBase *= 1.0 + paintBroken * paintPigment;
// Dusty ochre versus petrol-blue underpainting, not a uniform sepia filter.
vec3 paintTint = mix(vec3(0.78, 0.91, 1.08), vec3(1.12, 0.99, 0.80), paintMark.r);
paintBase *= paintTint;
diffuseColor.rgb = mix(diffuseColor.rgb, max(paintBase, vec3(0.0)), paintStrength);
`;

const lightingShader = /* glsl */ `
// Compress in perceptual space, soften band transitions, then restore HDR energy.
// Apply only to reflected light: emissive pickups, exit signs and bloom stay readable.
vec3 paintReflected = max(outgoingLight - totalEmissiveRadiance, vec3(0.0));
float paintY = dot(paintReflected, vec3(0.2126, 0.7152, 0.0722));
float paintValue = sqrt(paintY / (1.0 + paintY));
float paintBand = paintValue * paintSteps;
float paintQuantised = (floor(paintBand) + smoothstep(0.22, 0.78, fract(paintBand))) / paintSteps;
float paintTarget = mix(paintValue, paintQuantised, 0.65);
float paintSquare = paintTarget * paintTarget;
float paintNewY = paintSquare / max(1.0 - paintSquare, 0.001);
vec3 paintLit = paintReflected * (paintY > 0.0001 ? paintNewY / paintY : 1.0);
// Broken charcoal on grazing faces; no black screen-space outlines around fog or UI.
float paintRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
float paintDry = smoothstep(0.3, 0.7, paintMark.g);
paintLit *= 1.0 - paintEdge * paintRim * paintDry;
float paintTooth = (paintMark.b - 0.5) * 0.09;
paintLit *= 1.0 + paintTooth;
vec3 paintTemperature = mix(vec3(0.86, 0.96, 1.06), vec3(1.08, 1.01, 0.88), smoothstep(0.12, 0.8, paintValue));
paintLit *= paintTemperature;
outgoingLight = mix(paintReflected, max(paintLit, vec3(0.0)), paintStrength) + totalEmissiveRadiance;
`;

/** A deterministic, tileable pigment atlas. Generated once, mipmapped to avoid distant shimmer. */
function makeBrushTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number): number => {
    let h = Math.imul(x + 731, 374761393) ^ Math.imul(y + 991, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (u: number, v: number, nx: number, ny: number): number => {
    const x = u * nx, y = v * ny;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix % nx, iy % ny), b = hash((ix + 1) % nx, iy % ny);
    const c = hash(ix % nx, (iy + 1) % ny), d = hash((ix + 1) % nx, (iy + 1) % ny);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // Diagonal coordinates still tile because the shear has an integer period.
      const diagonal = (u + v) % 1;
      const broad = noise(u, v, 7, 9) * 0.7 + noise(diagonal, v, 19, 6) * 0.3;
      const bristles = noise(diagonal, v, 96, 9);
      const tooth = hash(x, y) * 0.65 + noise(u, v, 64, 64) * 0.35;
      const i = (y * size + x) * 4;
      data[i] = Math.round(broad * 255);
      data[i + 1] = Math.round(bristles * 255);
      data[i + 2] = Math.round(tooth * 255);
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = 'Painterly pigment / bristles / tooth';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Own one instance per scene. Shared uniforms allow live tuning without recompilation. */
export class PainterlyLook {
  private texture = makeBrushTexture();
  private patched = new Map<THREE.Material, {
    character: boolean;
    compile: THREE.Material['onBeforeCompile'];
    key: THREE.Material['customProgramCacheKey'];
  }>();
  private characterStrength = PAINTERLY_DEFAULTS.characterStrength;
  private characterUniform = new THREE.Uniform(PAINTERLY_DEFAULTS.characterStrength);
  private variants = new Map<THREE.Material, THREE.Material>();
  private replacements: { mesh: THREE.Mesh; index: number; original: THREE.Material; clone: THREE.Material }[] = [];
  private uniforms = {
    paintTexture: new THREE.Uniform(this.texture),
    paintStrength: new THREE.Uniform(PAINTERLY_DEFAULTS.strength),
    paintScale: new THREE.Uniform(PAINTERLY_DEFAULTS.brushScale),
    paintPigment: new THREE.Uniform(PAINTERLY_DEFAULTS.pigment),
    paintSaturation: new THREE.Uniform(PAINTERLY_DEFAULTS.saturation),
    paintSteps: new THREE.Uniform(PAINTERLY_DEFAULTS.toneSteps),
    paintEdge: new THREE.Uniform(PAINTERLY_DEFAULTS.edge),
  };

  constructor(options: Partial<PainterlyOptions> = {}) { this.set(options); }

  set(options: Partial<PainterlyOptions>): void {
    const assign = (key: keyof PainterlyOptions, uniform: THREE.Uniform<number>, min: number, max: number) => {
      const v = options[key];
      if (v !== undefined && Number.isFinite(v)) uniform.value = THREE.MathUtils.clamp(v, min, max);
    };
    assign('strength', this.uniforms.paintStrength, 0, 1);
    if (options.characterStrength !== undefined && Number.isFinite(options.characterStrength)) {
      this.characterStrength = THREE.MathUtils.clamp(options.characterStrength, 0, 1);
    }
    this.characterUniform.value = this.uniforms.paintStrength.value * this.characterStrength;
    assign('brushScale', this.uniforms.paintScale, 0.05, 12);
    assign('pigment', this.uniforms.paintPigment, 0, 1);
    assign('saturation', this.uniforms.paintSaturation, 0, 1.5);
    assign('toneSteps', this.uniforms.paintSteps, 3, 20);
    assign('edge', this.uniforms.paintEdge, 0, 0.7);
  }

  /** Safe to repeat after asynchronous GLB loads. Excludes fog, lasers, glass and custom shaders. */
  apply(root: THREE.Object3D): void {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      let character = false;
      for (let ancestor: THREE.Object3D | null = mesh; ancestor; ancestor = ancestor.parent) {
        if (ancestor.userData.painterlyRole !== undefined) {
          character = ancestor.userData.painterlyRole === 'character';
          break;
        }
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let index = 0; index < materials.length; index++) {
        let material = materials[index];
        // A fallback or imported material can be shared by both roles. Isolate only that case.
        const existing = this.patched.get(material);
        if (existing && existing.character !== character) {
          const original = material;
          let variant = this.variants.get(original);
          if (!variant) {
            variant = original.clone();
            variant.onBeforeCompile = existing.compile;
            variant.customProgramCacheKey = existing.key;
            this.variants.set(original, variant);
          }
          material = variant;
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.slice();
            mesh.material[index] = variant;
          } else mesh.material = variant;
          this.replacements.push({ mesh, index, original, clone: variant });
        }
        if (!(material instanceof THREE.MeshStandardMaterial) || material.transparent ||
            material.userData.painterly === false || this.patched.has(material)) continue;
        const compile = material.onBeforeCompile;
        const key = material.customProgramCacheKey;
        // Capture the key before replacing onBeforeCompile (Three's default key reads that function).
        const baseKey = key.call(material);
        this.patched.set(material, { character, compile, key });
        material.onBeforeCompile = (shader, renderer) => {
          compile.call(material, shader, renderer);
          Object.assign(shader.uniforms, this.uniforms);
          if (character) shader.uniforms.paintStrength = this.characterUniform;
          shader.vertexShader = `varying vec3 vPaintPosition;\nvarying vec3 vPaintNormal;\n${shader.vertexShader}`;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
            #include <begin_vertex>
            // Rest-space coordinates keep strokes attached to moving/skinned/instanced figures.
            vPaintPosition = position;
            vPaintNormal = normal;
          `);
          shader.fragmentShader = declarations + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${pigmentShader}`);
          shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `${lightingShader}\n#include <opaque_fragment>`);
        };
        material.customProgramCacheKey = () => `${baseKey}|painterly-surface-v2|${character ? 'character' : 'environment'}`;
        material.needsUpdate = true;
      }
    });
  }

  dispose(): void {
    for (const [material, original] of this.patched) {
      material.onBeforeCompile = original.compile;
      material.customProgramCacheKey = original.key;
      material.needsUpdate = true;
    }
    for (const { mesh, index, original, clone } of this.replacements) {
      if (Array.isArray(mesh.material)) {
        if (mesh.material[index] === clone) mesh.material[index] = original;
      } else if (mesh.material === clone) mesh.material = original;
    }
    this.replacements = [];
    for (const material of this.variants.values()) material.dispose();
    this.variants.clear();
    this.patched.clear();
    this.texture.dispose();
  }
}

/** ?paint=0 restores the unmodified game; ?paint=1 is the default. */
export function painterlyFromUrl(): PainterlyLook | null {
  if (new URLSearchParams(location.search).get('paint') === '0') return null;
  return new PainterlyLook();
}
