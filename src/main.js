import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { EntityAI } from './entity.js';
import { VhsShaderEffect } from './vhs-effects.js';
import { StoryManager } from './story.js';
import { UIManager } from './ui.js';
import { soundEngine } from './audio.js';

export class LostFootageGame {
  constructor() {
    this.container = document.getElementById('game-container');
    this.state = 'MENU'; // 'MENU', 'PLAYING', 'PAUSED', 'KEYPAD', 'DOCUMENT', 'INVENTORY', 'PLAYING_TAPE', 'GAMEOVER', 'VICTORY'
    this.gameTime = 0;
    this.clock = new THREE.Clock();

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c131a);
    // Linear fog: clear up to 14 meters, subtle depth beyond 45m
    this.scene.fog = new THREE.Fog(0x0c131a, 14, 48);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 80);

    // Renderer - optimized for solid 60fps performance without lag
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Shadows are refreshed on a cadence (see refreshShadows) rather than every frame
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.container.appendChild(this.renderer.domElement);

    // Adaptive resolution: drops the render scale if frames run slow, recovers when they don't
    this.perf = { acc: 0, n: 0, maxRatio: this.renderer.getPixelRatio() };
    this.frameCount = 0;
    this.hudTimer = 0;
    this._prompt = null;
    this.briefingTimers = [];
    this.lastProximityWarning = -Infinity;

    // VHS Overlay Shader
    this.vhsEffect = new VhsShaderEffect(this.container);

    // Initialize Game Systems
    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.renderer.domElement, this.world, this.scene);
    this.scene.add(this.player.yawObject);

    this.entity = new EntityAI(this.scene, this.player);
    this.entity.world = this.world;
    this.entity.loadRig();

    this.ui = new UIManager(this);
    this.story = new StoryManager(this.ui);

    // Window Resize Handling
    window.addEventListener('resize', () => this.onWindowResize());

    // Menu Camera Orbit Angle
    this.menuAngle = 0;

    // Start Game Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    this.ui.showMainMenu();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  requestPointerLock() {
    this.renderer.domElement.requestPointerLock();
  }

  startGame() {
    this.state = 'PLAYING';
    soundEngine.init();
    soundEngine.ensureContext();
    // Compile shaders up front so the first use of a material doesn't stall play
    this.renderer.compile(this.scene, this.camera);
    this.ui.hideMainMenu();
    this.requestPointerLock();
    this.ui.updateObjective(this.story.getCurrentObjective());
    this.ui.showBannerNotification("REC START: OCT 31 1997\nSHADOW OVER WARD B\n[Press V to Toggle 1st / 3rd Person]");
  }

  pauseGame() {
    this.state = 'PAUSED';
    document.exitPointerLock();
    this.ui.showPauseMenu();
  }

  resumeGame() {
    this.state = 'PLAYING';
    soundEngine.ensureContext();
    this.ui.hidePauseMenu();
    this.requestPointerLock();
  }

  restartGame() {
    // Player
    this.player.yawObject.position.set(0, 0, 19);
    this.player.yawObject.rotation.set(0, 0, 0);
    this.player.pitchObject.rotation.set(0, 0, 0);
    this.player.battery = 100;
    this.player.stamina = 100;
    this.player.flashlightOn = true;
    this.player.updateFlashlightState();
    this.player.inventory.keys.clear();
    this.player.inventory.tapes = [];
    this.player.inventory.hasFuse = false;
    this.player.inventory.batteriesCount = 0;
    this.player.inventory.notesRead = [];

    // World pickups, doors, safe, generator; and the entity back to dormant
    this.world.reset();
    this.entity.reset();

    // Story progress
    this.story.currentObjectiveIndex = 0;
    this.story.tapeFound = { 1: false, 2: false, 3: false, 4: false };
    this.story.generatorPowered = false;
    this.story.safeUnlocked = false;

    this.clearBriefing();
    this.lastProximityWarning = -Infinity;
    this.gameTime = 0;
    this.startGame();
  }

  // Handle Player Interaction ([E] Key)
  handlePlayerInteraction() {
    const target = this.player.interact();
    if (!target) return;

    const data = target.userData;

    // 1. VHS Tapes
    if (data.type === 'vhs_tape') {
      this.story.collectTape(data.tapeId);
      this.player.inventory.tapes.push({ id: data.tapeId, title: data.title, date: data.date });
      target.visible = false;
      target.userData.isInteractable = false;

      // Awaken the Entity after recovering Tape 01!
      if (data.tapeId === 1 && !this.entity.isActive) {
        this.entity.activate();
        soundEngine.playJumpStinger();
        this.ui.showBannerNotification("WARNING: SOMETHING IS MOVING IN THE HALLS");
        this.showStealthBriefing();
      }
    }

    // 2. Door Interaction
    else if (data.type === 'door') {
      if (data.reqKey) {
        if (data.reqKey === 'all_tapes_and_power') {
          // Fire Exit Door in Basement
          if (!this.story.allTapesCollected()) {
            soundEngine.playLockedDoor();
            this.ui.showBannerNotification("FIRE EXIT SEALED:\nRECOVER ALL 4 LOST VHS TAPES FIRST!");
            return;
          }
          if (!this.story.generatorPowered) {
            soundEngine.playLockedDoor();
            this.ui.showBannerNotification("FIRE EXIT SEALED:\nRESTORE POWER AT GENERATOR BREAKER!");
            return;
          }
          // Player escapes!
          this.triggerVictory();
          return;
        } else if (!this.player.inventory.keys.has(data.reqKey)) {
          soundEngine.playLockedDoor();
          const keyLabel = data.reqKey.replace(/_/g, ' ').toUpperCase();
          this.ui.showBannerNotification(`LOCKED: REQUIRES [ ${keyLabel} ]`);
          return;
        }
      }

      // Toggle Door Open/Close
      data.isOpen = !data.isOpen;
      data.targetAngle = data.isOpen ? -Math.PI / 2 : 0;
      soundEngine.playDoorCreak(data.isOpen);
    }

    // 3. Key Items
    else if (data.type === 'key') {
      this.player.inventory.keys.add(data.keyId);
      soundEngine.playItemPickup();
      this.ui.showBannerNotification(`OBTAINED: [ ${data.keyName} ]`);
      target.visible = false;
      target.userData.isInteractable = false;

      if (data.keyId === 'ward_a_key') {
        this.story.advanceObjective(1);
      } else if (data.keyId === 'ward_b_keycard') {
        this.story.advanceObjective(3);
      }
    }

    // 4. Batteries
    else if (data.type === 'battery') {
      this.player.rechargeBattery(data.powerRestore);
      soundEngine.playItemPickup();
      this.ui.showBannerNotification("BATTERY RECHARGED (+45%)");
      target.visible = false;
      target.userData.isInteractable = false;
    }

    // 5. High-Voltage Fuse
    else if (data.type === 'fuse') {
      this.player.inventory.hasFuse = true;
      soundEngine.playItemPickup();
      this.ui.showBannerNotification("ACQUIRED: HIGH-VOLTAGE FUSE\n[Use at Basement Generator]");
      target.visible = false;
      target.userData.isInteractable = false;
      this.story.advanceObjective(5);
    }

    // 6. Documents & Case Notes
    else if (data.type === 'note') {
      this.ui.openDocumentModal(data.title, data.contentSnippet, data.safeDigitHint);
    }

    // 7. Wall Safe
    else if (data.type === 'wall_safe') {
      if (!data.isOpen) {
        this.ui.openSafeKeypad();
      }
    }

    // 8. Generator Breaker Box
    else if (data.type === 'generator') {
      if (!this.player.inventory.hasFuse) {
        soundEngine.playLockedDoor();
        this.ui.showBannerNotification("GENERATOR OFFLINE:\nREQUIRES HIGH-VOLTAGE FUSE FROM WARD B");
      } else if (!this.story.generatorPowered) {
        this.story.generatorPowered = true;
        soundEngine.playKeypadBeep(true);
        data.led.material.color.setHex(0x00ff00);
        this.ui.showBannerNotification("POWER RESTORED TO BASEMENT!\nEMERGENCY FIRE EXIT UNLOCKED");
        this.story.advanceObjective(6);
        soundEngine.playPipeGroan();
      }
    }

    // 9. CRT TV & VCR Station
    else if (data.type === 'vcr_station') {
      if (this.player.inventory.tapes.length === 0) {
        this.ui.showBannerNotification("NO TAPES IN POSSESSION.\nSEARCH THE FACILITY FOR VHS CASSETTES.");
      } else {
        this.ui.toggleInventory();
      }
    }
  }

  // Directions for avoiding Subject 407, shown in sequence once it wakes.
  // Every number matches the thresholds in entity.js.
  showStealthBriefing() {
    this.clearBriefing();
    const lines = [
      'SUBJECT 407 IS AWAKE. IT CANNOT DETECT YOU FOR 20 SECONDS.',
      'THEN IT HUNTS BY SOUND AND LIGHT. WALK OR CROUCH [C] TO STAY QUIET.',
      'FLASHLIGHT OFF [F] NEAR IT. ITS BEAM IS SEEN FROM 12m.',
      'IT CHASES WITHIN 8m. IF IT REACHES YOU, MOVE AWAY AT ONCE.'
    ];
    lines.forEach((line, i) => {
      this.briefingTimers.push(setTimeout(() => this.ui.showBannerNotification(line), 5000 + i * 4800));
    });
  }

  clearBriefing() {
    this.briefingTimers.forEach(t => clearTimeout(t));
    this.briefingTimers = [];
  }

  unlockWallSafe() {
    const safe = this.world.vaultSafe;
    if (safe && safe.userData) {
      safe.userData.isOpen = true;
      safe.userData.ledMesh.material.color.setHex(0x33ff55);
      if (safe.userData.doorPivot) {
        safe.userData.doorPivot.rotation.y = -Math.PI / 1.7;
      }
      soundEngine.playDoorCreak(true);
      this.ui.showBannerNotification("VAULT UNLOCKED!\nTape 03 & Morgue Key inside");

      // Reveal contents
      if (safe.userData.tape3) {
        safe.userData.tape3.visible = true;
        safe.userData.tape3.userData.isInteractable = true;
      }
      if (safe.userData.morgueKey) {
        safe.userData.morgueKey.visible = true;
        safe.userData.morgueKey.userData.isInteractable = true;
      }
    }
  }

  triggerGameOver() {
    this.state = 'GAMEOVER';
    document.exitPointerLock();
    this.ui.showGameOver();
  }

  triggerVictory() {
    this.state = 'VICTORY';
    document.exitPointerLock();

    const mins = Math.floor(this.gameTime / 60);
    const secs = Math.floor(this.gameTime % 60);
    const timeString = `${mins}m ${secs}s`;

    this.ui.showVictory({
      timeString,
      tapesCount: Object.values(this.story.tapeFound).filter(Boolean).length
    });
  }

  // Writes to the DOM only when the prompt actually changes
  setPrompt(text) {
    if (text === this._prompt) return;
    this._prompt = text;
    this.ui.setInteractionPrompt(text);
  }

  updateInteractionPrompt() {
    const hovered = this.player.hoveredObject;
    if (!hovered) {
      this.setPrompt(null);
      return;
    }

    const data = hovered.userData;
    if (data.type === 'vhs_tape') {
      this.setPrompt(`[E] TAKE ${data.title.toUpperCase()}`);
    } else if (data.type === 'door') {
      if (data.reqKey === 'all_tapes_and_power') {
        this.setPrompt(`[E] UNLOCK EMERGENCY FIRE EXIT`);
      } else if (data.reqKey && !this.player.inventory.keys.has(data.reqKey)) {
        this.setPrompt(`[E] OPEN ${data.name} (LOCKED)`);
      } else {
        this.setPrompt(`[E] ${data.isOpen ? 'CLOSE' : 'OPEN'} ${data.name}`);
      }
    } else if (data.type === 'key') {
      this.setPrompt(`[E] PICK UP ${data.keyName.toUpperCase()}`);
    } else if (data.type === 'battery') {
      this.setPrompt(`[E] TAKE INDUSTRIAL BATTERY (+45%)`);
    } else if (data.type === 'fuse') {
      this.setPrompt(`[E] TAKE HIGH-VOLTAGE FUSE`);
    } else if (data.type === 'note') {
      this.setPrompt(`[E] READ CASE FILE`);
    } else if (data.type === 'wall_safe') {
      this.setPrompt(`[E] USE KEYPAD COMBINATION`);
    } else if (data.type === 'generator') {
      this.setPrompt(`[E] INSERT FUSE / RESTORE POWER`);
    } else if (data.type === 'vcr_station') {
      this.setPrompt(`[E] INSERT TAPE INTO VCR DECK`);
    }
  }

  // Rolling frame-time check; steps the render scale down under load and back up when there is headroom
  trackFrameTime(rawDelta) {
    this.perf.acc += rawDelta;
    this.perf.n++;
    if (this.perf.acc < 2) return;
    const avg = this.perf.acc / this.perf.n;
    this.perf.acc = 0;
    this.perf.n = 0;

    const r = this.renderer.getPixelRatio();
    let next = r;
    if (avg > 1 / 42 && r > 0.6) next = Math.max(0.6, r - 0.15);
    else if (avg < 1 / 58 && r < this.perf.maxRatio) next = Math.min(this.perf.maxRatio, r + 0.1);

    if (next !== r) {
      this.renderer.setPixelRatio(next);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  // Shadow maps are only re-rendered when a shadow caster might have moved
  refreshShadows(forceNow) {
    if (forceNow || this.frameCount % 2 === 0) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const rawDelta = this.clock.getDelta();
    const delta = Math.min(rawDelta, 0.1);
    this.trackFrameTime(rawDelta);
    this.frameCount++;

    if (this.state === 'MENU') {
      // Cinematic camera orbit over the dark reception lobby
      this.menuAngle += delta * 0.18;
      this.camera.position.set(Math.sin(this.menuAngle) * 5, 2.2, 18 + Math.cos(this.menuAngle) * 4);
      this.camera.lookAt(0, 1.4, 15);
      const doorsMoving = this.world.update(delta, this.gameTime);
      this.refreshShadows(doorsMoving);
      this.renderer.render(this.scene, this.camera);
      this.vhsEffect.render(this.gameTime, 0.05, false);
      return;
    }

    if (this.state === 'PLAYING') {
      this.gameTime += delta;
      this.player.update(delta, this.gameTime);
      const doorsMoving = this.world.update(delta, this.gameTime);

      const entityResult = this.entity.update(delta, this.gameTime);
      if (entityResult === 'CAUGHT') {
        this.triggerGameOver();
        return;
      }

      this.updateInteractionPrompt();

      // Live warning when Subject 407 closes in, at most once every 9 seconds
      if (this.entity.isActive && this.entity.proximityDanger > 0.5 && this.gameTime - this.lastProximityWarning > 9) {
        this.lastProximityWarning = this.gameTime;
        this.ui.showBannerNotification('SUBJECT 407 IS CLOSE!\nCROUCH [C] + FLASHLIGHT OFF [F] + MOVE AWAY');
      }

      // HUD at 20 Hz is plenty for a timer and a compass
      this.hudTimer += rawDelta;
      if (this.hudTimer >= 0.05) {
        this.hudTimer = 0;
        this.ui.updateHUD(
          100,
          this.player.battery,
          this.player.stamina,
          this.gameTime,
          this.player.yawObject.position,
          this.player.yawObject.rotation.y
        );
      }

      this.refreshShadows(doorsMoving);
      this.vhsEffect.setNightVision(this.player.nightVision);
      this.renderer.render(this.scene, this.camera);
      this.vhsEffect.render(this.gameTime, this.entity.proximityDanger, false);
      return;
    }

    if (this.state === 'PLAYING_TAPE') {
      // Tape playback mode with higher VHS distortion
      this.renderer.render(this.scene, this.camera);
      this.vhsEffect.render(this.gameTime, 0.45, true);
      return;
    }

    // Modals or paused: keep the last frame alive
    this.renderer.render(this.scene, this.camera);
    this.vhsEffect.render(this.gameTime, 0.05, false);
  }
}

// Instantiate game on page load
window.addEventListener('DOMContentLoaded', () => {
  new LostFootageGame();
});
