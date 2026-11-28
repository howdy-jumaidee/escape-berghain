// FX: proximity glow. A soft warm lift at the screen edges when something you can Space is in range.
// It breathes on the beat clock. Sits after the vignette so the dark edges carry it.
import * as THREE from 'three';
import { Effect, BlendFunction } from 'postprocessing';
import { bus, state, BEAT_SECONDS } from '../contracts';

const FADE_IN_SECONDS = 0.25;
const FADE_OUT_SECONDS = 0.4;

const glowShader = /* glsl */ `
uniform float amount;
uniform float breath;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Edge mask: nothing in the middle, a soft band towards the frame.
  vec2 d = (uv - 0.5) * vec2(1.15, 1.0);
  float edge = smoothstep(0.28, 0.78, length(d));
  float a = amount * amount * (3.0 - 2.0 * amount);
  vec3 warm = vec3(1.0, 0.58, 0.3);
  vec3 lift = warm * edge * a * (0.018 + 0.022 * breath);
  outputColor = vec4(inputColor.rgb + lift, inputColor.a);
}
`;

export class ProximityGlowEffect extends Effect {
  private nearNpc = false;
  private nearWorld = false;
  private shown = 0;
  /** performance.now() of the last beat, in ms. */
  private beatAt = 0;

  constructor() {
    super('ProximityGlowEffect', glowShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['amount', new THREE.Uniform(0)],
        ['breath', new THREE.Uniform(0)],
      ]),
    });
    bus.on('player:near', ({ by, near }) => {
      if (by === 'npc') this.nearNpc = near;
      else this.nearWorld = near;
    });
    bus.on('beat', ({ time }) => {
      this.beatAt = time;
    });
  }

  tick(dt: number): void {
    const on = (this.nearNpc || this.nearWorld) && !state.ending && !state.inputLocked;
    if (on) this.shown = Math.min(1, this.shown + dt / FADE_IN_SECONDS);
    else this.shown = Math.max(0, this.shown - dt / FADE_OUT_SECONDS);
    this.uniforms.get('amount')!.value = this.shown;
    if (this.shown <= 0) return;
    // Peaks on each beat and eases down between them. Keeps breathing if the beats pause.
    const phase = (performance.now() - this.beatAt) / (BEAT_SECONDS * 1000);
    this.uniforms.get('breath')!.value = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
  }
}
