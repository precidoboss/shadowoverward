import * as THREE from 'three';
import { modelFactory } from './models.js';
import { soundEngine } from './audio.js';
import { loadRiggedCharacter, RigPlayer } from './character-anim.js';

const SPAWN = new THREE.Vector3(0, 0, -10);

// Shortest-path angle lerp, so turning never spins the long way round
function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * Math.min(1, t);
}

export class EntityAI {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.mesh = modelFactory.createTheEntity();
    this.scene.add(this.mesh);

    // Starts dormant in the north corridor. Visible from the start, but it does not move until awakened.
    this.spawnPos = SPAWN.clone();
    this.mesh.position.copy(this.spawnPos);
    this.isActive = false;

    // States: 'PATROL', 'STALK', 'CHASE' (dormancy is tracked by isActive)
    this.state = 'PATROL';
    this.patrolPoints = [
      new THREE.Vector3(0, 0, 5),       // Lobby corridor entry
      new THREE.Vector3(-8.5, 0, 6.5),  // Ward A Room 101
      new THREE.Vector3(-11, 0, -6.5),  // Ward A Room 102
      new THREE.Vector3(0, 0, -6.0),    // Central hallway
      new THREE.Vector3(10, 0, 6.5),    // Office doorway
      new THREE.Vector3(10, 0, -7.0),   // Ward B
      new THREE.Vector3(0, 0, -22.0)    // Basement stair base
    ];
    this.currentPatrolIdx = 0;
    this.patrolWaitTimer = 0;

    this.animTime = 0;
    this.walkPhase = 0;
    this.lean = 0.12;
    this.crawl = 0;
    this.proximityDanger = 0; // 0 to 1
    this.spottedTimer = 0;
    // After it wakes, it patrols for this many seconds and cannot detect the player
    this.graceTime = 20;
    this.grace = 0;
    this.grabTimer = 0;
    this.stuck = 0;

    // Scratch vectors (no per-frame allocations)
    this._targetPos = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._before = new THREE.Vector3();
    this._probeBox = new THREE.Box3();
    this._eyePos = new THREE.Vector3();

    // Set by main.js so the entity can be stopped by walls and doors
    this.world = null;
    // Rigged body (replaces the procedural one once loaded)
    this.rig = null;
    this.headBone = null;
    this.eyeGlow = null;
  }

  // Keeps the entity inside the level: it cannot pass through walls, shut doors or furniture.
  // Tries the full step, then each axis on its own, so it slides along walls.
  moveWithWalls(pos, dir, step) {
    const nx = pos.x + dir.x * step;
    const nz = pos.z + dir.z * step;
    if (!this.blockedAt(nx, nz)) { pos.x = nx; pos.z = nz; }
    else if (!this.blockedAt(nx, pos.z)) pos.x = nx;
    else if (!this.blockedAt(pos.x, nz)) pos.z = nz;
  }

  blockedAt(x, z) {
    if (!this.world) return false;
    const b = this._probeBox;
    b.min.set(x - 0.3, 0, z - 0.3);
    b.max.set(x + 0.3, 1.8, z + 0.3);
    const cols = this.world.colliders;
    for (let i = 0; i < cols.length; i++) {
      if (b.intersectsBox(cols[i])) return true;
    }
    return false;
  }

  // Swaps the procedural body for the rigged Mixamo character. Its breathing and walking clips drive it.
  async loadRig() {
    try {
      const { root, clips, speeds } = await loadRiggedCharacter({
        mesh: 'animations/enemy-breathing.fbx',
        clips: { breathing: 'animations/clips/breathing.json', walk: 'animations/clips/enemyWalk.json' },
        height: 1.9,
        slimX: 0.8
      });
      root.traverse(o => {
        if (o.isBone && !this.headBone && /Head$/.test(o.name)) this.headBone = o;
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => { if (m.color) m.color.multiplyScalar(0.35); });
        }
      });
      // Hide the procedural body's meshes and glow sprites. Lights stay on, so no shader recompiles.
      this.mesh.traverse(o => { if (o.isMesh || o.isSprite) o.visible = false; });
      this.eyeGlow = modelFactory.makeGlow(0x9fe8ff, 0.3);
      this.mesh.add(this.eyeGlow);
      this.mesh.add(root);
      this.rig = new RigPlayer(root, clips, speeds);
      this.rig.play('breathing');
    } catch (err) {
      console.warn('Subject 407 model unavailable, using the basic body:', err);
    }
  }

  // Walk clip speed follows the entity's speed, so patrol looks slow and the chase looks quick.
  animateRig(delta, speed) {
    // Foot speed follows the entity's real speed (patrol and chase use different rates)
    if (speed > 0.01) this.rig.play('walk', { fade: 0.2, timeScale: THREE.MathUtils.clamp(speed / this.rig.speeds.walk, 0.3, 3) });
    else this.rig.play('breathing', { fade: 0.4 });
    this.rig.update(delta);
    this.placeEyes();
  }

  // Keeps the eye light and glow at the rigged head
  placeEyes() {
    if (!this.headBone) return;
    const p = this._eyePos;
    this.headBone.getWorldPosition(p);
    this.mesh.worldToLocal(p);
    p.z += 0.2;
    p.y += 0.02;
    if (this.eyeGlow) this.eyeGlow.position.copy(p);
    const light = this.mesh.userData.eyeLight;
    if (light) light.position.copy(p);
  }

  activate() {
    this.isActive = true;
    this.mesh.visible = true;
    this.grace = 0;
    this.grabTimer = 0;
    this.stuck = 0;
  }

  // Restore the dormant state for a new run
  reset() {
    this.mesh.position.copy(this.spawnPos);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.visible = true;
    this.isActive = false;
    this.state = 'PATROL';
    this.currentPatrolIdx = 0;
    this.patrolWaitTimer = 0;
    this.spottedTimer = 0;
    this.proximityDanger = 0;
    this.grace = 0;
    this.grabTimer = 0;
    this.stuck = 0;
    this.player.entityProximityFlicker = false;
  }

  update(delta, time) {
    this.animTime += delta;

    // Dormant is a pose, not an AI state: it is derived from isActive so the state
    // label stays valid when the entity wakes up.
    if (!this.isActive) {
      this.animate(delta, 0);
      return null;
    }

    const playerPos = this.player.yawObject.position;
    const entityPos = this.mesh.position;
    const distToPlayer = entityPos.distanceTo(playerPos);

    // Proximity danger: 0 at 18m, 1.0 at 2m
    this.proximityDanger = Math.max(0, Math.min(1.0, 1.0 - (distToPlayer - 2.0) / 16.0));
    this.player.entityProximityFlicker = this.proximityDanger > 0.45;
    soundEngine.updateHeartbeatRate(this.proximityDanger);

    // Awareness: hearing (running is loud) and sight (flashlight or very close)
    const playerIsRunning = this.player.isSprinting && (this.player.moveForward || this.player.moveBackward);
    const hearingDist = playerIsRunning ? 15.0 : 5.0;
    const canSee = distToPlayer < 12.0 && (this.player.flashlightOn || distToPlayer < 4.0);
    this.grace = Math.min(this.graceTime, this.grace + delta);
    const awake = this.grace >= this.graceTime;
    const playerSpotted = awake && (distToPlayer < hearingDist || canSee);

    if (playerSpotted) {
      this.state = distToPlayer < 8.0 ? 'CHASE' : 'STALK';
      this.spottedTimer = 0;
    } else if (this.state === 'CHASE' || this.state === 'STALK') {
      this.spottedTimer += delta;
      if (this.spottedTimer > 4.0) {
        this.state = 'PATROL';
        this.spottedTimer = 0;
      }
    }

    let moveSpeed = 1.6;
    if (this.state === 'CHASE') moveSpeed = 3.8;
    else if (this.state === 'STALK') moveSpeed = 2.4;

    // Navigation
    let targetPos = null;
    if (this.state === 'CHASE' || this.state === 'STALK') {
      targetPos = this._targetPos.set(playerPos.x, 0, playerPos.z);
    } else {
      const currentTarget = this.patrolPoints[this.currentPatrolIdx];
      if (entityPos.distanceTo(currentTarget) < 1.0) {
        this.patrolWaitTimer += delta;
        if (this.patrolWaitTimer > 3.0) {
          this.patrolWaitTimer = 0;
          this.currentPatrolIdx = (this.currentPatrolIdx + 1) % this.patrolPoints.length;
        }
      } else {
        targetPos = currentTarget;
      }
    }

    let speedNow = 0;
    if (targetPos) {
      const dir = this._dir.subVectors(targetPos, entityPos);
      dir.y = 0;
      if (dir.lengthSq() > 0.1) {
        dir.normalize();
        const before = this._before.copy(entityPos);
        this.moveWithWalls(entityPos, dir, moveSpeed * delta);
        speedNow = moveSpeed;
        // A patrol point inside furniture can never be reached: skip it after being stuck for a few seconds
        const hunting = this.state === 'CHASE' || this.state === 'STALK';
        if (!hunting && before.distanceTo(entityPos) < moveSpeed * delta * 0.2) {
          this.stuck += delta;
          if (this.stuck > 2.5) {
            this.stuck = 0;
            this.currentPatrolIdx = (this.currentPatrolIdx + 1) % this.patrolPoints.length;
          }
        } else {
          this.stuck = 0;
        }
        this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, Math.atan2(dir.x, dir.z), delta * 5.0);
      }
    }

    this.animate(delta, speedNow);

    // Catch check: it must be hunting and stay in reach briefly, so the player can still slip away
    if (this.state === 'CHASE' && distToPlayer < 1.15) {
      this.grabTimer += delta;
      if (this.grabTimer > 0.6) return 'CAUGHT';
    } else {
      this.grabTimer = 0;
    }
    return null;
  }

  // Procedural animation. Dormant idles with a slow twitch; chase lunges, crawls and opens the jaw.
  animate(delta, speed) {
    if (this.rig) { this.animateRig(delta, speed); return; }
    const ud = this.mesh.userData;
    const t = this.animTime;
    const chase = this.state === 'CHASE';
    const stalk = this.state === 'STALK';
    const dormant = !this.isActive;
    const moving = speed > 0.01;

    if (moving) this.walkPhase += delta * speed * 3.2;

    // Posture: hunch when dormant, lean when stalking, drop low and lunge when chasing
    const leanTarget = chase ? 0.5 : stalk ? 0.22 : dormant ? 0.14 : 0.16;
    this.lean += (leanTarget - this.lean) * Math.min(1, delta * 4);
    this.crawl += ((chase ? 1 : 0) - this.crawl) * Math.min(1, delta * 4);

    ud.spine.rotation.x = this.lean + Math.sin(t * 1.3) * 0.02;
    ud.pelvis.position.y = 1.15 - this.crawl * 0.22;

    // Head twitch (weaker when dormant)
    const twitchAmt = dormant ? 0.4 : 1.0;
    const twitch = Math.sin(t * 14) * 0.15 * twitchAmt;
    ud.headPivot.rotation.z = (Math.sin(t * 8) * 0.2 * twitchAmt) + twitch;
    ud.headPivot.rotation.x = chase ? 0.15 : 0.0;

    // Jaw: opens when chasing, a little twitch when dormant
    ud.jawPivot.rotation.x = chase
      ? 0.35 + Math.sin(t * 14) * 0.12
      : (dormant ? 0.03 + Math.sin(t * 2) * 0.02 : (stalk ? 0.05 : 0.0));

    // Legs: stride when moving, wider stance when crawling
    const ph = this.walkPhase;
    const amp = (moving ? 0.55 : 0.04) + this.crawl * 0.25;
    const s = Math.sin(ph) * amp;
    const c = Math.cos(ph);
    ud.legLPivot.rotation.x = s;
    ud.legRPivot.rotation.x = -s;
    const kneeBase = moving ? -(0.2 + 0.5 * (0.5 + 0.5 * c)) : 0;
    ud.kneeLPivot.rotation.x = kneeBase - this.crawl * 0.5;
    ud.kneeRPivot.rotation.x = (moving ? -(0.2 + 0.5 * (0.5 - 0.5 * c)) : 0) - this.crawl * 0.5;

    // Arms: reach forward when chasing, swing otherwise
    const reach = chase ? 1.0 : stalk ? 0.35 : 0.05;
    const swing = (moving ? 0.5 : 0.04);
    ud.armLPivot.rotation.x = reach - s * swing / amp * 0.9;
    ud.armRPivot.rotation.x = reach + s * swing / amp * 0.9;
    ud.elbowLPivot.rotation.x = chase ? 0.7 : 0.2;
    ud.elbowRPivot.rotation.x = chase ? 0.7 : 0.2;

    // Gown strips flutter; faster when moving
    const flutter = moving ? 1.6 : 0.6;
    for (const strip of ud.gownStrips) {
      strip.rotation.x = Math.sin(t * flutter + strip.userData.phase) * 0.18 + (chase ? 0.25 : 0);
    }

    // Eye glows pulse; brighter and quicker when chasing
    const pulseBase = chase ? 0.26 : 0.2;
    const pulseRate = chase ? 14 : 4;
    for (const glow of ud.eyeGlows) {
      glow.scale.setScalar(pulseBase + Math.sin(t * pulseRate) * 0.03);
    }
    ud.eyeLight.intensity = chase ? 2.4 : 1.2;

    // Mist swirl
    if (ud.particles) ud.particles.rotation.y += delta * 1.5;
  }
}
