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
  vec4 blurred = mix(inputColor, sum, clamp(strength * 1.5, 0.0, 1.0));

  // Double vision: a drifting ghost copy of the frame.
  vec2 g = vec2(sin(phase * 0.7), cos(phase * 0.53)) * ghost * 0.025;
  vec4 twin = texture2D(inputBuffer, uv + g);
  outputColor = mix(blurred, twin, ghost * 0.4);
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
      ]),
    });
  }
  set(strength: number, ghost: number, phase: number): void {
    this.uniforms.get('strength')!.value = strength;
    this.uniforms.get('ghost')!.value = ghost;
    this.uniforms.get('phase')!.value = phase;
  }
}

export class TripFx {
  composer: EffectComposer;
  private bloom: BloomEffect;
  private grade: BrightnessContrastEffect;
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

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // Subtle high-threshold bloom so frosted glass-block windows, lasers, strobes, and exit sign glow in the haze.
    this.bloom = new BloomEffect({
      luminanceThreshold: 0.78,
      luminanceSmoothing: 0.16,
      mipmapBlur: true,
      intensity: 0.45,
      radius: 0.65,
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
    const vignette = new VignetteEffect({ darkness: 0.65, offset: 0.28 });
    this.composer.addPass(new EffectPass(camera, this.grade, this.hue, noise, vignette));

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
    const k = state.brainFreezeActive ? 0 : this.shown / TRIP_MAX;
    // Blur stays gentle until about 30, then climbs.
    const blur = Math.max(0, (k - 0.25) / 0.75) ** 1.4;
    const ghost = Math.max(0, (k - 0.5) / 0.5);
    this.blur.set(blur, ghost, this.t);

    const o = 0.0008 + k * 0.018;
    this.chroma.offset.set(o * Math.cos(this.t * 2), o * Math.sin(this.t * 1.7));
    this.hue.hue = Math.sin(this.t * 0.25) * k * 0.9;
    this.hue.saturation = state.brainFreezeActive ? -0.32 : -0.22 + k * 0.6;
    this.grade.contrast = state.brainFreezeActive ? 0.16 : 0.12 + k * 0.08;
    this.bloom.intensity = state.brainFreezeActive ? 0.35 : 0.45 + k * 0.15;

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
