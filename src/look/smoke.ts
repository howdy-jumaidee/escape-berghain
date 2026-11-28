// Look: volumetric smoke-machine GLSL shader.
// ~20% thickness in dancefloor areas (main_hall, panorama_bar floor 0 & 1), ~5% in uncommon corridors/rooms.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uThickness;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vWorld;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.04 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float radial = 1.0 - smoothstep(0.28, 1.0, length(centered));
  if (radial <= 0.001) discard;

  float t = uTime * 0.14;
  vec2 p = vWorld.xz * 0.085 + vec2(uSeed * 3.1, uSeed * 1.9);
  vec2 warp = vec2(
    fbm(p + vec2(t * 0.8, -t * 0.5)),
    fbm(p + vec2(-t * 0.6, t * 0.7) + vec2(4.2, 2.8))
  );
  float billow = fbm(p + warp * 1.45 + vec2(t * 0.35, t * 0.22));
  float wisps = smoothstep(0.24, 0.82, billow);

  // Subtle vertical plume pulse mimicking periodic smoke-machine bursts.
  float burst = 0.84 + 0.16 * sin(uTime * 0.38 + uSeed * 6.2831);
  float alpha = clamp(radial * wisps * uThickness * burst, 0.0, 0.32);
  vec3 col = mix(uColorA, uColorB, clamp(warp.x * 1.15, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
}
`;

export interface SmokeMachineField {
  root: THREE.Group;
  update(dt: number): void;
}

interface SmokeZoneSpec {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  /** Target visual thickness: ~0.20 on dancefloors, ~0.05 in uncommon areas. */
  thickness: number;
  colorA: number;
  colorB: number;
  seed: number;
  tiltX?: number;
  tiltZ?: number;
}

/** Recognizable industrial smoke machine unit with steel housing, nozzle, and amber power LED. */
function buildSmokeMachine(x: number, y: number, z: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'smoke_machine';
  g.position.set(x, y, z);
  g.rotation.y = yaw;

  const steelMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.45, metalness: 0.75 });
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.35, metalness: 0.85 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff5522, toneMapped: false });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.32, 0.74), steelMat);
  body.position.y = 0.16;
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.05, 0.14), steelMat);
  bracket.position.set(0, 0.36, 0);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.18, 10), nozzleMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.17, 0.44);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.02), ledMat);
  led.position.set(0.18, 0.22, 0.38);

  g.add(body, bracket, nozzle, led);
  return g;
}

export function buildSmokeShader(): SmokeMachineField {
  const root = new THREE.Group();
  root.name = 'smoke_machine_shader';

  const materials: THREE.ShaderMaterial[] = [];

  // Dancefloors (~20% thickness across stacked drifting shader planes) vs uncommon areas (~5% thickness).
  const zones: SmokeZoneSpec[] = [
    // Main hall dancefloor: 3 layered drifting sheets (~20% combined thickness) + upper gallery haze.
    { x: 35, y: 0.75, z: 27, w: 58, d: 44, thickness: 0.2, colorA: 0x202736, colorB: 0x381d34, seed: 0.11 },
    { x: 34, y: 2.35, z: 29, w: 54, d: 40, thickness: 0.18, colorA: 0x252c3e, colorB: 0x421c2c, seed: 0.37, tiltX: 0.03 },
    { x: 36, y: 4.4, z: 26, w: 52, d: 38, thickness: 0.15, colorA: 0x1d2536, colorB: 0x2f2042, seed: 0.63, tiltZ: -0.025 },
    { x: 36, y: 10.6, z: 32, w: 58, d: 42, thickness: 0.16, colorA: 0x1f2838, colorB: 0x33203d, seed: 0.89 },
    // Dense localized plumes right in front of the DJ-flank smoke machines.
    { x: 18, y: 1.4, z: 16, w: 20, d: 18, thickness: 0.22, colorA: 0x2c3346, colorB: 0x4b1d30, seed: 1.21, tiltX: -0.08 },
    { x: 50, y: 1.4, z: 16, w: 20, d: 18, thickness: 0.22, colorA: 0x2c3346, colorB: 0x392050, seed: 1.54, tiltX: -0.08 },

    // Panorama Bar dancefloor (floor 0 south room + floor 1 upstairs Panorama Bar): ~20% warm rose haze.
    { x: 35, y: 1.1, z: 63, w: 56, d: 15, thickness: 0.2, colorA: 0x2a1f2d, colorB: 0x482238, seed: 2.08 },
    { x: 35, y: 2.8, z: 63, w: 52, d: 14, thickness: 0.16, colorA: 0x281e2c, colorB: 0x3f2436, seed: 2.41 },
    { x: 51, y: 10.2, z: 51, w: 28, d: 8, thickness: 0.2, colorA: 0x2d202e, colorB: 0x4a2832, seed: 2.77 },

    // Uncommon areas (~5% subtle thickness): bar/cloakroom, toilet corridor, back exit.
    { x: 80, y: 1.5, z: 18, w: 28, d: 22, thickness: 0.05, colorA: 0x292420, colorB: 0x382a20, seed: 3.12 },
    { x: 80, y: 1.6, z: 42, w: 28, d: 22, thickness: 0.05, colorA: 0x1d2824, colorB: 0x24332c, seed: 3.55 },
    { x: 80, y: 1.5, z: 63, w: 26, d: 15, thickness: 0.05, colorA: 0x1d2b22, colorB: 0x2a352c, seed: 3.91 },
  ];

  for (const z of zones) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uThickness: { value: z.thickness },
        uColorA: { value: new THREE.Color(z.colorA) },
        uColorB: { value: new THREE.Color(z.colorB) },
        uSeed: { value: z.seed },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    materials.push(mat);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d, 1, 1), mat);
    mesh.rotation.x = -Math.PI / 2 + (z.tiltX ?? 0);
    mesh.rotation.z = z.tiltZ ?? 0;
    mesh.position.set(z.x, z.y, z.z);
    mesh.renderOrder = 1;
    root.add(mesh);
  }

  // Physical smoke machines placed near the main hall DJ speaker flanks and Panorama Bar.
  root.add(
    buildSmokeMachine(15.2, 0, 10.6, 0.35),
    buildSmokeMachine(51.8, 0, 10.6, -0.35),
    buildSmokeMachine(10.5, 0, 62.5, 1.35),
  );

  let elapsed = 0;
  function update(dt: number): void {
    elapsed += dt;
    for (const m of materials) m.uniforms.uTime.value = elapsed;
  }

  return { root, update };
}
