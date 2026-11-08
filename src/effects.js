import * as THREE from 'three';

// Vibration for phones and gamepads. Both calls are ignored on devices that do not support them.
export function haptic(ms = 60, strong = 0.8, weak = 0.5) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ }
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      const act = gp && gp.vibrationActuator;
      if (act && act.playEffect) {
        act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak });
      }
    }
  } catch (e) { /* unsupported */ }
}

const BLOOD_COLORS = [0x7a0000, 0x9a0505, 0xb00808, 0x5a0000];
const MAX_PARTICLES = 160;
const MAX_DECALS = 70;
const MAX_NUMBERS = 24;
const MAX_PUFFS = 12;

function makeNumberTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 84px "Courier New", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 14;
  g.strokeStyle = 'rgba(0,0,0,0.9)';
  g.strokeText(text, 128, 66);
  g.fillStyle = color;
  g.fillText(text, 128, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePuffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(160,0,0,0.9)');
  grad.addColorStop(0.5, 'rgba(110,0,0,0.5)');
  grad.addColorStop(1, 'rgba(80,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Blood sprays, floor stains, floating damage numbers, sparks and the hit marker.
// Everything is pooled, so a long fight allocates nothing after the first few seconds.
export class CombatFX {
  constructor(scene, container) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Particles (blood droplets and sparks)
    const pGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0x8a0303 }));
      mesh.visible = false;
      this.group.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3(), life: 0, spark: false });
    }

    // Floor stains
    const dGeo = new THREE.CircleGeometry(1, 14);
    this.decals = [];
    for (let i = 0; i < MAX_DECALS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x5a0000, transparent: true, opacity: 0.85, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      });
      const mesh = new THREE.Mesh(dGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.decals.push(mesh);
    }
    this.nextDecal = 0;

    // Mist puffs at the wound
    const puffTex = makePuffTexture();
    this.puffs = [];
    for (let i = 0; i < MAX_PUFFS; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
      sp.visible = false;
      this.group.add(sp);
      this.puffs.push({ sprite: sp, life: 0 });
    }
    this.nextPuff = 0;

    // Damage numbers
    this.numbers = [];
    for (let i = 0; i < MAX_NUMBERS; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      sp.renderOrder = 999;
      sp.visible = false;
      this.group.add(sp);
      this.numbers.push({ sprite: sp, life: 0, vy: 0, vx: 0 });
    }
    this.nextNumber = 0;
    this.numberTextures = {};

    // Hit marker on the crosshair
    this.marker = document.createElement('div');
    this.marker.id = 'hitmarker';
    this.marker.innerHTML = '<i></i><i></i><i></i><i></i>';
    (container || document.body).appendChild(this.marker);
    this.markerTimer = 0;

    this._v = new THREE.Vector3();
  }

  // Blood spray from a wound. dir is the way the hit was travelling.
  blood(point, dir, amount = 14, speed = 3.2) {
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= amount) break;
      if (p.life > 0) continue;
      p.life = 0.55 + Math.random() * 0.5;
      p.spark = false;
      p.mesh.material.color.setHex(BLOOD_COLORS[(Math.random() * BLOOD_COLORS.length) | 0]);
      p.mesh.position.copy(point);
      p.mesh.scale.setScalar(0.6 + Math.random() * 1.4);
      p.mesh.visible = true;
      p.vel.set(
        dir.x * speed * (0.5 + Math.random()) + (Math.random() - 0.5) * 2.4,
        0.6 + Math.random() * 2.4,
        dir.z * speed * (0.5 + Math.random()) + (Math.random() - 0.5) * 2.4
      );
      spawned++;
    }
    // Mist at the wound
    const pf = this.puffs[this.nextPuff++ % MAX_PUFFS];
    pf.life = 0.28;
    pf.sprite.position.copy(point);
    pf.sprite.scale.setScalar(0.25);
    pf.sprite.material.opacity = 0.8;
    pf.sprite.visible = true;
  }

  // Sparks and dust where a bullet strikes a wall
  sparks(point, dir) {
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= 7) break;
      if (p.life > 0) continue;
      p.life = 0.25 + Math.random() * 0.2;
      p.spark = true;
      p.mesh.material.color.setHex(Math.random() < 0.5 ? 0xffd27a : 0xcccccc);
      p.mesh.position.copy(point);
      p.mesh.scale.setScalar(0.5 + Math.random() * 0.6);
      p.mesh.visible = true;
      p.vel.set(-dir.x * 2 + (Math.random() - 0.5) * 3, Math.random() * 2.5, -dir.z * 2 + (Math.random() - 0.5) * 3);
      spawned++;
    }
  }

  stain(x, z, radius) {
    const d = this.decals[this.nextDecal++ % MAX_DECALS];
    d.position.set(x, 0.012 + (this.nextDecal % 5) * 0.0006, z);
    d.scale.set(radius * (0.8 + Math.random() * 0.5), radius * (0.8 + Math.random() * 0.5), 1);
    d.rotation.z = Math.random() * Math.PI * 2;
    d.material.opacity = 0.85;
    d.visible = true;
  }

  // A pool that spreads under a body that just went down
  pool(x, z) {
    this.stain(x, z, 0.55);
    this.stain(x + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4, 0.38);
  }

  // Floating number above a target. Red for fists, yellow for the rifle, bigger on a kill.
  damageNumber(point, amount, opts = {}) {
    const color = opts.kill ? '#ff3030' : (opts.rifle ? '#ffd23a' : '#ffffff');
    const text = String(amount);
    const key = text + color;
    if (!this.numberTextures[key]) this.numberTextures[key] = makeNumberTexture(text, color);
    const n = this.numbers[this.nextNumber++ % MAX_NUMBERS];
    n.sprite.material.map = this.numberTextures[key];
    n.sprite.material.opacity = 1;
    n.sprite.material.needsUpdate = true;
    const s = opts.kill ? 1.15 : 0.8;
    n.sprite.scale.set(s, s * 0.5, 1);
    n.sprite.position.copy(point);
    n.sprite.visible = true;
    n.life = 0.9;
    n.vy = 1.6;
    n.vx = (Math.random() - 0.5) * 0.8;
  }

  hitMarker(kill = false) {
    this.marker.classList.toggle('kill', kill);
    this.marker.classList.add('on');
    this.markerTimer = kill ? 0.3 : 0.14;
  }

  clear() {
    for (const p of this.particles) { p.life = 0; p.mesh.visible = false; }
    for (const d of this.decals) d.visible = false;
    for (const n of this.numbers) { n.life = 0; n.sprite.visible = false; }
    for (const pf of this.puffs) { pf.life = 0; pf.sprite.visible = false; }
    this.marker.classList.remove('on');
  }

  update(delta) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= delta;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 9.8 * delta;
      p.mesh.position.addScaledVector(p.vel, delta);
      if (p.mesh.position.y <= 0.02) {
        // A blood droplet that reaches the floor leaves a small stain
        if (!p.spark && Math.random() < 0.55) this.stain(p.mesh.position.x, p.mesh.position.z, 0.05 + Math.random() * 0.1);
        p.life = 0;
        p.mesh.visible = false;
      }
    }
    for (const pf of this.puffs) {
      if (pf.life <= 0) continue;
      pf.life -= delta;
      if (pf.life <= 0) { pf.sprite.visible = false; continue; }
      const k = 1 - pf.life / 0.28;
      pf.sprite.scale.setScalar(0.25 + k * 0.7);
      pf.sprite.material.opacity = 0.8 * (1 - k);
    }
    for (const n of this.numbers) {
      if (n.life <= 0) continue;
      n.life -= delta;
      if (n.life <= 0) { n.sprite.visible = false; continue; }
      n.vy = Math.max(0.2, n.vy - 3.0 * delta);
      n.sprite.position.y += n.vy * delta;
      n.sprite.position.x += n.vx * delta;
      n.sprite.material.opacity = Math.min(1, n.life / 0.35);
    }
    if (this.markerTimer > 0) {
      this.markerTimer -= delta;
      if (this.markerTimer <= 0) this.marker.classList.remove('on');
    }
  }
}
