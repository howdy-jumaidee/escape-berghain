// FX: trip meter and post effects. Owned by Dee, built by Gemini Neon (issue #4).
import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  ChromaticAberrationEffect,
  NoiseEffect,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing';
import { bus, state, TRIP_MAX } from '../contracts';

const TRIP_PER_SECOND = 0.6;

export class TripFx {
  composer: EffectComposer;
  private chroma: ChromaticAberrationEffect;
  private camera: THREE.Camera;
  private baseCamPos = new THREE.Vector3();
  private t = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.chroma = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.001, 0.001),
      radialModulation: false,
      modulationOffset: 0,
    });
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
    noise.blendMode.opacity.value = 0.35;
    const vignette = new VignetteEffect({ darkness: 0.7, offset: 0.3 });
    this.composer.addPass(new EffectPass(camera, this.chroma, noise, vignette));
  }

  update(dt: number): void {
    if (state.ending) return;
    this.t += dt;
    const prev = state.trip;
    state.trip = Math.min(TRIP_MAX, state.trip + TRIP_PER_SECOND * dt);
    if (Math.floor(prev) !== Math.floor(state.trip)) bus.emit('trip:changed', { trip: state.trip });
    if (state.trip >= TRIP_MAX && prev < TRIP_MAX) bus.emit('trip:max', {});

    const k = state.brainFreezeActive ? 0 : state.trip / TRIP_MAX;
    const o = 0.001 + k * 0.02;
    this.chroma.offset.set(o * Math.cos(this.t * 2), o * Math.sin(this.t * 1.7));

    // Camera wobble grows with the trip.
    this.camera.position.x = this.baseCamPos.x + Math.sin(this.t * 1.1) * k * 0.6;
    this.camera.position.y = this.baseCamPos.y + Math.sin(this.t * 0.7) * k * 0.4;
  }

  /** Call after the camera has followed the player, before update(). */
  setCameraBase(pos: THREE.Vector3): void {
    this.baseCamPos.copy(pos);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
