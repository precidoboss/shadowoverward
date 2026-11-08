import * as THREE from 'three';
import { modelFactory } from './models.js';
import { soundEngine } from './audio.js';

export const RIFLE_DAMAGE = 2;
export const PUNCH_DAMAGE = 1;
const PUNCH_RANGE = 2.0;
const PUNCH_HIT_AT = 0.3;
const PUNCH_COOLDOWN = 1.0;
const FIRE_COOLDOWN = 0.4;
const FLASH_TIME = 0.06;

const gunMetal = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.6 });
const gunWood = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.8 });
const ammoMat = new THREE.MeshStandardMaterial({ color: 0x55663a, roughness: 0.9 });

// Procedural service rifle, pointing down its local -z. The Shooter Pack has animations for a rifle
// but no rifle mesh, so the gun is built from boxes and cylinders.
export function buildRifleMesh() {
  const g = new THREE.Group();
  const add = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(0.075, 0.09, 0.36, gunMetal, 0, 0, 0);            // receiver
  add(0.024, 0.024, 0.36, gunMetal, 0, 0.02, -0.36);    // barrel
  add(0.06, 0.1, 0.22, gunWood, 0, -0.01, 0.27);        // stock
  add(0.04, 0.13, 0.05, gunMetal, 0, -0.11, -0.02);     // magazine
  add(0.04, 0.11, 0.05, gunWood, 0, -0.1, 0.1);         // grip
  add(0.02, 0.03, 0.04, gunMetal, 0, 0.07, -0.1);       // sight
  const flash = modelFactory.makeGlow(0xffcc66, 0.22);
  flash.position.set(0, 0.02, -0.56);
  flash.visible = false;
  g.add(flash);
  g.userData.flash = flash;
  return g;
}

// Ammo box on the floor. Its rounds are added when it is picked up.
function buildAmmoBox() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.2), ammoMat);
  box.position.y = 0.08;
  box.castShadow = true;
  g.add(box);
  return g;
}

// Places a rifle or ammo pickup on the floor. It is an interactable, so [E] picks it up.
export function createPickup(game, type, spot) {
  const group = type === 'rifle' ? buildRifleMesh() : buildAmmoBox();
  if (type === 'rifle') {
    group.rotation.set(0, 0.6, 0);
    group.position.set(spot.x, 0.07, spot.z);
  } else {
    group.position.set(spot.x, 0, spot.z);
  }
  group.userData = {
    isInteractable: true,
    type,
    name: type === 'rifle' ? 'Service Rifle' : 'Rifle Ammo'
  };
  game.scene.add(group);
  game.world.interactables.push(group);
  return group;
}

// Fists and the service rifle. Q switches between them, left click uses the current one.
export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.player = game.player;
    this.owned = false;
    this.armed = false;
    this.ammo = 0;
    this.fireCooldown = 0;
    this.punchCooldown = 0;
    this.punchTimer = -1;
    this.flashTimer = 0;
    this._center = new THREE.Vector2(0, 0);
    this._fwd = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._hand = new THREE.Vector3();
    this._handQ = new THREE.Quaternion();
    this.raycaster = new THREE.Raycaster();
    this.hand = null;

    // First-person view: the rifle sits in front of the camera
    this.gunFP = buildRifleMesh();
    this.gunFP.position.set(0.22, -0.2, -0.42);
    this.gunFP.visible = false;
    this.player.camera.add(this.gunFP);

    // Third-person view: the rifle follows the investigator's right hand
    this.gunTP = buildRifleMesh();
    this.gunTP.visible = false;
    this.game.scene.add(this.gunTP);
  }

  acquireRifle(rounds) {
    this.owned = true;
    this.armed = true;
    this.ammo += rounds;
    this.player.armed = true;
  }

  addAmmo(n) {
    this.ammo += n;
  }

  toggleArmed() {
    if (!this.owned) {
      this.game.ui.showBannerNotification('NO RIFLE YET.\nUSE YOUR FISTS [LEFT CLICK].');
      return;
    }
    this.armed = !this.armed;
    this.player.armed = this.armed;
    this.game.ui.showBannerNotification(this.armed ? `RIFLE READY: ${this.ammo} ROUNDS` : 'FISTS READY');
  }

  reset() {
    this.owned = false;
    this.armed = false;
    this.ammo = 0;
    this.fireCooldown = 0;
    this.punchCooldown = 0;
    this.punchTimer = -1;
    this.flashTimer = 0;
    this.player.armed = false;
  }

  get label() {
    if (!this.owned) return 'FISTS';
    return this.armed ? `RIFLE ${this.ammo} RD` : `FISTS (RIFLE ${this.ammo} RD)`;
  }

  // Everything that can be hit right now: infected staff still standing, and Subject 407 while it is awake
  targets() {
    const list = [];
    for (const m of this.game.mutants) if (!m.dead && m.group.visible) list.push(m);
    const e = this.game.entity;
    if (e.isActive && e.health > 0) list.push(e);
    return list;
  }

  attack() {
    if (this.game.state !== 'PLAYING') return;
    if (this.armed) this.fire();
    else this.punch();
  }

  punch() {
    if (this.punchCooldown > 0) return;
    this.punchCooldown = PUNCH_COOLDOWN;
    this.punchTimer = PUNCH_HIT_AT;
    this.player.playPunch();
  }

  // Strikes whatever stands in front, within reach
  punchHit() {
    const yaw = this.player.yawObject.rotation.y;
    const fwd = this._fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const p = this.player.yawObject.position;
    for (const t of this.targets()) {
      const tp = t.group ? t.group.position : t.mesh.position;
      const to = this._to.set(tp.x - p.x, 0, tp.z - p.z);
      const d = to.length();
      if (d > PUNCH_RANGE || d < 0.01) continue;
      if (fwd.dot(to.multiplyScalar(1 / d)) < 0.4) continue;
      this.damage(t, PUNCH_DAMAGE);
      soundEngine.playDoorCreak(false);
      return;
    }
  }

  fire() {
    if (this.fireCooldown > 0) return;
    if (this.ammo <= 0) {
      this.fireCooldown = 0.5;
      soundEngine.playLockedDoor();
      this.game.ui.showBannerNotification('OUT OF AMMO.\nFIND RIFLE AMMO BOXES.');
      return;
    }
    this.ammo--;
    this.fireCooldown = FIRE_COOLDOWN;
    this.flashTimer = FLASH_TIME;
    this.gunFP.userData.flash.visible = true;
    this.gunTP.userData.flash.visible = true;
    soundEngine.playStaticBurst(0.12);
    this.player.playFire();

    // Ray from the crosshair. Walls stop the shot before any target behind them.
    this.raycaster.setFromCamera(this._center, this.player.camera);
    const ray = this.raycaster.ray;
    let best = Infinity;
    for (const col of this.game.world.colliders) {
      const hit = ray.intersectBox(col, this._hit);
      if (hit) best = Math.min(best, ray.origin.distanceTo(this._hit));
    }
    let target = null;
    const sphere = new THREE.Sphere();
    for (const t of this.targets()) {
      const tp = t.group ? t.group.position : t.mesh.position;
      sphere.center.set(tp.x, 1.1, tp.z);
      sphere.radius = t.group ? 0.45 : 0.65;
      const hit = ray.intersectSphere(sphere, this._hit);
      if (!hit) continue;
      const d = ray.origin.distanceTo(this._hit);
      if (d < best && d < 40) { best = d; target = t; }
    }
    if (target) this.damage(target, RIFLE_DAMAGE);
  }

  damage(target, amount) {
    const killed = target.takeHit ? target.takeHit(amount) : false;
    if (target.group) {
      // Infected staff
      if (killed) this.game.ui.showBannerNotification('INFECTED STAFF DOWN.');
    } else {
      // Subject 407 is the boss
      this.game.ui.setBossHealth && this.game.ui.setBossHealth(target.health / target.maxHealth);
      if (killed) this.game.onBossDown();
    }
  }

  update(delta) {
    this.fireCooldown = Math.max(0, this.fireCooldown - delta);
    this.punchCooldown = Math.max(0, this.punchCooldown - delta);
    if (this.punchTimer >= 0) {
      this.punchTimer -= delta;
      if (this.punchTimer < 0) this.punchHit();
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.gunFP.userData.flash.visible = false;
        this.gunTP.userData.flash.visible = false;
      }
    }

    const tp = this.player.viewMode === 'THIRD_PERSON';
    if (!this.hand && this.player.rig) {
      this.player.rig.root.traverse(o => { if (o.name === 'mixamorigRightHand') this.hand = o; });
    }
    // Position the third-person rifle at the hand, every frame, so it follows the animation
    if (tp && this.hand) {
      this.hand.getWorldPosition(this._hand);
      this.hand.getWorldQuaternion(this._handQ);
      this.gunTP.position.copy(this._hand);
      this.gunTP.quaternion.copy(this._handQ);
    }
    this.gunFP.visible = this.armed && !tp;
    this.gunTP.visible = this.armed && tp;
    // The stock first-person hands are hidden while the rifle is in use
    if (this.player.fpsEquip) this.player.fpsEquip.visible = !this.armed && !tp;
  }
}
