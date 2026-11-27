// Player: greybox horse with spring wobble. Owned by Dee, built by Gemini Neon (issues #2, #3).
// The horse is separate parts so code can wobble them. Emma's horse_*.glb parts replace these boxes.
import * as THREE from 'three';

const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));

export class Horse {
  root = new THREE.Group();
  private body: THREE.Mesh;
  private head: THREE.Mesh;
  private legs: THREE.Mesh[] = [];
  private velocity = new THREE.Vector3();
  private sway = 0;
  private swayVel = 0;
  private t = 0;

  constructor() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1.4), mat);
    this.body.position.y = 1.1;
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.6), mat);
    this.head.position.set(0, 1.7, 0.8);
    this.root.add(this.body, this.head);
    for (const [x, z] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.5], [0.2, -0.5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.15), mat);
      leg.position.set(x, 0.4, z);
      this.legs.push(leg);
      this.root.add(leg);
    }
  }

  update(dt: number, wobbleBoost = 1): void {
    const input = new THREE.Vector3(
      (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      0,
      (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0),
    );
    if (input.lengthSq() > 0) input.normalize();

    this.velocity.lerp(input.multiplyScalar(5), 1 - Math.exp(-6 * dt));
    this.root.position.addScaledVector(this.velocity, dt);
    this.root.position.clamp(new THREE.Vector3(-19, 0, -19), new THREE.Vector3(19, 0, 19));

    const speed = this.velocity.length();
    if (speed > 0.1) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      this.root.rotation.y += angleDiff(target, this.root.rotation.y) * (1 - Math.exp(-8 * dt));
    }

    // Spring sway: the drunk wobble.
    this.t += dt * (2 + speed * 2);
    const force = Math.sin(this.t * 1.3) * speed * 0.6 * wobbleBoost - this.sway * 30 - this.swayVel * 3;
    this.swayVel += force * dt;
    this.sway += this.swayVel * dt;
    this.body.rotation.z = this.sway;
    this.head.rotation.z = this.sway * 1.8;
    this.head.position.y = 1.7 + Math.sin(this.t * 2) * 0.05 * speed;
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(this.t * 3 + (i % 2 === 0 ? 0 : Math.PI)) * 0.5 * Math.min(speed, 1) * wobbleBoost;
    });
  }
}

function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
