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

const TRIP_PER_SECOND = 0.45;
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

  // Light falling into the eyes. Lift the shadows only, with wide soft shafts.
  // Nothing here raises contrast, so the ketamine blur stays dreamy.
  float luma = dot(blurred, vec3(0.2126, 0.7152, 0.0722));
  vec3 veil = mix(vec3(0.62, 0.74, 0.98), vec3(1.0, 0.78, 0.46), morning);
  float shadow = smoothstep(0.62, 0.0, luma);
  vec3 lifted = blurred + veil * shadow * (0.05 + spill * 0.2);
  float s1 = sin((uv.x * 1.5 + uv.y * 0.28) * 6.28318 + phase * 0.1);
  float s2 = sin((uv.x * -0.35 + uv.y * 0.9) * 6.28318 - phase * 0.06);
  float shafts = pow(clamp(0.5 + 0.5 * s1, 0.0, 1.0), 4.0) * 0.65 + pow(clamp(0.5 + 0.5 * s2, 0.0, 1.0), 5.0) * 0.35;
  shafts *= smoothstep(0.0, 0.4, uv.y);
  lifted += veil * shafts * (0.012 + spill * 0.05);
  blurred = mix(blurred, lifted, 0.3 + spill * 0.7);

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
      ]),
    });
  }
  set(strength: number, ghost: number, phase: number, spill: number, morning: number): void {
    this.uniforms.get('strength')!.value = strength;
    this.uniforms.get('ghost')!.value = ghost;
    this.uniforms.get('phase')!.value = phase;
    this.uniforms.get('spill')!.value = spill;
    this.uniforms.get('morning')!.value = morning;
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
  /** How hard the light is falling into the camera. 1 in the horse's eyes, less behind them. */
  private spillTarget = 0.4;
  private spill = 0.4;
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
    noise.blendMode.opacity.value = 0.28;
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
    if (this.morning > 0) this.morning = Math.min(1, this.morning + dt * 0.08);
    const k = state.brainFreezeActive ? 0 : this.shown / TRIP_MAX;
    // Blur stays gentle until about 30, then climbs. First person does not cancel it.
    const blur = Math.max(0, (k - 0.25) / 0.75) ** 1.4;
    const ghost = Math.max(0, (k - 0.5) / 0.5);
    this.blur.set(blur, ghost, this.t, this.spill, this.morning);

    const o = 0.0008 + k * 0.018;
    this.chroma.offset.set(o * Math.cos(this.t * 2), o * Math.sin(this.t * 1.7));
    this.hue.hue = Math.sin(this.t * 0.25) * k * 0.9;
    this.hue.saturation = state.brainFreezeActive ? -0.32 : -0.24 + k * 0.45 - this.spill * 0.06;
    // Brighter in the eyes, but contrast goes down so the extra light stays soft.
    this.grade.brightness = this.spill * 0.09 + this.morning * 0.06;
    this.grade.contrast = (state.brainFreezeActive ? 0.14 : 0.1 + k * 0.05) - this.spill * 0.07;
    this.vignette.darkness = 0.62 - this.spill * 0.34 - this.morning * 0.08;
    this.vignette.offset = 0.3 + this.spill * 0.14;
    const lum = this.bloom.luminanceMaterial;
    lum.threshold = 0.7 - this.spill * 0.2 - this.morning * 0.06;
    lum.smoothing = 0.28 + this.spill * 0.16;
    this.bloom.mipmapBlurPass.radius = 0.72 + this.spill * 0.28;
    this.bloom.intensity = Math.min(
      1.7,
      (state.brainFreezeActive ? 0.4 : 0.5 + k * 0.1) + this.spill * 0.65 + this.morning * 0.3,
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
  setSpill(amount: number): void {
    this.spillTarget = amount;
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
