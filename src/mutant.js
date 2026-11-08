import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { loadRiggedCharacter, RigPlayer } from './character-anim.js';
import { moveWithWalls } from './collision.js';

// Where the infected staff start. Each spot is nudged to open floor at spawn time.
export const MUTANT_SPAWNS = [[6, 12], [-6, 14], [-2, -2], [14, -2], [-14, -20]];

const MAX_HEALTH = 4;
const CHASE_RANGE = 9;
const LOSE_RANGE = 16;
const CHASE_SPEED = 1.9;
const ATTACK_RANGE = 1.5;
export const ATTACK_DAMAGE = 12;
const ATTACK_COOLDOWN = 2.4;

// The punch clip (3.83s) is played at 2.5x, so one swing lasts about 1.5s
const ATTACK_TIMESCALE = 2.5;
const ATTACK_LENGTH = 3.83 / ATTACK_TIMESCALE;
const ATTACK_HIT_AT = 0.55;
const DEATH_HOLD = 4.8;

function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * Math.min(1, t);
}

// Loads the infected staff model and clips once. Each enemy gets its own copy of the skeleton.
export function loadMutantTemplate() {
  return loadRiggedCharacter({
    mesh: 'animations/mutant.fbx',
    clips: {
      walk: 'animations/clips/mutantWalk.json',
      attack: 'animations/clips/mutantPunch.json',
      die: 'animations/clips/mutantDie.json'
    },
    height: 2.1
  });
}

// A small enemy: it shambles until the investigator is near, then chases and punches.
// Update returns 'HIT' on the frame its punch lands, so the game applies the damage.
export class Mutant {
  constructor({ scene, template, world, player, spawn }) {
    this.world = world;
    this.player = player;
    this.spawn = spawn.clone();
    this.speeds = template.speeds;

    this.root = cloneSkeleton(template.root);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group = new THREE.Group();
    this.group.add(this.root);
    this.group.position.copy(this.spawn);
    this.group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(this.group);

    this.rig = new RigPlayer(this.root, template.clips, template.speeds);
    this.rig.play('walk', { timeScale: 0.15 });

    this.health = MAX_HEALTH;
    this.dead = false;
    this.deadTimer = 0;
    this.aggro = false;
    this.cooldown = 0;
    this.attackTimer = -1;
    this.attackHit = false;
    this._dir = new THREE.Vector3();
  }

  get position() { return this.group.position; }

  update(delta) {
    if (this.dead) {
      this.deadTimer += delta;
      this.rig.update(delta);
      if (this.deadTimer > DEATH_HOLD) this.group.visible = false;
      return null;
    }

    const p = this.player.yawObject.position;
    const pos = this.group.position;
    const dx = p.x - pos.x;
    const dz = p.z - pos.z;
    const dist = Math.hypot(dx, dz);

    if (!this.aggro && dist < CHASE_RANGE) this.aggro = true;
    else if (this.aggro && dist > LOSE_RANGE) this.aggro = false;
    this.cooldown = Math.max(0, this.cooldown - delta);

    let result = null;
    if (this.attackTimer >= 0) {
      this.attackTimer += delta;
      if (!this.attackHit && this.attackTimer > ATTACK_HIT_AT) {
        this.attackHit = true;
        if (dist < ATTACK_RANGE + 0.5) result = 'HIT';
      }
      if (this.attackTimer > ATTACK_LENGTH) {
        this.attackTimer = -1;
        this.attackHit = false;
      }
    } else if (this.aggro && dist <= ATTACK_RANGE && this.cooldown <= 0) {
      this.attackTimer = 0;
      this.attackHit = false;
      this.cooldown = ATTACK_COOLDOWN;
      this.rig.play('attack', { once: true, then: 'walk', fade: 0.1, timeScale: ATTACK_TIMESCALE });
    }

    const attacking = this.attackTimer >= 0;
    let speed = 0;
    if (!attacking && this.aggro) {
      const target = Math.atan2(dx, dz);
      if (dist > ATTACK_RANGE * 0.8) {
        const dir = this._dir.set(dx, 0, dz).normalize();
        moveWithWalls(this.world, pos, dir, CHASE_SPEED * delta);
        speed = CHASE_SPEED;
      }
      this.group.rotation.y = lerpAngle(this.group.rotation.y, target, delta * 6);
    }

    if (!attacking) {
      if (speed > 0) this.rig.play('walk', { fade: 0.2, timeScale: THREE.MathUtils.clamp(speed / this.speeds.walk, 0.3, 3) });
      else this.rig.play('walk', { fade: 0.4, timeScale: 0.15 });
    }
    this.rig.update(delta);
    return result;
  }

  // Returns true when this hit kills it
  takeHit(amount) {
    if (this.dead) return false;
    this.health -= amount;
    if (this.health > 0) return false;
    this.dead = true;
    this.aggro = false;
    this.attackTimer = -1;
    this.rig.play('die', { once: true, fade: 0.1 });
    return true;
  }

  reset() {
    this.dead = false;
    this.deadTimer = 0;
    this.health = MAX_HEALTH;
    this.aggro = false;
    this.cooldown = 0;
    this.attackTimer = -1;
    this.attackHit = false;
    this.group.visible = true;
    this.group.position.copy(this.spawn);
    this.rig.play('walk', { fade: 0.05, timeScale: 0.15 });
  }
}


