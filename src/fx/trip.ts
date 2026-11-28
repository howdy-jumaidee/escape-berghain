// FX: trip meter and post effects. Owned by Dee, built by Gemini Neon (issue #4).
// Trip rises all the time. Higher trip: blur, double vision, chromatic aberration, colour drift, camera wobble.
// Fragments lower it a little. Club Mate lowers it a lot and gives 10 s of jittery legs.
// Ice cream gives 5 s of brain freeze: the screen goes sharp.
import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  Effect,
  EffectAttribute,
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  HueSaturationEffect,
  NoiseEffect,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing';
import { bus, state, TRIP_MAX } from '../contracts';

const TRIP_PER_SECOND = 0.8; // the horse gets properly high in ~2 minutes
const FRAGMENT_RELIEF = 10;
const MATE_RELIEF = 30;
const MATE_SECONDS = 10;
const FREEZE_SECONDS = 5;

const blurShader = /* glsl */ `
uniform float strength;
uniform float ghost;
uniform float phase;
uniform float spill;
uniform float morning;
uniform float follow;
uniform vec2 horse;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 r = texelSize * (1.0 + strength * 7.0);
  vec4 sum = inputColor * 0.2;
  sum += texture2D(inputBuffer, uv + vec2( r.x, 0.0)) * 0.1;
  sum += texture2D(inputBuffer, uv + vec2(-r.x, 0.0)) * 0.1;
  sum += texture2D(inputBuffer, uv + vec2(0.0,  r.y)) * 0.1;
  sum += texture2D(inputBuffer, uv + vec2(0.0, -r.y)) * 0.1;
  sum += texture2D(inputBuffer, uv + r * 0.7) * 0.1;
  sum += texture2D(inputBuffer, uv - r * 0.7) * 0.1;
  sum += texture2D(inputBuffer, uv + vec2(r.x, -r.y) * 0.7) * 0.1;
  sum += texture2D(inputBuffer, uv + vec2(-r.x, r.y) * 0.7) * 0.1;
  vec3 blurred = mix(inputColor.rgb, sum.rgb, clamp(strength * 1.5, 0.0, 1.0));

  // Smoky club haze falling into the lens. Subtle dark-steel/violet lift so blacks stay deep.
  float luma = dot(blurred, vec3(0.2126, 0.7152, 0.0722));
  vec3 veil = mix(vec3(0.32, 0.38, 0.54), vec3(0.95, 0.74, 0.44), morning);
  float shadow = smoothstep(0.55, 0.0, luma);
  vec3 lifted = blurred + veil * shadow * (0.008 + spill * 0.028);
  // First person: wide bands from above. Follow: the same bands aimed past the horse,
  // plus a soft rim where the light wraps the body and haze in the air in front of the lens.
  float s1 = sin((uv.x * 1.5 + uv.y * 0.28) * 6.28318 + phase * 0.1);
  float s2 = sin((uv.x * -0.35 + uv.y * 0.9) * 6.28318 - phase * 0.06);
  float wide = pow(clamp(0.5 + 0.5 * s1, 0.0, 1.0), 4.0) * 0.65 + pow(clamp(0.5 + 0.5 * s2, 0.0, 1.0), 5.0) * 0.35;
  wide *= smoothstep(0.0, 0.4, uv.y);
  vec2 aim = horse + vec2(0.0, 0.1);
  vec2 dir = uv - aim;
  float ang = atan(dir.y, dir.x);
  float beam = pow(clamp(0.5 + 0.5 * sin(ang * 2.5 + phase * 0.08), 0.0, 1.0), 3.0);
  float aimed = beam * smoothstep(0.9, 0.02, length(dir));
  float shafts = mix(wide, max(wide * 0.65, aimed), follow);
  lifted += veil * shafts * (0.008 + spill * 0.024);
  vec2 hd = (uv - horse) * vec2(0.85, 1.15);
  float hd2 = dot(hd, hd);
  float rim = smoothstep(0.08, 0.015, hd2) * smoothstep(0.0, 0.012, hd2);
  lifted += veil * rim * follow * spill * 0.065;
  float front = smoothstep(0.62, 0.0, uv.y) * follow;
  lifted += veil * front * spill * 0.018;
  // Drifting smoke: two slow swirling bands, denser in the shadows.
  float smoke = pow(clamp(0.5 + 0.5 * sin(uv.x * 2.2 + phase * 0.045) + 0.35 * sin(uv.y * 3.7 - phase * 0.03 + uv.x * 1.3), 0.0, 1.0), 2.0);
  lifted += veil * smoke * shadow * (0.012 + spill * 0.03);
  blurred = mix(blurred, lifted, 0.18 + spill * 0.38);

  // Double vision: a drifting ghost copy of the frame.
  vec2 g = vec2(sin(phase * 0.7), cos(phase * 0.53)) * ghost * 0.025;
  vec3 twin = texture2D(inputBuffer, uv + g).rgb;
  outputColor = vec4(mix(blurred, twin, ghost * 0.4), inputColor.a);
}
`;

class TripBlurEffect extends Effect {
  constructor() {
    super('TripBlurEffect', blurShader, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ['strength', new THREE.Uniform(0)],
        ['ghost', new THREE.Uniform(0)],
        ['phase', new THREE.Uniform(0)],
        ['spill', new THREE.Uniform(0)],
        ['morning', new THREE.Uniform(0)],
        ['follow', new THREE.Uniform(0)],
        ['horse', new THREE.Uniform(new THREE.Vector2(0.5, 0.35))],
      ]),
    });
  }
  set(strength: number, ghost: number, phase: number, spill: number, morning: number, follow: number, horse: THREE.Vector2): void {
    this.uniforms.get('strength')!.value = strength;
    this.uniforms.get('ghost')!.value = ghost;
    this.uniforms.get('phase')!.value = phase;
    this.uniforms.get('spill')!.value = spill;
    this.uniforms.get('morning')!.value = morning;
    this.uniforms.get('follow')!.value = follow;
    (this.uniforms.get('horse')!.value as THREE.Vector2).copy(horse);
  }
}

export class TripFx {
  composer: EffectComposer;
  private bloom: BloomEffect;
  private grade: BrightnessContrastEffect;
  private vignette: VignetteEffect;
  private chroma: ChromaticAberrationEffect;
  private blur: TripBlurEffect;
  private hue: HueSaturationEffect;
  private camera: THREE.Camera;
  private baseCamPos = new THREE.Vector3();
  private camWobbleScale = 1;
  private hasCameraBase = false;
  private t = 0;
  private mateLeft = 0;
  private freezeLeft = 0;
  /** Eased version of the trip, so relief doesn't snap the screen sharp in one frame. */
  private shown = state.trip;
  /** How hard the light is falling into the camera. High in both views; strongest in the eyes. */
  private spillTarget = 0.9;
  private spill = 0.9;
  /** 1 on the follow cam, 0 in first person. Eased so the shafts don't pop. */
  private followTarget = 1;
  private follow = 1;
  /** Horse position in screen space, so follow-cam light can wrap the body. */
  private horseUv = new THREE.Vector2(0.5, 0.35);
  /** 0 until the Panorama shutters open, then eases toward 1. */
  private morning = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // Wide bloom so windows, shafts and the exit glow. The threshold drops in first person
    // so more of that light spills, and the radius stays large so it never goes crisp.
    this.bloom = new BloomEffect({
      luminanceThreshold: 0.72,
      luminanceSmoothing: 0.28,
      mipmapBlur: true,
      intensity: 0.55,
      radius: 0.75,
    });
    this.composer.addPass(new EffectPass(camera, this.bloom));

    this.blur = new TripBlurEffect();
    this.composer.addPass(new EffectPass(camera, this.blur));

    this.chroma = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.001, 0.001),
      radialModulation: false,
      modulationOffset: 0,
    });
    this.composer.addPass(new EffectPass(camera, this.chroma));

    // Stark, slightly desaturated brutalist contrast at low trip; shifts wilder as trip climbs.
    this.grade = new BrightnessContrastEffect({ brightness: 0, contrast: 0.12 });
    this.hue = new HueSaturationEffect({ hue: 0, saturation: -0.22 });
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
    noise.blendMode.opacity.value = 0.4;
    this.vignette = new VignetteEffect({ darkness: 0.62, offset: 0.32 });
    this.composer.addPass(new EffectPass(camera, this.grade, this.hue, noise, this.vignette));
    bus.on('shutters:open', () => {
      this.morning = Math.max(this.morning, 0.01);
    });

    bus.on('fragment:found', () => this.relieve(FRAGMENT_RELIEF));
    bus.on('item:consumed', ({ item }) => {
      if (item === 'mate') {
        this.relieve(MATE_RELIEF);
        this.mateLeft = MATE_SECONDS;
        state.clubMateActive = true;
      } else {
        this.freezeLeft = FREEZE_SECONDS;
        state.brainFreezeActive = true;
      }
    });
  }

  private relieve(amount: number): void {
    state.trip = Math.max(0, state.trip - amount);
    bus.emit('trip:changed', { trip: state.trip });
  }

  update(dt: number): void {
    this.t += dt;

    if (state.started && !state.ending && !state.inputLocked) {
      const prev = state.trip;
      state.trip = Math.min(TRIP_MAX, state.trip + TRIP_PER_SECOND * dt);
      if (Math.floor(prev) !== Math.floor(state.trip)) bus.emit('trip:changed', { trip: state.trip });
      if (state.trip >= TRIP_MAX && prev < TRIP_MAX) bus.emit('trip:max', {});
    }

    if (this.mateLeft > 0) {
      this.mateLeft -= dt;
      if (this.mateLeft <= 0) state.clubMateActive = false;
    }
    if (this.freezeLeft > 0) {
      this.freezeLeft -= dt;
      if (this.freezeLeft <= 0) {
        state.brainFreezeActive = false;
        bus.emit('trip:changed', { trip: state.trip });
      }
    }

    this.shown += (state.trip - this.shown) * (1 - Math.exp(-1.5 * dt));
    this.spill += (this.spillTarget - this.spill) * (1 - Math.exp(-2.2 * dt));
    this.follow += (this.followTarget - this.follow) * (1 - Math.exp(-3 * dt));
    if (this.morning > 0) this.morning = Math.min(1, this.morning + dt * 0.08);
    const k = state.brainFreezeActive ? 0 : this.shown / TRIP_MAX;
    // Blur stays gentle until about 30, then climbs. First person does not cancel it.
    const blur = Math.max(0, (k - 0.15) / 0.85) ** 1.25; // blur starts earlier and climbs harder
    const ghost = Math.max(0, (k - 0.35) / 0.65);
    this.blur.set(blur, ghost, this.t, this.spill, this.morning, this.follow, this.horseUv);

    const o = 0.001 + k * 0.03;
    this.chroma.offset.set(o * Math.cos(this.t * 2), o * Math.sin(this.t * 1.7));
    this.hue.hue = Math.sin(this.t * 0.38) * k * 1.5 + Math.sin(this.t * 0.13) * k * 0.5; // psychedelic hue wobble
    this.hue.saturation = state.brainFreezeActive ? -0.32 : -0.3 + k * 0.75 - this.spill * 0.06;
    // Dark hazy Berghain grade without crushing sRGB blacks; bloom catches strobes, lasers & unicorn horns.
    this.grade.brightness = -0.035 + this.spill * 0.016 + this.morning * 0.06;
    this.grade.contrast = (state.brainFreezeActive ? 0.13 : 0.11 + k * 0.04) - this.spill * 0.015;
    this.vignette.darkness = 0.9 - this.spill * 0.08 - this.morning * 0.1;
    this.vignette.offset = 0.26 + this.spill * 0.05;
    const lum = this.bloom.luminanceMaterial;
    lum.threshold = 0.74 - this.spill * 0.08 - this.morning * 0.05;
    lum.smoothing = 0.3 + this.spill * 0.16;
    this.bloom.mipmapBlurPass.radius = 0.78 + this.spill * 0.24;
    this.bloom.intensity = Math.min(
      1.25,
      (state.brainFreezeActive ? 0.35 : 0.45 + k * 0.12) + this.spill * 0.32 + this.morning * 0.25,
    );

    // Camera wobble grows with the trip; applied from baseCamPos and clamped so it never dips underground.
    if (this.hasCameraBase) {
      this.camera.position.copy(this.baseCamPos);
      this.camera.position.x = this.baseCamPos.x + Math.sin(this.t * 1.1) * k * this.camWobbleScale * 0.6;
      this.camera.position.y = Math.max(
        this.baseCamPos.y - 0.45,
        Math.max(0.45, this.baseCamPos.y + Math.sin(this.t * 0.7) * k * this.camWobbleScale * 0.4),
      );
    }
  }

  /**
   * How much light should fall into the lens. 1 is the horse's own eyes.
   * Eased inside update so a view change doesn't flash.
   */
  setSpill(amount: number, follow = 0): void {
    this.spillTarget = amount;
    this.followTarget = follow;
  }

  /** Horse in screen space (0 to 1). Ignored when follow is 0. Call after lookAt. */
  setHorse(x: number, y: number): void {
    if (Number.isFinite(x) && Number.isFinite(y)) this.horseUv.set(x, y);
  }

  /** Call after the camera has followed the player, before update(). */
  setCameraBase(pos: THREE.Vector3, wobbleScale = 1): void {
    this.baseCamPos.copy(pos);
    this.camWobbleScale = wobbleScale;
    this.hasCameraBase = true;
  }

  render(dt: number): void {
    this.composer.render(dt);
    // Restore unwobbled base after rendering so next frame's camera lerp never compounds wobble.
    if (this.hasCameraBase) {
      this.camera.position.copy(this.baseCamPos);
    }
  }
}
