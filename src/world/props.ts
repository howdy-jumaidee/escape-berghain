// World: familiar architectural shapes & backlit club signage so no prop reads as an obscure rectangle.
import * as THREE from 'three';
import { CELL, CEILING, FLOOR_HEIGHT, cellCenter } from '../contracts';

const darkSteel = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.45, metalness: 0.78 });
const brushedSteel = new THREE.MeshStandardMaterial({ color: 0x7b838e, roughness: 0.32, metalness: 0.88 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xc8d0da, roughness: 0.18, metalness: 0.94 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x2f2016, roughness: 0.75, metalness: 0.08 });
const warmWood = new THREE.MeshStandardMaterial({ color: 0x4b3322, roughness: 0.68, metalness: 0.08 });
const doorSteel = new THREE.MeshStandardMaterial({ color: 0x2f3b34, roughness: 0.55, metalness: 0.65 });
const doorPanel = new THREE.MeshStandardMaterial({ color: 0x232d27, roughness: 0.65, metalness: 0.55 });
const frontDoorMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.52, metalness: 0.72 });
const speakerCab = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.72, metalness: 0.35 });
const speakerCone = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.85, metalness: 0.2 });
const shutterMat = new THREE.MeshStandardMaterial({ color: 0x262a30, roughness: 0.55, metalness: 0.75 });
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xb8d8e8,
  roughness: 0.15,
  metalness: 0.1,
  transparent: true,
  opacity: 0.32,
});

let cachedTileMat: THREE.MeshStandardMaterial | null = null;
function toiletTileMat(): THREE.MeshStandardMaterial {
  if (cachedTileMat) return cachedTileMat;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a504b';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#252926';
  g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  g.fillStyle = 'rgba(20, 24, 20, 0.16)';
  g.fillRect(0, 96, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedTileMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.08 });
  return cachedTileMat;
}

export interface SignStyle {
  text: string;
  bg: string;
  fg: string;
  border?: string;
  width?: number;
  height?: number;
  glowColor?: number;
  icon?: 'exit_right' | 'exit_left' | 'exit_up' | 'exit_down';
}

/** Crisp backlit club lightbox sign readable in dark haze. */
export function makeClubSign(spec: SignStyle): THREE.Group {
  const w = spec.width ?? 2.2;
  const h = spec.height ?? 0.55;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;

  g.fillStyle = spec.bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = spec.border ?? spec.fg;
  g.lineWidth = 8;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);

  g.fillStyle = spec.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const fontSize = spec.text.length > 13 ? 42 : spec.text.length > 9 ? 50 : 62;
  g.font = `700 ${fontSize}px ui-monospace, Menlo, monospace`;

  let tx = c.width / 2;
  if (spec.icon) {
    // Simple unmistakable running-exit arrow icon on the left side of green exit signs.
    const ix = 64;
    const iy = 64;
    g.beginPath();
    g.arc(ix, iy - 22, 10, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = spec.fg;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(ix, iy - 10);
    g.lineTo(ix - 4, iy + 12);
    g.lineTo(ix - 18, iy + 32);
    g.moveTo(ix - 4, iy + 12);
    g.lineTo(ix + 16, iy + 30);
    g.moveTo(ix - 18, iy + 2);
    g.lineTo(ix + 16, iy - 4);
    g.stroke();
    tx = c.width / 2 + 28;
  }
  g.fillText(spec.text, tx, 66);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const group = new THREE.Group();
  group.name = `sign_${spec.text.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.14), darkSteel);
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
  front.position.z = 0.075;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
  back.rotation.y = Math.PI;
  back.position.z = -0.075;
  group.add(housing, front, back);
  return group;
}

/** Build a familiar, detailed architectural prop for any named level module. Returns null if handled elsewhere. */
export function buildFamiliarModule(name: string): THREE.Group | null {
  switch (name) {
    case 'exit_door':
      return buildExitDoor();
    case 'front_door':
      return buildFrontDoor();
    case 'gate_shortcut':
      return buildSecurityGate();
    case 'hall_speaker':
      return buildSpeakerStack();
    case 'hall_dj_booth':
      return buildDjBooth();
    case 'bar_counter':
      return buildBarCounter(4.0, true);
    case 'cloakroom_counter':
      return buildCloakroomCounter();
    case 'panorama_ice_cream':
      return buildIceCreamCounter();
    case 'toilet_cubicle':
      return buildToiletCubicle();
    case 'panorama_shutter':
      return buildShutter();
    case 'staircase_up':
      return buildStairThreshold();
    default:
      return null;
  }
}

/** Steel fire-exit door with frame, inset panels, stainless push crash-bar handle, and glowing green EXIT sign above. */
function buildExitDoor(): THREE.Group {
  const g = new THREE.Group();
  // Frame posts & header.
  const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.75, 0.28), darkSteel);
  leftPost.position.set(-1.04, 1.375, 0);
  const rightPost = leftPost.clone();
  rightPost.position.x = 1.04;
  const header = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.18, 0.28), darkSteel);
  header.position.set(0, 2.74, 0);
  // Door leaf + inset industrial panels.
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.92, 2.62, 0.14), doorSteel);
  leaf.position.set(0, 1.31, 0);
  const upperPanel = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.92, 0.16), doorPanel);
  upperPanel.position.set(0, 1.92, 0);
  const lowerPanel = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.82, 0.16), doorPanel);
  lowerPanel.position.set(0, 0.62, 0);
  // Stainless steel horizontal panic push-bar + lever handle on BOTH sides so it's unmistakable as a door.
  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.08, 0.06), chrome);
    bar.position.set(0, 1.12, side * 0.12);
    const mountL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.1), brushedSteel);
    mountL.position.set(-0.62, 1.12, side * 0.09);
    const mountR = mountL.clone();
    mountR.position.x = 0.62;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.05), chrome);
    lever.position.set(0.68, 1.12, side * 0.15);
    g.add(bar, mountL, mountR, lever);
  }
  // Glowing green EXIT sign directly above the exit door.
  const exitSign = makeClubSign({
    text: 'EXIT',
    bg: '#083a1b',
    fg: '#4eff8a',
    border: '#35e874',
    width: 1.9,
    height: 0.52,
    icon: 'exit_right',
  });
  exitSign.position.set(0, 3.22, -0.05);
  g.add(leftPost, rightPost, header, leaf, upperPanel, lowerPanel, exitSign);
  return g;
}

/** Heavy steel club front entrance door with frame, twin panels, steel handle bar, and EINLASS sign. */
function buildFrontDoor(): THREE.Group {
  const g = new THREE.Group();
  const postA = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.1, 0.18), darkSteel);
  postA.position.set(0, 1.55, -1.28);
  const postB = postA.clone();
  postB.position.z = 1.28;
  const header = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 2.74), darkSteel);
  header.position.set(0, 3.05, 0);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.95, 2.4), frontDoorMat);
  leaf.position.set(0, 1.475, 0);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.9, 0.04), darkSteel);
  seam.position.set(0, 1.475, 0);
  // Twin vertical industrial pull handles + red NO PHOTOS sticker.
  for (const zOff of [-0.22, 0.22]) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.52, 8), chrome);
    handle.position.set(0.16, 1.2, zOff);
    const topPin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), brushedSteel);
    topPin.position.set(0.1, 1.42, zOff);
    const botPin = topPin.clone();
    botPin.position.y = 0.98;
    g.add(handle, topPin, botPin);
  }
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshBasicMaterial({ color: 0xcc2233 }));
  sticker.rotation.y = Math.PI / 2;
  sticker.position.set(0.105, 1.75, 0.55);
  const sign = makeClubSign({
    text: 'FRONT DOOR',
    bg: '#2b0d12',
    fg: '#ff6b6b',
    border: '#ff4444',
    width: 2.1,
    height: 0.48,
  });
  sign.rotation.y = Math.PI / 2;
  sign.position.set(0.18, 3.5, 0);
  g.add(postA, postB, header, leaf, seam, sticker, sign);
  return g;
}

/** Barred steel security roll-up gate (shortcut between toilets and back exit) with vertical bars and lockbox. */
function buildSecurityGate(): THREE.Group {
  const g = new THREE.Group();
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.24, 0.24), darkSteel);
  topBar.position.y = 2.95;
  const midBar = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.14, 0.18), darkSteel);
  midBar.position.y = 1.45;
  const botBar = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.16, 0.2), darkSteel);
  botBar.position.y = 0.12;
  g.add(topBar, midBar, botBar);
  const bars = 11;
  for (let i = 0; i < bars; i++) {
    const x = -CELL / 2 + 0.3 + (i / (bars - 1)) * (CELL - 0.6);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.9, 8), brushedSteel);
    rod.position.set(x, 1.5, 0);
    g.add(rod);
  }
  const lockBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.26), darkSteel);
  lockBox.position.set(0.6, 1.25, 0);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.34), chrome);
  handle.position.set(0.6, 1.22, 0);
  g.add(lockBox, handle);
  return g;
}

/** Club speaker tower stack with recessed circular bass/mid woofer cones and power LED. */
function buildSpeakerStack(): THREE.Group {
  const g = new THREE.Group();
  // Bottom double-sub cabinet + mid cabinet + top horn cabinet.
  const sub = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.6, 2.25), speakerCab);
  sub.position.y = 1.3;
  const mid = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.1, 2.1), speakerCab);
  mid.position.y = 3.7;
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.55, 1.95), speakerCab);
  top.position.y = 5.6;
  const trim1 = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.12, 2.32), darkSteel);
  trim1.position.y = 2.62;
  const trim2 = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.12, 2.16), darkSteel);
  trim2.position.y = 4.78;
  g.add(sub, mid, top, trim1, trim2);

  // Recessed circular speaker cones on front (+Z) and side faces so it's unmistakably a speaker stack.
  const cones: [number, number, number][] = [
    [0, 1.0, 0.62],
    [0, 2.05, 0.48],
    [0, 3.7, 0.52],
    [0, 5.55, 0.38],
  ];
  for (const [cx, cy, r] of cones) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.055, 8, 18), brushedSteel);
    rim.position.set(cx, cy, 1.13);
    const woofer = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.45, 0.14, 16), speakerCone);
    woofer.rotation.x = Math.PI / 2;
    woofer.position.set(cx, cy, 1.09);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.24, 10, 8), brushedSteel);
    cap.position.set(cx, cy, 1.12);
    g.add(rim, woofer, cap);
  }
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0x22ff66, toneMapped: false }));
  led.position.set(0.82, 6.1, 1.0);
  g.add(led);
  return g;
}

/** DJ console desk with twin glowing CDJ platters, central mixer, VU strip, and monitor speakers. */
function buildDjBooth(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.08, 1.65), darkSteel);
  base.position.y = 0.54;
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.1, 1.85), brushedSteel);
  top.position.y = 1.12;
  g.add(base, top);

  // Twin CDJ decks with illuminated jog wheels.
  for (const x of [-0.85, 0.85]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.72), speakerCab);
    deck.position.set(x, 1.22, 0.1);
    const jog = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), chrome);
    jog.position.set(x, 1.28, 0.15);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.21, 0.018, 8, 20),
      new THREE.MeshBasicMaterial({ color: x < 0 ? 0x33aaff : 0xff4488, toneMapped: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 1.3, 0.15);
    g.add(deck, jog, ring);
  }
  // Mixer + glowing VU bar.
  const mixer = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.72), speakerCab);
  mixer.position.set(0, 1.22, 0.1);
  const vu = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.08), new THREE.MeshBasicMaterial({ color: 0x22ff66, toneMapped: false }));
  vu.position.set(0, 1.28, -0.05);
  // Side booth monitor speakers.
  for (const sx of [-1.42, 1.42]) {
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.36), speakerCab);
    mon.position.set(sx, 1.43, -0.35);
    mon.rotation.y = sx < 0 ? 0.35 : -0.35;
    g.add(mon);
  }
  g.add(mixer, vu);
  return g;
}

/** Bar counter with overhang, foot-rail, glowing beer/Mate tap tower, and bottles. */
export function buildBarCounter(width = 4.0, withSign = false): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(width - 0.15, 1.0, 1.05), darkWood);
  base.position.y = 0.5;
  const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 1.26), warmWood);
  top.position.y = 1.06;
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, width - 0.2, 8), brushedSteel);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 0.22, 0.64);
  g.add(base, top, rail);

  // Tap tower + backlit amber bar bottles so it reads immediately as a bar.
  const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.44, 10), chrome);
  tap.position.set(-0.6, 1.34, 0.0);
  const spout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.14), chrome);
  spout.position.set(-0.6, 1.5, 0.08);
  g.add(tap, spout);

  const bottleCols = [0xd99b26, 0x3b8c52, 0xb8522a, 0xd9a520, 0x6280a8];
  for (let i = 0; i < 5; i++) {
    const bMat = new THREE.MeshStandardMaterial({ color: bottleCols[i], roughness: 0.25, metalness: 0.15 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.28, 8), bMat);
    b.position.set(0.25 + i * 0.26, 1.26, -0.2);
    g.add(b);
  }
  if (withSign) {
    const sign = makeClubSign({ text: 'BAR', bg: '#2c1708', fg: '#ffb357', border: '#ff8a2b', width: 1.8, height: 0.48 });
    sign.position.set(0, 2.75, 0);
    g.add(sign);
  }
  return g;
}

/** Cloakroom / Garderobe counter with overhang, coat-rack rail behind, service bell, and GARDEROBE sign. */
function buildCloakroomCounter(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.85, 1.0, 1.05), darkSteel);
  base.position.y = 0.5;
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.12, 1.25), warmWood);
  top.position.y = 1.06;
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), chrome);
  bell.position.set(-0.8, 1.12, 0.25);
  // Coat-hook rail rising behind the counter.
  const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 8), brushedSteel);
  postL.position.set(-1.7, 1.1, -0.52);
  const postR = postL.clone();
  postR.position.x = 1.7;
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.5, 8), brushedSteel);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, 2.15, -0.52);
  const sign = makeClubSign({ text: 'COAT CHECK', bg: '#151b24', fg: '#d8e8ff', border: '#8cb4e8', width: 2.6, height: 0.5 });
  sign.position.set(0, 2.8, 0);
  g.add(base, top, bell, postL, postR, crossbar, sign);
  return g;
}

/** Panorama ice-cream counter with angled glass sneeze-guard, glowing pastel gelato tubs, and EIS sign. */
function buildIceCreamCounter(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.92, 1.15), darkSteel);
  base.position.y = 0.46;
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 1.22), brushedSteel);
  top.position.y = 0.96;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.46, 0.95), glassMat);
  glass.position.set(0, 1.23, 0.04);
  g.add(base, top, glass);

  const flavors = [0xf7d8e0, 0xd4f0c0, 0xfff0b8, 0xc8e4ff];
  for (let i = 0; i < flavors.length; i++) {
    const tub = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.16, 0.52),
      new THREE.MeshBasicMaterial({ color: flavors[i] }),
    );
    tub.position.set(-0.95 + i * 0.64, 1.06, 0.04);
    g.add(tub);
  }
  const sign = makeClubSign({ text: 'EIS / ICE CREAM', bg: '#2b1222', fg: '#ffd6ee', border: '#ff7ec4', width: 2.5, height: 0.48 });
  sign.position.set(0, 2.65, 0);
  g.add(sign);
  return g;
}

/** Toilet cubicle stall with tiled walls, recessed door seam, silver lever handle, and occupied lock dial. */
function buildToiletCubicle(): THREE.Group {
  const g = new THREE.Group();
  const tile = toiletTileMat();
  // Side & back walls with tiled texture.
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.96, 2.4, 0.14), tile);
  back.position.set(0, 1.2, -0.93);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.4, 2.0), tile);
  left.position.set(-1.93, 1.2, 0);
  const right = left.clone();
  right.position.x = 1.93;
  // Front wall with two clearly defined cubicle doors + lever handles + occupied red/green indicators.
  const midPost = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.14), darkSteel);
  midPost.position.set(0, 1.2, 0.93);
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.14, 0.14), darkSteel);
  topRail.position.set(0, 2.33, 0.93);
  g.add(back, left, right, midPost, topRail);

  for (const dx of [-0.96, 0.96]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.68, 2.02, 0.08), doorPanel);
    door.position.set(dx, 1.18, 0.94);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.08), chrome);
    handle.position.set(dx + 0.62, 1.05, 1.01);
    const lockDial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10),
      new THREE.MeshBasicMaterial({ color: dx < 0 ? 0xff3b30 : 0x34c759 }),
    );
    lockDial.rotation.x = Math.PI / 2;
    lockDial.position.set(dx + 0.62, 1.16, 0.99);
    g.add(door, handle, lockDial);
  }
  return g;
}

/** Iconic Berghain Panorama Bar steel louvered window shutters. */
function buildShutter(): THREE.Group {
  const g = new THREE.Group();
  const h = 16;
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.42), darkSteel);
  frameL.position.set(-CELL / 2 + 0.11, h / 2, 0);
  const frameR = frameL.clone();
  frameR.position.x = CELL / 2 - 0.11;
  g.add(frameL, frameR);
  // Horizontal louvered slats.
  const slats = 14;
  for (let i = 0; i < slats; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(CELL - 0.3, 0.85, 0.18), shutterMat);
    slat.position.set(0, 0.65 + (i / slats) * (h - 1.2), 0);
    slat.rotation.x = 0.22;
    g.add(slat);
  }
  return g;
}

/** Floor stair threshold with visible ribbed steel steps. */
function buildStairThreshold(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 0.85), i % 2 === 0 ? darkSteel : brushedSteel);
    step.position.set(0, 0.04 + i * 0.06, -1.4 + i * 0.92);
    g.add(step);
  }
  return g;
}

/** Wayfinding & zone signs mounted cleanly around the club so players always orient themselves. */
export function buildClubSignage(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'club_signage';

  // 1. Main hall -> Bar & Toilets east passage ([10, 4] wall opening).
  const toBar = makeClubSign({ text: 'BAR / WC ->', bg: '#181c22', fg: '#e6eef8', border: '#8fa4bf', width: 2.6, height: 0.52 });
  const cBar = cellCenter(10, 4);
  toBar.rotation.y = -Math.PI / 2;
  toBar.position.set(cBar.x + CELL / 2 - 0.15, 3.8, cBar.z);
  root.add(toBar);

  // 2. Main hall -> Panorama Bar south passage ([6, 9]).
  const toPano = makeClubSign({ text: 'PANORAMA BAR', bg: '#2b1024', fg: '#ff8ad4', border: '#ff52b8', width: 2.8, height: 0.52 });
  const cPano = cellCenter(6, 9);
  toPano.position.set(cPano.x, 3.8, cPano.z - CELL / 2 + 0.2);
  root.add(toPano);

  // 3. Monumental staircase foot: UPSTAIRS PANORAMA BAR.
  const stairsSign = makeClubSign({ text: 'UP: PANORAMA BAR', bg: '#2c1708', fg: '#ffbc6b', border: '#ff8a2b', width: 3.1, height: 0.54 });
  stairsSign.position.set(27.3, 3.9, 33.4);
  root.add(stairsSign);

  // 4. Upstairs 9 m Panorama Bar entrance sign.
  const upstairsSign = makeClubSign({ text: 'PANORAMA BAR', bg: '#2c1708', fg: '#ffb357', border: '#ff8a2b', width: 3.0, height: 0.54 });
  upstairsSign.position.set(42, FLOOR_HEIGHT + 3.15, 48.3);
  root.add(upstairsSign);

  // 5. Toilet corridor entry sign ([13, 5]).
  const wcSign = makeClubSign({ text: 'WC / TOILETS', bg: '#0f221b', fg: '#a8ffd0', border: '#5de09e', width: 2.5, height: 0.5 });
  const cWc = cellCenter(13, 5);
  wcSign.position.set(cWc.x, 3.6, cWc.z - CELL / 2 + 0.3);
  root.add(wcSign);

  // 6. Green directional EXIT sign above the shortcut gate ([13, 9]) pointing south toward the back exit.
  const gateExit = makeClubSign({
    text: 'EXIT',
    bg: '#083a1b',
    fg: '#4eff8a',
    border: '#35e874',
    width: 2.0,
    height: 0.5,
    icon: 'exit_down',
  });
  const cGate = cellCenter(13, 9);
  gateExit.position.set(cGate.x, 3.7, cGate.z);
  root.add(gateExit);

  // 7. Green directional EXIT -> sign in the back exit corridor ([12, 10]) guiding straight to the door.
  const hallExit = makeClubSign({
    text: 'EXIT ->',
    bg: '#083a1b',
    fg: '#4eff8a',
    border: '#35e874',
    width: 2.2,
    height: 0.5,
    icon: 'exit_right',
  });
  const cExitHall = cellCenter(12, 10);
  hallExit.position.set(cExitHall.x, 3.4, cExitHall.z - CELL / 2 + 0.35);
  root.add(hallExit);

  // 8. Darkroom crimson sign over the entrance ([16, 6] facing west into toilet corridor).
  const darkSign = makeClubSign({ text: 'DARKROOM', bg: '#260612', fg: '#ff4275', border: '#cc1e4d', width: 2.3, height: 0.48 });
  const cDark = cellCenter(16, 6);
  darkSign.rotation.y = -Math.PI / 2;
  darkSign.position.set(cDark.x - CELL / 2 + 0.15, 3.45, cDark.z);
  root.add(darkSign);

  // Keep CEILING imported/used cleanly if needed for future high signs.
  void CEILING;
  return root;
}
