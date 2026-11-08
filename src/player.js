import * as THREE from 'three';
import { mergeChildMeshes } from './mesh-utils.js';
import { loadRiggedCharacter, RigPlayer } from './character-anim.js';
import { soundEngine } from './audio.js';
import { textureGen } from './textures.js';

export class Player {
  constructor(camera, domElement, world, scene) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.scene = scene;

    // Camera view mode: 'FIRST_PERSON' or 'THIRD_PERSON'
    this.viewMode = 'FIRST_PERSON';

    // Camera rig: shake from shots and punches, and wall avoidance for the third-person view
    this.shake = 0;
    this.camRatio = 1;                       // how much of the full third-person distance is free
    this._camDesired = new THREE.Vector3();
    this._camPivot = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._camRay = new THREE.Ray();
    this._camHit = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._camUp = new THREE.Vector3();

    // Rigs
    this.pitchObject = new THREE.Object3D();
    this.yawObject = new THREE.Object3D();
    this.yawObject.position.set(0, 0, 19);
    this.yawObject.add(this.pitchObject);

    // Eye container
    this.eyeContainer = new THREE.Object3D();
    this.eyeContainer.position.set(0, 1.65, 0);
    this.pitchObject.add(this.eyeContainer);
    this.eyeContainer.add(this.camera);

    // Build Detailed 3D Character and First-Person Equipment
    this.createDetailedCharacter();
    this.createDetailedFpsEquipment();

    // Movement & Physics
    this.velocity = new THREE.Vector3();
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;
    this.isCrouching = false;
    this.canJump = true;
    this.isLocked = false;
    this.mouseSensitivity = 0.0022;

    // Stamina
    this.stamina = 100;
    this.maxStamina = 100;

    // Zoom
    this.isZoomed = false;
    this.normalFov = 72;
    this.zoomFov = 26;
    this.currentFov = 72;

    // Night Vision
    this.nightVision = false;

    // Head bobbing & animations
    this.bobTimer = 0;
    this.baseEyeHeight = 1.65;
    this.crouchEyeHeight = 1.05;
    this.currentEyeHeight = 1.65;
    this.footstepTimer = 0;
    this.animTime = 0;

    // Flashlight & Battery
    this.flashlightOn = true;
    this.battery = 100;
    this.health = 100;
    this.maxHealth = 100;
    this.lastHurt = -10;
    this.armed = false;
    this.batteryDrainRate = 0.6;
    this.entityProximityFlicker = false;

    this.setupFlashlight();

    // Interaction Raycasting
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.4;
    this.hoveredObject = null;
    // Reusable scratch objects (avoid per-frame allocations)
    this._input = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._probe = new THREE.Vector3();
    this._euler = new THREE.Euler();
    this._box = new THREE.Box3();
    this._center = new THREE.Vector2(0, 0);
    this._interactTimer = 0;
    this.crouchBlend = 0;
    this.moveBlend = 0;

    // Inventory
    this.inventory = {
      keys: new Set(),
      tapes: [],
      hasFuse: false,
      batteriesCount: 0,
      notesRead: []
    };

    this.bindEvents();
    this.updateViewPerspective();
    this.startCharacterAnimator();
  }

  // 1. ARTICULATED INVESTIGATOR: press reporter in a long coat.
  // Rig: characterGroup > charHips (pelvis, legs, coat tails) > charTorsoGroup (spine, arms, head).
  // The figure faces local -z, the direction of travel, so the back is what the third-person camera sees.
  createDetailedCharacter() {
    this.characterGroup = new THREE.Group();
    this.characterGroup.name = 'detailed_investigator';

    const coatMat = new THREE.MeshStandardMaterial({ color: 0x2a3429, roughness: 0.8, metalness: 0.05 });
    const coatBackMat = new THREE.MeshStandardMaterial({ color: 0x1d251f, roughness: 0.85, side: THREE.DoubleSide });
    const lapelMat = new THREE.MeshStandardMaterial({ color: 0x1f2820, roughness: 0.75 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0x5a1f1d, roughness: 0.9 });
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.3 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xc8a248, metalness: 0.85, roughness: 0.25 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.85 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.45, metalness: 0.1 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc69677, roughness: 0.55 });
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x6a3a33, roughness: 0.6 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1b1410, roughness: 0.95 });
    const satchelMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.9 });
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xdedbd0, roughness: 0.3 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2 });
    const badgeMat = new THREE.MeshStandardMaterial({ map: textureGen.getPressBadge(), roughness: 0.7 });
    const camMat = new THREE.MeshStandardMaterial({ color: 0x1c1e20, metalness: 0.6, roughness: 0.4 });
    const watchMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
    const watchFaceMat = new THREE.MeshBasicMaterial({ color: 0x22ee88 });
    const tallyMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });

    const shadowOn = m => { m.castShadow = true; return m; };
    const add = (parent, geo, mat, x, y, z, opts = {}) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      if (opts.rx !== undefined) mesh.rotation.x = opts.rx;
      if (opts.ry !== undefined) mesh.rotation.y = opts.ry;
      if (opts.rz !== undefined) mesh.rotation.z = opts.rz;
      if (opts.cast) mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // ---- Hips: root for legs and coat tails (crouch moves this group)
    this.charHips = new THREE.Group();
    this.charHips.position.set(0, 0.95, 0);
    this.characterGroup.add(this.charHips);

    add(this.charHips, new THREE.BoxGeometry(0.4, 0.2, 0.26), pantsMat, 0, 0.02, 0, { cast: true });

    // Open-ended flared coat tails, flattened front-to-back
    this.charTails = add(this.charHips, new THREE.CylinderGeometry(0.2, 0.31, 0.62, 14, 1, true), coatBackMat, 0, -0.26, 0, { cast: true });
    this.charTails.scale.set(1, 1, 0.66);

    // Satchel on the left hip, strap across the chest
    add(this.charHips, new THREE.BoxGeometry(0.12, 0.2, 0.26), satchelMat, -0.25, -0.02, 0.0, { cast: true });

    this.charLegL = this.buildInvestigatorLeg(-0.11, pantsMat, bootMat, shadowOn);
    this.charLegR = this.buildInvestigatorLeg(0.11, pantsMat, bootMat, shadowOn);

    // ---- Torso / spine pivot (origin at waist, about 1.02m)
    this.charTorsoGroup = new THREE.Group();
    this.charTorsoGroup.position.set(0, 0.07, 0);
    this.charHips.add(this.charTorsoGroup);

    add(this.charTorsoGroup, new THREE.BoxGeometry(0.44, 0.46, 0.27), coatMat, 0, 0.23, 0, { cast: true });   // chest
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.5, 0.09, 0.3), coatMat, 0, 0.42, 0);                   // shoulder yoke
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.46, 0.07, 0.29), beltMat, 0, 0.03, 0);                 // belt
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.1, 0.06, 0.02), brassMat, 0, 0.03, -0.15);             // buckle

    // Coat lapels (front, -z) and turned-up collar (back, +z)
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.11, 0.32, 0.03), lapelMat, -0.1, 0.27, -0.145, { rz: 0.18 });
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.11, 0.32, 0.03), lapelMat, 0.1, 0.27, -0.145, { rz: -0.18 });
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.36, 0.17, 0.06), coatMat, 0, 0.46, 0.14);

    // Scarf and its loose tail
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.22, 0.1, 0.07), scarfMat, 0, 0.47, -0.12);
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.07, 0.26, 0.02), scarfMat, 0.06, 0.28, -0.165, { rz: -0.1 });

    // Press credential on a lanyard
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.012, 0.22, 0.004), beltMat, 0, 0.3, -0.17);
    add(this.charTorsoGroup, new THREE.PlaneGeometry(0.07, 0.05), badgeMat, 0, 0.14, -0.178, { ry: Math.PI });

    // Radio pouch and antenna on the right hip
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.08, 0.14, 0.08), beltMat, 0.24, 0.0, 0.05);
    add(this.charTorsoGroup, new THREE.CylinderGeometry(0.006, 0.006, 0.15, 6), beltMat, 0.24, 0.13, 0.05);

    // Satchel strap across the chest
    add(this.charTorsoGroup, new THREE.BoxGeometry(0.05, 0.55, 0.02), satchelMat, -0.02, 0.22, -0.145, { rz: -0.55 });

    // ---- Head
    this.charHead = new THREE.Group();
    this.charHead.position.set(0, 0.6, 0);
    this.charTorsoGroup.add(this.charHead);

    add(this.charHead, new THREE.CylinderGeometry(0.05, 0.058, 0.13, 10), skinMat, 0, -0.07, 0);     // neck
    const skull = add(this.charHead, new THREE.SphereGeometry(0.135, 18, 14), skinMat, 0, 0.02, 0);
    skull.scale.set(0.9, 1.08, 0.98);
    add(this.charHead, new THREE.BoxGeometry(0.025, 0.065, 0.04), skinMat, -0.13, 0.0, 0);            // ears
    add(this.charHead, new THREE.BoxGeometry(0.025, 0.065, 0.04), skinMat, 0.13, 0.0, 0);
    add(this.charHead, new THREE.BoxGeometry(0.02, 0.04, 0.02), skinMat, 0, -0.01, -0.14);            // nose
    add(this.charHead, new THREE.BoxGeometry(0.05, 0.01, 0.012), lipMat, 0, -0.05, -0.128);           // mouth

    [-0.05, 0.05].forEach(x => {
      add(this.charHead, new THREE.SphereGeometry(0.019, 10, 8), eyeWhite, x, 0.025, -0.122);
      add(this.charHead, new THREE.SphereGeometry(0.009, 8, 6), pupilMat, x, 0.025, -0.136);
      add(this.charHead, new THREE.BoxGeometry(0.055, 0.012, 0.02), hairMat, x, 0.068, -0.122);       // brows
    });

    // Hair: a cap covering the crown and back, plus a fringe over the forehead
    const hair = add(this.charHead, new THREE.SphereGeometry(0.146, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat, 0, 0.03, 0.012);
    hair.scale.set(0.95, 1.02, 1.04);
    add(this.charHead, new THREE.BoxGeometry(0.2, 0.04, 0.05), hairMat, 0, 0.1, -0.1);

    // Press fedora: felt crown, dark band and brim. Sits on the head, so it hides with the head in first person.
    const feltMat = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.9 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.6 });
    add(this.charHead, new THREE.CylinderGeometry(0.205, 0.205, 0.012, 20), feltMat, 0, 0.165, 0);  // brim
    add(this.charHead, new THREE.CylinderGeometry(0.13, 0.14, 0.11, 18), feltMat, 0, 0.23, 0);      // crown
    add(this.charHead, new THREE.CylinderGeometry(0.14, 0.14, 0.025, 18), bandMat, 0, 0.19, 0);     // band

    // ---- Arms: shoulder pivot > elbow pivot > hand
    this.charArmL = this.buildInvestigatorArm(-0.3, coatMat, skinMat, shadowOn);
    this.charArmR = this.buildInvestigatorArm(0.3, coatMat, skinMat, shadowOn);

    // Left wrist watch (luminous face)
    const watchGroup = new THREE.Group();
    watchGroup.position.set(0, -0.3, 0);
    this.charElbowL.add(watchGroup);
    add(watchGroup, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), watchMat, 0, 0, 0);
    add(watchGroup, new THREE.CircleGeometry(0.03, 12), watchFaceMat, 0, -0.016, 0.0, { rx: -Math.PI / 2 });

    // Right hand holds the camcorder at chest height, pointing forward
    const camGroup = new THREE.Group();
    camGroup.position.set(0, -0.36, -0.1);
    this.charElbowR.add(camGroup);
    add(camGroup, new THREE.BoxGeometry(0.12, 0.12, 0.22), camMat, 0, 0, 0);
    add(camGroup, new THREE.CylinderGeometry(0.04, 0.04, 0.06, 16), camMat, 0, 0.01, -0.13, { rx: Math.PI / 2 });
    add(camGroup, new THREE.SphereGeometry(0.008, 8, 8), tallyMat, -0.04, 0.04, -0.12);

    // Head and torso move as whole groups, so their static parts can share draw calls
    mergeChildMeshes(this.charHead);
    mergeChildMeshes(this.charTorsoGroup);

    this.characterGroup.traverse(o => { if (o.isMesh && o.castShadow) o.receiveShadow = true; });
    this.yawObject.add(this.characterGroup);

    // Animation state
    this.crouchBlend = 0;
    this.moveBlend = 0;
  }


  buildInvestigatorLeg(x, pantsMat, bootMat, shadowOn) {
    const hip = new THREE.Group();
    hip.position.set(x, -0.08, 0);
    this.charHips.add(hip);

    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.16), pantsMat);
    thigh.position.y = -0.21;
    hip.add(shadowOn(thigh));

    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    hip.userData.knee = knee;

    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.14), pantsMat);
    shin.position.y = -0.2;
    knee.add(shin);
    shin.castShadow = true;

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.27), bootMat);
    boot.position.set(0, -0.4, 0.04);
    knee.add(boot);
    return hip;
  }

  buildInvestigatorArm(x, coatMat, skinMat, shadowOn) {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 0.42, 0);
    this.charTorsoGroup.add(shoulder);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.36, 0.15), coatMat);
    upper.position.y = -0.18;
    shoulder.add(shadowOn(upper));

    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    shoulder.add(elbow);

    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), coatMat);
    fore.position.y = -0.15;
    elbow.add(fore);

    const wrist = new THREE.Group();
    wrist.position.y = -0.3;
    elbow.add(wrist);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.07), skinMat);
    palm.position.y = -0.05;
    wrist.add(palm);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.06, 0.05), skinMat);
    fingers.position.set(0, -0.12, -0.01);
    wrist.add(fingers);

    if (x < 0) this.charElbowL = elbow; else this.charElbowR = elbow;
    return shoulder;
  }

  // Procedural pose + gait. Driven by bobTimer (stride phase) and movement state.
  hasAnimatedCharacter() {
    return !!this.rig;
  }

  // Loads the rigged investigator. Until it is ready, the procedural figure stays on screen.
  // characterStatus is 'loading' | 'rigged' | 'fallback' and is shown in the in-game guide.
  startCharacterAnimator() {
    this.characterStatus = 'loading';
    this.rigLoaded = loadRiggedCharacter({
      mesh: 'animations/main-idle.fbx',
      clips: {
        idle: 'animations/clips/idle.json',
        walk: 'animations/clips/walk.json',
        run: 'animations/clips/run.json',
        crouchDown: 'animations/clips/crouchDown.json',
        crouchIdle: 'animations/clips/crouchIdle.json',
        crouchWalk: 'animations/clips/crouchWalk.json',
        standUp: 'animations/clips/standUp.json',
        punch: 'animations/clips/punch.json',
        rifleAim: 'animations/clips/rifleAim.json',
        rifleFire: 'animations/clips/rifleFire.json'
      },
      height: 1.75,
      // Mixamo models face +z; the game's forward is -z, so turn the body to face away from the camera
      rotationY: Math.PI
    }).then(({ root, clips, speeds }) => {
      this.rig = new RigPlayer(root, clips, speeds);
      this.rig.play('idle');
      this.characterStatus = 'rigged';
      this.characterGroup.visible = false;
      this.yawObject.add(root);
      this.updateViewPerspective();
    }).catch(err => {
      this.characterStatus = 'fallback';
      console.warn('Investigator model unavailable, showing the basic figure:', err);
    });
    return this.rigLoaded;
  }

  // Chooses the clip for the investigator's current state. Crouching plays a one-shot dip and rise between stances.
  updateRigPose(isMoving) {
    const crouch = this.isCrouching;
    // A punch or a shot plays to its end before the locomotion pose takes over again
    if (this.rig.current === 'punch' || this.rig.current === 'rifleFire') {
      this.wasCrouching = crouch;
      return;
    }
    // Playback rate matches the clip's real travel speed to the player's speed, so the feet do not slide
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const rate = key => (this.rig.speeds[key] ? THREE.MathUtils.clamp(speed / this.rig.speeds[key], 0.3, 3) : 1);
    const idle = this.armed ? 'rifleAim' : 'idle';
    if (crouch && !this.wasCrouching) {
      this.rig.play('crouchDown', { once: true, then: 'crouchIdle', fade: 0.2 });
    } else if (!crouch && this.wasCrouching) {
      this.rig.play('standUp', { once: true, then: 'idle', fade: 0.2 });
    } else if (this.rig.current !== 'crouchDown' && this.rig.current !== 'standUp') {
      if (crouch) this.rig.play(isMoving ? 'crouchWalk' : 'crouchIdle', { timeScale: isMoving ? rate('crouchWalk') : 1 });
      else if (!isMoving) this.rig.play(idle);
      else if (this.isSprinting) this.rig.play('run', { timeScale: rate('run') });
      else this.rig.play('walk', { timeScale: rate('walk') });
    }
    this.wasCrouching = crouch;
  }

  playPunch() {
    if (this.rig) this.rig.play('punch', { once: true, then: 'idle', fade: 0.08 });
  }

  playFire() {
    if (this.rig) this.rig.play('rifleFire', { once: true, then: 'rifleAim', fade: 0.06 });
  }

  // Returns true when this hit leaves the investigator with no health
  takeDamage(amount, time) {
    this.health = Math.max(0, this.health - amount);
    this.lastHurt = time;
    return this.health <= 0;
  }

  animateCharacter(delta, isMoving) {
    if (this.rig) {
      this.updateRigPose(isMoving);
      this.rig.update(delta);
      return;
    }
    const target = isMoving ? 1 : 0;
    this.moveBlend = THREE.MathUtils.lerp(this.moveBlend, target, delta * 10);
    this.crouchBlend = THREE.MathUtils.lerp(this.crouchBlend, this.isCrouching ? 1 : 0, delta * 8);

    const mb = this.moveBlend;
    const cb = this.crouchBlend;
    const phase = this.bobTimer;
    const sw = Math.sin(phase);
    const cw = Math.cos(phase);
    const stride = (this.isSprinting ? 0.8 : 0.58) * mb;
    const sprintLean = this.isSprinting && isMoving ? -0.14 : 0;

    // Hips: drop when crouching, small bob and side sway while walking
    this.charHips.position.y = 0.95 - cb * 0.36 - (1 - Math.cos(phase * 2)) * 0.008 * mb;
    this.charHips.rotation.z = sw * 0.03 * mb;
    this.charHips.rotation.x = cb * -0.12;

    // Legs: thighs swing, knees bend on the lift; crouch folds both
    this.charLegL.rotation.x = sw * stride + cb * 1.2;
    this.charLegR.rotation.x = -sw * stride + cb * 1.2;
    const kneeL = -(0.12 + 0.4 * (0.5 + 0.5 * cw)) * mb - cb * 1.3;
    const kneeR = -(0.12 + 0.4 * (0.5 - 0.5 * cw)) * mb - cb * 1.3;
    this.charLegL.userData.knee.rotation.x = kneeL;
    this.charLegR.userData.knee.rotation.x = kneeR;

    // Coat tails trail a little with motion
    this.charTails.rotation.x = -sw * 0.06 * mb + cb * 0.3;

    // Torso: lean into sprints, lean forward when crouched, breathe at rest
    const breath = Math.sin(this.animTime * 2.2) * 0.006 * (1 - mb);
    this.charTorsoGroup.position.y = 0.07 + breath;
    this.charTorsoGroup.rotation.x = THREE.MathUtils.lerp(this.charTorsoGroup.rotation.x, sprintLean - cb * 0.3, delta * 8);
    this.charTorsoGroup.rotation.y = -sw * 0.05 * mb;

    // Head keeps its gaze level, with a faint sway
    this.charHead.rotation.x = -this.charTorsoGroup.rotation.x * 0.7;
    this.charHead.rotation.y = sw * 0.04 * mb;
    this.charHead.position.y = 0.6 + breath * 0.5;

    // Left arm swings opposite the left leg; right arm holds the camcorder steady
    this.charArmL.rotation.x = -sw * 0.5 * mb - 0.05;
    this.charElbowL.rotation.x = -0.25 - Math.max(0, sw) * 0.12 * mb;
    this.charArmR.rotation.x = 0.95 + sw * 0.04 * mb;
    this.charElbowR.rotation.x = 0.6 + breath * 2;
  }

  // Keep the old per-frame method name for compatibility
  updateCharacterPose(delta, isMoving) {
    this.animateCharacter(delta, isMoving);
  }

  // 2. UPGRADED FIRST-PERSON EQUIPMENT & HANDS
  createDetailedFpsEquipment() {
    this.fpsEquip = new THREE.Group();
    this.fpsEquip.position.set(0.24, -0.22, -0.42);

    // Camcorder body
    const camMat = new THREE.MeshStandardMaterial({ color: 0x1c1e20, metalness: 0.7, roughness: 0.35 });
    const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.24), camMat);
    this.fpsEquip.add(camBody);

    // Telescopic optical zoom lens
    const lensGeo = new THREE.CylinderGeometry(0.044, 0.048, 0.08, 24);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x0a0c0e, metalness: 0.9, roughness: 0.15 });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.01, -0.15);
    this.fpsEquip.add(lens);

    // Flashlight mounted on camera top
    const torchGeo = new THREE.CylinderGeometry(0.024, 0.026, 0.09, 16);
    const torchMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.8, roughness: 0.2 });
    const torch = new THREE.Mesh(torchGeo, torchMat);
    torch.rotation.x = Math.PI / 2;
    torch.position.set(0.045, 0.075, -0.11);
    this.fpsEquip.add(torch);

    // Front tally light (Red blinking REC indicator)
    const tally = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff1111 }));
    tally.position.set(-0.045, 0.04, -0.125);
    this.fpsEquip.add(tally);

    // Flip-out LCD monitor
    const lcdArm = new THREE.Group();
    lcdArm.position.set(-0.07, 0.01, 0.02);
    lcdArm.rotation.y = -Math.PI / 3;

    const lcdPanel = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.11, 0.15), camMat);
    lcdArm.add(lcdPanel);

    // LCD preview screen
    const screenGeo = new THREE.PlaneGeometry(0.13, 0.09);
    this.fpsScreenMat = new THREE.MeshBasicMaterial({ color: 0x114433 });
    const screenMesh = new THREE.Mesh(screenGeo, this.fpsScreenMat);
    screenMesh.rotation.y = -Math.PI / 2;
    screenMesh.position.set(-0.006, 0, 0);
    lcdArm.add(screenMesh);
    this.fpsEquip.add(lcdArm);

    // Hands and sleeves
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x223028, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc69677, roughness: 0.5 });

    // Right forearm
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.38, 12), sleeveMat);
    armR.rotation.x = Math.PI / 2.7;
    armR.position.set(0.02, -0.16, 0.16);
    this.fpsEquip.add(armR);

    // Hand gripping right side
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.14), skinMat);
    handR.position.set(0.08, -0.01, 0.02);
    this.fpsEquip.add(handR);

    // Left arm & hand supporting underneath
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.36, 12), sleeveMat);
    armL.rotation.x = Math.PI / 2.9;
    armL.rotation.z = -0.3;
    armL.position.set(-0.18, -0.22, 0.14);
    this.fpsEquip.add(armL);

    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.12), skinMat);
    handL.position.set(-0.04, -0.07, 0.01);
    this.fpsEquip.add(handL);

    this.camera.add(this.fpsEquip);
  }

  setupFlashlight() {
    this.flashlight = new THREE.SpotLight(0xfff5e4, 5.5, 34, Math.PI / 4.2, 0.35, 1.2);
    this.flashlight.position.set(0.24, -0.15, -0.3);
    this.camera.add(this.flashlight);

    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0.24, -0.15, -12);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    this.playerAura = new THREE.PointLight(0xddeeff, 1.8, 9.5);
    this.playerAura.position.set(0, 0, 0.2);
    this.camera.add(this.playerAura);
  }

  toggleNightVision() {
    this.nightVision = !this.nightVision;
    soundEngine.playNightVisionToggle(this.nightVision);
    if (this.fpsScreenMat) {
      this.fpsScreenMat.color.setHex(this.nightVision ? 0x22ff66 : 0x114433);
    }
    return this.nightVision;
  }

  addShake(amount) {
    this.shake = Math.min(0.12, this.shake + amount);
  }

  // Third-person camera: pulled in so it never ends up inside or behind a wall, floor or ceiling.
  // Several rays are cast so a wall beside the camera also counts, not just the one straight behind.
  updateCameraRig(delta) {
    const shaking = this.shake > 0.001;
    const sx = shaking ? (Math.random() - 0.5) * this.shake : 0;
    const sy = shaking ? (Math.random() - 0.5) * this.shake : 0;
    this.shake *= Math.exp(-delta * 14);

    if (this.viewMode !== 'THIRD_PERSON') {
      this.camera.position.set(sx, sy, 0);
      this.camRatio = 1;
      return;
    }

    const desiredLocal = this._camDesired.set(0.65, 0.25, 2.3);
    this.eyeContainer.updateWorldMatrix(true, false);
    const m = this.eyeContainer.matrixWorld;
    const pivot = this._camPivot.setFromMatrixPosition(m);
    const target = this._camTarget.copy(desiredLocal).applyMatrix4(m);
    const full = target.clone().sub(pivot);
    const fullLen = full.length();
    this._camRight.set(m.elements[0], m.elements[1], m.elements[2]).normalize();
    this._camUp.set(m.elements[4], m.elements[5], m.elements[6]).normalize();

    const margin = 0.35;
    let ratio = 1;
    const cols = this.world ? this.world.colliders : [];
    const offsets = [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]];
    for (const [ox, oy] of offsets) {
      const end = this._camHit.copy(target)
        .addScaledVector(this._camRight, ox).addScaledVector(this._camUp, oy);
      const dir = end.sub(pivot);
      const len = dir.length();
      dir.multiplyScalar(1 / len);
      this._camRay.set(pivot, dir);
      let best = Infinity;
      for (let i = 0; i < cols.length; i++) {
        const hit = this._camRay.intersectBox(cols[i], this._camHit);
        if (hit) best = Math.min(best, pivot.distanceTo(hit));
      }
      if (best < len + margin) ratio = Math.min(ratio, Math.max(0, (best - margin) / len));
    }

    // Floor and ceiling
    const ceil = (this.world && this.world.ceilingHeight) || 3.0;
    if (target.y < 0.25 && pivot.y > 0.25) ratio = Math.min(ratio, (pivot.y - 0.25) / (pivot.y - target.y));
    if (target.y > ceil - 0.2 && pivot.y < ceil - 0.2) ratio = Math.min(ratio, (ceil - 0.2 - pivot.y) / (target.y - pivot.y));
    ratio = Math.max(0, Math.min(1, ratio));

    // Snap inward at once (never clip), ease back out
    if (ratio < this.camRatio) this.camRatio = ratio;
    else this.camRatio += (ratio - this.camRatio) * Math.min(1, delta * 5);

    this.camera.position.copy(desiredLocal).multiplyScalar(this.camRatio);
    this.camera.position.x += sx;
    this.camera.position.y += sy;

    // Very close to a wall the camera sits inside the character: hide it rather than show the inside of the model
    if (this.rig) this.rig.root.visible = fullLen * this.camRatio > 0.7;
    this.charHead.visible = fullLen * this.camRatio > 0.7;
  }

  toggleViewPerspective() {
    this.viewMode = this.viewMode === 'FIRST_PERSON' ? 'THIRD_PERSON' : 'FIRST_PERSON';
    this.updateViewPerspective();
    return this.viewMode;
  }

  updateViewPerspective() {
    if (this.viewMode === 'FIRST_PERSON') {
      this.camera.position.set(0, 0, 0);
      this.fpsEquip.visible = true;
      this.charHead.visible = false;
      this.characterGroup.visible = !this.hasAnimatedCharacter();
    } else {
      this.camera.position.set(0.65, 0.25, 2.3);
      this.fpsEquip.visible = false;
      this.charHead.visible = true;
      this.characterGroup.visible = !this.hasAnimatedCharacter();
    }
    if (this.rig) this.rig.root.visible = this.viewMode === 'THIRD_PERSON';
  }

  bindEvents() {
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      const sens = this.isZoomed ? this.mouseSensitivity * 0.45 : this.mouseSensitivity;
      this.yawObject.rotation.y -= movementX * sens;
      this.pitchObject.rotation.x -= movementY * sens;
      this.pitchObject.rotation.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitchObject.rotation.x));
    });

    // Right Click for Optical Zoom
    window.addEventListener('mousedown', (e) => {
      if (this.isLocked && e.button === 2) {
        this.isZoomed = true;
        soundEngine.playZoomSound();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.isZoomed = false;
      }
    });

    // Prevent right-click context menu in game
    window.addEventListener('contextmenu', (e) => {
      if (this.isLocked) e.preventDefault();
    });

    // Keyboard inputs
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          if (this.stamina > 10) this.isSprinting = true;
          break;
        case 'KeyC':
        case 'ControlLeft':
          this.isCrouching = !this.isCrouching;
          break;
        case 'Space':
          if (this.canJump && !this.isCrouching) {
            this.velocity.y = 4.2;
            this.canJump = false;
          }
          break;
        case 'KeyF':
          this.toggleFlashlight();
          break;
        case 'KeyV':
          this.toggleViewPerspective();
          break;
        case 'KeyN':
          this.toggleNightVision();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.isSprinting = false;
          break;
      }
    });
  }

  toggleFlashlight() {
    if (this.battery <= 0 && !this.flashlightOn) {
      soundEngine.playFlashlightClick(false);
      return;
    }
    this.flashlightOn = !this.flashlightOn;
    soundEngine.playFlashlightClick(this.flashlightOn);
    this.updateFlashlightState();
  }

  updateFlashlightState() {
    const active = this.flashlightOn && this.battery > 0;
    // Switch by intensity, not visibility: hiding a light changes the light count and makes
    // three.js recompile every material, which freezes the game for a second or more.
    this.flashlight.visible = true;
    this.flashlight.intensity = active ? 5.5 : 0;
    this.playerAura.intensity = active ? 1.8 : 0.65;
  }

  consumeBattery(amount) {
    this.battery = Math.max(0, this.battery - amount);
    if (this.battery <= 0) {
      this.flashlightOn = false;
      this.updateFlashlightState();
      soundEngine.playFlashlightClick(false);
    }
  }

  rechargeBattery(amount = 45) {
    this.battery = Math.min(100, this.battery + amount);
    if (this.flashlightOn) {
      this.updateFlashlightState();
    }
  }

  // Reuses one Box3 instead of allocating per call (this runs several times per frame)
  checkCollision(nextPos) {
    const r = 0.38;
    const b = this._box;
    b.min.set(nextPos.x - r, nextPos.y, nextPos.z - r);
    b.max.set(nextPos.x + r, nextPos.y + 1.8, nextPos.z + r);
    const cols = this.world.colliders;
    for (let i = 0; i < cols.length; i++) {
      if (b.intersectsBox(cols[i])) return true;
    }
    return false;
  }

  update(delta, time) {
    if (!this.isLocked) {
      // Still animate the figure in menus so it does not freeze mid-pose
      this.animateCharacter(delta, false);
      return;
    }

    this.animTime += delta;

    // Health comes back slowly once the investigator has been out of harm's way for a few seconds
    if (this.health < this.maxHealth && time - this.lastHurt > 5) {
      this.health = Math.min(this.maxHealth, this.health + 5 * delta);
    }

    // Smooth optical zoom FOV
    const targetFov = this.isZoomed ? this.zoomFov : this.normalFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 12);
      this.camera.updateProjectionMatrix();
    }

    // Battery drain
    if (this.flashlightOn && this.battery > 0) {
      this.consumeBattery(this.batteryDrainRate * delta);
    }

    // Flashlight flicker
    if (this.flashlightOn && this.battery > 0) {
      if (this.entityProximityFlicker || this.battery < 20) {
        if (Math.random() < (this.entityProximityFlicker ? 0.3 : 0.12)) {
          this.flashlight.intensity = Math.random() < 0.5 ? 0.8 : 5.0;
        } else {
          this.flashlight.intensity = 5.5;
        }
      } else {
        this.flashlight.intensity = 5.5;
      }
    }

    // Eye height
    const targetHeight = this.isCrouching ? this.crouchEyeHeight : this.baseEyeHeight;
    this.currentEyeHeight = THREE.MathUtils.lerp(this.currentEyeHeight, targetHeight, delta * 8);
    this.eyeContainer.position.y = this.currentEyeHeight;

    // Stamina
    if (this.isSprinting && (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight)) {
      this.stamina = Math.max(0, this.stamina - 20 * delta);
      if (this.stamina <= 0) this.isSprinting = false;
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + 14 * delta);
    }

    const speed = this.isCrouching ? 2.0 : (this.isSprinting ? 5.2 : 3.4);
    const input = this._input.set(0, 0, 0);
    if (this.moveForward) input.z -= 1;
    if (this.moveBackward) input.z += 1;
    if (this.moveLeft) input.x -= 1;
    if (this.moveRight) input.x += 1;

    const isMoving = input.lengthSq() > 0;

    if (isMoving) {
      input.normalize();
      this._euler.set(0, this.yawObject.rotation.y, 0);
      input.applyEuler(this._euler);

      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, input.x * speed, delta * 10);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, input.z * speed, delta * 10);

      const moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      this.bobTimer += delta * moveSpeed * (this.isSprinting ? 2.2 : 1.7);
      this.footstepTimer += delta * moveSpeed;

      const stepInterval = this.isSprinting ? 1.8 : 2.2;
      if (this.footstepTimer > stepInterval) {
        this.footstepTimer = 0;
        const surface = (this.yawObject.position.x > 3 && this.yawObject.position.z > 0) ? 'wood' : 'concrete';
        soundEngine.playFootstep(surface, this.isSprinting);
      }
    } else {
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, 0, delta * 12);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, 0, delta * 12);
    }

    this.animateCharacter(delta, isMoving);

    // Gravity and jump landing
    this.velocity.y -= 14.0 * delta;
    this.yawObject.position.y += this.velocity.y * delta;
    if (this.yawObject.position.y <= 0) {
      this.yawObject.position.y = 0;
      this.velocity.y = 0;
      this.canJump = true;
    }

    // Axis-separated movement with collision. Both tests start from the same origin.
    const origin = this._origin.copy(this.yawObject.position);
    const probe = this._probe;

    probe.copy(origin);
    probe.x += this.velocity.x * delta;
    if (!this.checkCollision(probe)) {
      this.yawObject.position.x = probe.x;
    } else {
      this.velocity.x = 0;
    }

    probe.copy(origin);
    probe.z += this.velocity.z * delta;
    if (!this.checkCollision(probe)) {
      this.yawObject.position.z = probe.z;
    } else {
      this.velocity.z = 0;
    }

    // Head bobbing & camcorder stabilisation
    if (isMoving && this.canJump) {
      const bobAmount = this.isSprinting ? 0.04 : 0.022;
      const bobH = Math.cos(this.bobTimer * 0.5) * bobAmount * 0.6;
      const bobV = Math.sin(this.bobTimer) * bobAmount;
      this.eyeContainer.position.x = bobH;
      this.eyeContainer.position.y = this.currentEyeHeight + bobV;

      this.fpsEquip.position.x = 0.24 + bobH * 0.7;
      this.fpsEquip.position.y = -0.22 + bobV * 0.5;
      this.fpsEquip.rotation.z = Math.sin(this.bobTimer * 0.5) * 0.04;
    } else {
      this.eyeContainer.position.x = THREE.MathUtils.lerp(this.eyeContainer.position.x, 0, delta * 5);
      this.eyeContainer.position.y = THREE.MathUtils.lerp(this.eyeContainer.position.y, this.currentEyeHeight, delta * 5);
      this.fpsEquip.position.set(0.24, -0.22, -0.42);
      this.fpsEquip.rotation.set(0, 0, 0);
    }

    this.updateCameraRig(delta);
    this.updateInteraction(delta);
  }

  // Throttled to ~12 Hz: the scene has dozens of interactables, and a per-frame recursive
  // raycast was one of the larger per-frame CPU costs. Hidden or disabled items are skipped
  // so they cannot block a visible item behind them.
  updateInteraction(delta = 0) {
    this._interactTimer += delta;
    if (this._interactTimer < 0.08) return;
    this._interactTimer = 0;

    this.raycaster.setFromCamera(this._center, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.interactables, true);

    this.hoveredObject = null;
    for (let i = 0; i < hits.length; i++) {
      let obj = hits[i].object;
      while (obj && !obj.userData?.isInteractable && obj.parent) {
        obj = obj.parent;
      }
      if (obj && obj.userData?.isInteractable && obj.visible) {
        this.hoveredObject = obj;
        break;
      }
    }
  }

  interact() {
    return this.hoveredObject;
  }
}
