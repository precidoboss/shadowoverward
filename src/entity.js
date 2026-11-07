import * as THREE from 'three';
import { modelFactory } from './models.js';
import { soundEngine } from './audio.js';

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

    // Scratch vectors (no per-frame allocations)
    this._targetPos = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  activate() {
    this.isActive = true;
    this.mesh.visible = true;
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
    const playerSpotted = distToPlayer < hearingDist || canSee;

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
        entityPos.addScaledVector(dir, moveSpeed * delta);
        speedNow = moveSpeed;
        this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, Math.atan2(dir.x, dir.z), delta * 5.0);
      }
    }

    this.animate(delta, speedNow);

    // Catch check
    if (distToPlayer < 1.15) return 'CAUGHT';
    return null;
  }

  // Procedural animation. Dormant idles with a slow twitch; chase lunges, crawls and opens the jaw.
  animate(delta, speed) {
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
