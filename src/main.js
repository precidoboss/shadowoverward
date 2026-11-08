import { CameraTour, QUICK_TOUR } from './tour.js';
import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { EntityAI } from './entity.js';
import { VhsShaderEffect } from './vhs-effects.js';
import { StoryManager } from './story.js';
import { UIManager } from './ui.js';
import { soundEngine } from './audio.js';
import { Mutant, loadMutantTemplate, MUTANT_SPAWNS, ATTACK_DAMAGE } from './mutant.js';
import { QUICK_INTRO } from './story.js';
import { QuickWorld, preloadQuickModels, TV_CODE, RIFLE_SPOT, CORNER, CORNER_TOP_Y } from './quick-world.js';
import { WeaponSystem, createPickup } from './weapons.js';
import { SpookyLighting } from './spooky-lighting.js';
import { findFreeSpot } from './collision.js';

// The loading screen stays up at least this long, so the wait reads as deliberate
const MIN_LOADING_MS = 2500;
const BOSS_HIT_DAMAGE = 35;
const QUICK_MUTANT_SPAWNS = [[-8, -2.1], [-9, 5]];
const FULL_START = { x: 0, z: 19 };
const QUICK_START = { x: -4.85, z: -6.6 };   // just inside the entrance, beside the autopsy table

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

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 80);

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
    this.bossDown = false;
    this.mutants = [];

    // VHS Overlay Shader
    this.vhsEffect = new VhsShaderEffect(this.container);

    // Initialize Game Systems
    // The map lives in its own group, so switching between the sanatorium and the quick run removes the old one
    this.levelKind = 'full';
    this.level = new THREE.Group();
    this.scene.add(this.level);
    this.world = new World(this.level);
    this.player = new Player(this.camera, this.renderer.domElement, this.world, this.scene);
    this.scene.add(this.player.yawObject);
    // The menu orbit and the walkthrough place the camera in world space, so it starts out in the scene
    this.player.releaseCamera(this.scene);

    this.entity = new EntityAI(this.scene, this.player);
    this.entity.world = this.world;
    this.fullSpawn = this.entity.spawnPos.clone();
    this.fullPatrol = this.entity.patrolPoints.slice();

    this.ui = new UIManager(this);
    this.tour = new CameraTour();
    this.tour.onEnd = () => this.player.attachCamera();
    this.story = new StoryManager(this.ui);
    this.weapons = new WeaponSystem(this);
    this.spooky = new SpookyLighting(this.world);
    this.spawnPickups();

    // Window Resize Handling
    window.addEventListener('resize', () => this.onWindowResize());

    // Left click punches, or fires the rifle once it is armed. Q switches between them.
    window.addEventListener('mousedown', (e) => {
      if (this.state !== 'PLAYING' || !this.player.isLocked || e.button !== 0) return;
      this.weapons.attack();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyQ' && !e.repeat && this.state === 'PLAYING') this.weapons.toggleArmed();
    });

    // Menu Camera Orbit Angle
    this.menuAngle = 0;

    // Load the investigator, then Subject 407, and the infected staff alongside them. The loading screen
    // stays up until all three are ready.
    this.startLoading();

    // Start Game Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    this.ui.showMainMenu();
  }

  startLoading() {
    let done = 0;
    const total = 3;
    const step = label => {
      done++;
      this.ui.setLoadProgress(done / total, label);
    };

    const investigator = this.player.rigLoaded.then(() => step('INVESTIGATOR'));
    const subject = investigator
      .then(() => this.entity.loadRig())
      .then(() => step('SUBJECT 407'));
    const staff = loadMutantTemplate()
      .then(template => {
        this.spawnMutants(template);
        step('INFECTED STAFF');
      })
      .catch(err => {
        console.warn('Infected staff model unavailable:', err);
        step('INFECTED STAFF (UNAVAILABLE)');
      });

    // Loading starts at page load; the loading screen only appears when a start button is pressed
    this.loadingReady = Promise.all([investigator, subject, staff]).catch(() => {});
  }

  // Play button: the loading screen comes up first, then the chosen map is built behind it, so the menu's
  // lobby never shows. The loading screen stays up for at least a few seconds and until the characters are ready.
  requestStart(kind) {
    soundEngine.init();
    soundEngine.ensureContext();
    // Pointer lock must be requested inside the click, so it is taken here
    this.requestPointerLock();
    this.ui.showLoading();
    const started = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (kind !== this.levelKind || kind === 'quick') this.setLevel(kind);
      this.loadingReady.then(() => {
        const wait = Math.max(0, MIN_LOADING_MS - (performance.now() - started));
        setTimeout(() => {
          // Two frames, so the loading screen is painted before the run begins
          requestAnimationFrame(() => requestAnimationFrame(() => {
            this.startRun(kind, true);
            this.ui.hideLoading();
          }));
        }, wait);
      });
    }));
  }

  // Swaps the map: 'full' is the sanatorium, 'quick' the two-room run. Everything placed on the map is rebuilt.
  setLevel(kind) {
    this.levelKind = kind;
    this.scene.remove(this.level);
    this.level = new THREE.Group();
    this.scene.add(this.level);
    this.world = kind === 'quick' ? new QuickWorld(this.level) : new World(this.level);
    this.world.renderer = this.renderer;
    // Each map has its own safe code. The quick run's code is the one the skelevision plays.
    this.ui.keypadTarget = kind === 'quick' ? TV_CODE : '1974';
    this.player.world = this.world;
    this.player.hoveredObject = null;
    this.entity.world = this.world;
    this.spooky.world = this.world;
    this.story.setLevel(kind);
    this.placeLevelActors();
    this.spawnPickups();
    this.arrangeMutants();
  }

  // Where Subject 407 waits and patrols for each map
  placeLevelActors() {
    if (this.levelKind === 'quick') {
      this.entity.spawnPos.set(-4.5, 0, 6.2);
      this.entity.patrolPoints = [new THREE.Vector3(-4.5, 0, 6.2), new THREE.Vector3(-4.5, 0, 1.5)];
    } else {
      this.entity.spawnPos.copy(this.fullSpawn);
      this.entity.patrolPoints = this.fullPatrol.slice();
    }
    this.entity.mesh.position.copy(this.entity.spawnPos);
  }

  // Places the infected staff for the current map. Extra ones on a smaller map are hidden and count as down.
  arrangeMutants() {
    const spawns = this.levelKind === 'quick' ? QUICK_MUTANT_SPAWNS : MUTANT_SPAWNS;
    this.mutants.forEach((m, i) => {
      m.world = this.world;
      const spot = spawns[i];
      if (!spot) {
        m.dead = true;
        m.group.visible = false;
        return;
      }
      m.spawn.copy(findFreeSpot(this.world, spot[0], spot[1], 0.35));
      m.reset();
    });
  }

  // Begins a run on the given map. A map is rebuilt when it changes, and always on a quick restart.
  // `prebuilt` means requestStart has already built the map behind the loading screen.
  startRun(kind, prebuilt = false) {
    if (!prebuilt && (kind !== this.levelKind || kind === 'quick')) this.setLevel(kind);
    this.resetRun();
    // Back on the investigator's eye, with no leftover tilt from the menu
    this.player.attachCamera();
    this.startGame();
    // The quick run opens with the walkthrough; Space, Enter or Escape skips it
    if (kind === 'quick') {
      this.player.releaseCamera(this.scene);
      this.tour.start(QUICK_TOUR, { x: QUICK_START.x, y: 1.6, z: QUICK_START.z });
    }
  }

  spawnMutants(template) {
    this.mutantTemplate = template;
    this.mutants = MUTANT_SPAWNS.map(([x, z]) => new Mutant({
      scene: this.scene,
      template,
      world: this.world,
      player: this.player,
      spawn: findFreeSpot(this.world, x, z, 0.35)
    }));
    this.arrangeMutants();
  }

  spawnPickups() {
    const spots = this.levelKind === 'quick'
      ? [{ type: 'rifle', ...RIFLE_SPOT }, { type: 'ammo', x: CORNER.x, y: CORNER_TOP_Y, z: CORNER.ammoZ }]   // the fuse is inside the bedroom safe
      : [{ type: 'rifle', x: -2.5, z: 16.5 }, { type: 'ammo', x: 15.0, z: 4.0 }, { type: 'ammo', x: 1.5, z: -24.0 }];
    for (const s of spots) {
      // Pickups with a fixed height (the rifle on the table) keep their exact spot
      const at = s.y !== undefined ? { x: s.x, y: s.y, z: s.z } : findFreeSpot(this.world, s.x, s.z, 0.3);
      createPickup(this, s.type, at);
    }
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
    soundEngine.startMusic();
    // Compile shaders up front so the first use of a material doesn't stall play
    this.renderer.compile(this.scene, this.camera);
    if (this.world.prewarm) this.world.prewarm(this.renderer);
    this.ui.hideMainMenu();
    this.requestPointerLock();
    this.ui.updateObjective(this.story.getCurrentObjective());
    if (this.levelKind === 'quick') {
      // Short found-footage opening, one line at a time
      this.clearBriefing();
      QUICK_INTRO.forEach((line, i) => {
        if (i === 0) this.ui.showBannerNotification(line);
        else this.briefingTimers.push(setTimeout(() => this.ui.showBannerNotification(line), i * 3800));
      });
    } else {
      this.ui.showBannerNotification("REC START: OCT 31 1997\nSHADOW OVER WARD B\n[Press V to Toggle 1st / 3rd Person]");
    }
  }

  pauseGame() {
    this.state = 'PAUSED';
    soundEngine.pauseMusic();
    document.exitPointerLock();
    this.ui.showPauseMenu();
  }

  // Leaves the run for the main menu. The sanatorium lobby is the menu backdrop, so the full map is restored.
  returnToMainMenu() {
    if (this.tour.active) this.tour.end();
    if (this.watchingTv) this.exitTvWatch();
    this.state = 'MENU';
    this.clearBriefing();
    soundEngine.pauseMusic();
    document.exitPointerLock();
    this.player.releaseCamera(this.scene);
    if (this.levelKind !== 'full') this.setLevel('full');
    this.ui.hidePauseMenu();
    this.ui.showMainMenu();
  }

  resumeGame() {
    this.state = 'PLAYING';
    soundEngine.ensureContext();
    soundEngine.startMusic();
    this.ui.hidePauseMenu();
    this.requestPointerLock();
  }

  restartGame() {
    this.startRun(this.levelKind);
  }

  // Resets the investigator, the map state and the story for a fresh run on the current map
  resetRun() {
    const start = this.levelKind === 'quick' ? QUICK_START : FULL_START;
    this.player.yawObject.position.set(start.x, 0, start.z);
    this.player.yawObject.rotation.set(0, 0, 0);
    this.player.pitchObject.rotation.set(0, 0, 0);
    this.player.battery = 100;
    this.player.stamina = 100;
    this.player.health = this.player.maxHealth;
    this.player.lastHurt = -10;
    this.player.flashlightOn = true;
    this.player.updateFlashlightState();
    this.player.inventory.keys.clear();
    this.player.inventory.tapes = [];
    this.player.inventory.hasFuse = false;
    this.player.inventory.batteriesCount = 0;
    this.player.inventory.notesRead = [];

    // The full sanatorium is reset in place; the quick map was just rebuilt by startRun
    if (this.levelKind === 'full') this.world.reset();
    this.entity.reset();
    this.arrangeMutants();
    this.weapons.reset();
    this.spooky.reset();
    this.bossDown = false;

    this.story.currentObjectiveIndex = 0;
    this.story.tapeFound = { 1: false, 2: false, 3: false, 4: false };
    this.story.generatorPowered = false;
    this.story.safeUnlocked = false;

    this.clearBriefing();
    this.lastProximityWarning = -Infinity;
    this.gameTime = 0;
  }

  // Handle Player Interaction ([E] Key)
  handlePlayerInteraction() {
    const target = this.player.interact();
    if (!target) return;

    const data = target.userData;

    // 1. VHS Tapes
    if (data.type === 'vhs_tape') {
      this.story.collectTape(data.tapeId);
      this.story.refreshChecklist();
      this.player.inventory.tapes.push({ id: data.tapeId, title: data.title, date: data.date });
      this.ui.showBannerNotification(`TAPE ACQUIRED: ${data.title.toUpperCase()}\nPLAY IT ON THE OLD TV IN THE WEST HALL`);
      target.visible = false;
      target.userData.isInteractable = false;
    }

    // 2. Door Interaction
    else if (data.type === 'door') {
      if (data.reqKey) {
        if (data.reqKey === 'all_tapes_and_power') {
          // Fire Exit Door in Basement
          if (!this.story.quick && !this.story.allTapesCollected()) {
            soundEngine.playLockedDoor();
            this.ui.showBannerNotification("FIRE EXIT SEALED:\nRECOVER ALL 4 LOST VHS TAPES FIRST!");
            return;
          }
          if (!this.story.generatorPowered) {
            soundEngine.playLockedDoor();
            this.ui.showBannerNotification("FIRE EXIT SEALED:\nRESTORE POWER AT GENERATOR BREAKER!");
            return;
          }
          if (!this.bossDown) {
            soundEngine.playLockedDoor();
            this.ui.showBannerNotification("FIRE EXIT SEALED:\nSTOP SHADOW 47 FIRST!");
            return;
          }
          // Quick run: the exit opens a portal, and walking into it is the way out (see the portal check)
          if (this.levelKind === 'quick') {
            this.ui.showBannerNotification("THE PORTAL IS OPEN.\nWALK INTO IT TO ESCAPE.");
            return;
          }
          // Sanatorium: the fire exit is the way out
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
      this.story.advanceObjective(this.story.quick ? 3 : 5);
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

    // 8. Generator Breaker Box. Restoring power wakes Subject 407 for the last fight.
    else if (data.type === 'generator') {
      if (!this.player.inventory.hasFuse) {
        soundEngine.playLockedDoor();
        this.ui.showBannerNotification("GENERATOR OFFLINE:\nREQUIRES HIGH-VOLTAGE FUSE FROM WARD B");
      } else if (!this.story.generatorPowered) {
        this.story.generatorPowered = true;
        soundEngine.playKeypadBeep(true);
        data.led.material.color.setHex(0x00ff00);
        this.ui.showBannerNotification("POWER RESTORED TO BASEMENT!\nSHADOW 47 IS AWAKE");
        this.story.advanceObjective(this.story.quick ? 4 : 6);
        soundEngine.playPipeGroan();
        if (!this.entity.isActive) {
          this.entity.activate();
          soundEngine.playJumpStinger();
          this.showBossBriefing();
        }
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

    // 9c. CCTV console: switch the feed between the cameras
    else if (data.type === 'cctv_console') {
      this.ui.showBannerNotification(`CCTV FEED: ${this.world.cycleCctv()}`);
      this.story.sideQuests.cctv = true;
      this.story.refreshChecklist();
    }

    // 9a. Old TV in the west hall: plays Shadow 47 footage, once a tape has been picked up
    else if (data.type === 'tv_player') {
      if (this.player.inventory.tapes.length === 0) {
        this.ui.showBannerNotification('NO TAPE IN THE VCR.\nPICK UP A VHS TAPE FIRST.');
      } else {
        const on = !this.world.tvPlaying;
        if (on) this.enterTvWatch(); else this.exitTvWatch();
        if (on) { this.story.sideQuests.tv = true; this.story.refreshChecklist(); }
        this.ui.showBannerNotification(on ? 'PLAYING: SHADOW 47 FOOTAGE' : 'TV OFF');
      }
    }

    // 9b. Skelevision on the autopsy table: plays the safe code again
    else if (data.type === 'skelevision') {
      this.ui.showBannerNotification(`SKELEVISION PLAYBACK\nSAFE CODE:  ${TV_CODE.split('').join(' - ')}`);
    }

    // 10. Service rifle and ammunition
    else if (data.type === 'rifle') {
      this.weapons.acquireRifle(14);
      if (this.story.quick) this.story.advanceObjective(1);
      soundEngine.playItemPickup();
      this.ui.showBannerNotification("RECOVERED: SERVICE RIFLE + 14 ROUNDS\n[Q] SWITCH WEAPON  •  [LEFT CLICK] FIRE");
      target.visible = false;
      target.userData.isInteractable = false;
    } else if (data.type === 'ammo') {
      this.weapons.addAmmo(10);
      soundEngine.playItemPickup();
      this.ui.showBannerNotification(`RIFLE AMMO +10 (${this.weapons.ammo} ROUNDS)`);
      target.visible = false;
      target.userData.isInteractable = false;
    }
  }

  // Watching the TV: step in front of it, facing it, with the camcorder zoom on
  enterTvWatch() {
    if (this.world.tvPlaying) return;
    const p = this.world.tvWatchPose();
    this.player.yawObject.position.x = p.x;
    this.player.yawObject.position.z = p.z;
    this.player.yawObject.rotation.y = p.yaw;
    this.player.pitchObject.rotation.x = p.pitch;
    this.tvSavedZoom = this.player.isZoomed;
    this.player.isZoomed = true;
    this.watchingTv = true;
    this.world.toggleTv();
  }

  // Stops the TV and gives the camera back. Called by E at the TV, by walking away, or when the level ends.
  exitTvWatch() {
    if (this.world.tvPlaying) this.world.toggleTv();
    this.player.isZoomed = this.tvSavedZoom ?? false;
    this.watchingTv = false;
  }

  // The rolled combination turns the brass dial on the safe
  turnSafeDial(degrees) {
    const safe = this.world.vaultSafe;
    if (safe && safe.userData.setDial) safe.userData.setDial(degrees);
  }

  // Directions for the last fight, shown in sequence once Subject 407 wakes.
  showBossBriefing() {
    this.clearBriefing();
    const lines = [
      'SHADOW 47 IS AWAKE. STAY OUT OF ITS REACH.',
      'FISTS = 1 DAMAGE.  RIFLE = 2 PER SHOT.  [Q] SWITCHES.\nKILL IT, THEN USE THE FIRE EXIT.'
    ];
    lines.forEach((line, i) => {
      this.briefingTimers.push(setTimeout(() => this.ui.showBannerNotification(line), 2000 + i * 4200));
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
      if (safe.userData.ledMesh) safe.userData.ledMesh.material.color.setHex(0x33ff55);
      if (safe.userData.open) {
        safe.userData.open();
      } else if (safe.userData.doorPivot) {
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
      if (safe.userData.fuse) {
        safe.userData.fuse.visible = true;
        safe.userData.fuse.userData.isInteractable = true;
      }
    }
  }

  // Called when a hit from anything lands on the investigator
  onHit(amount, message) {
    const dead = this.player.takeDamage(amount, this.gameTime);
    this.ui.flashHurt();
    if (dead) {
      this.triggerGameOver();
    } else {
      this.ui.showBannerNotification(message);
    }
  }

  // Shadow 47 is down: the fire exit opens
  onBossDown() {
    this.bossDown = true;
    if (this.world.openExit) this.world.openExit();   // quick run: the airlock slides open
    this.entity.isActive = false;
    soundEngine.playPipeGroan();
    this.ui.showBannerNotification("SHADOW 47 IS DOWN.\nTHE FIRE EXIT IS OPEN.");
  }

  triggerGameOver() {
    this.state = 'GAMEOVER';
    soundEngine.stopMusic();
    document.exitPointerLock();
    this.ui.showGameOver();
  }

  triggerVictory() {
    this.state = 'VICTORY';
    soundEngine.stopMusic();
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
    } else if (data.type === 'rifle') {
      this.setPrompt(`[E] PICK UP SERVICE RIFLE`);
    } else if (data.type === 'cctv_console') {
      this.setPrompt('[E] SWITCH CCTV FEED');
    } else if (data.type === 'tv_player') {
      if (this.player.inventory.tapes.length === 0) this.setPrompt('[E] OLD TV (NEEDS A VHS TAPE)');
      else this.setPrompt(this.world.tvPlaying ? '[E] STOP THE TV' : '[E] PLAY TAPE ON THE OLD TV');
    } else if (data.type === 'skelevision') {
      this.setPrompt(`[E] REPLAY SKELEVISION`);
    } else if (data.type === 'ammo') {
      this.setPrompt(`[E] TAKE RIFLE AMMO`);
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
      // The walkthrough owns the camera: the world keeps running, the player and enemies wait
      if (this.tour.active) {
        this.tour.update(delta, this.camera);
        this.world.update(delta, this.gameTime);
        this.renderer.render(this.scene, this.camera);
        this.vhsEffect.render(this.gameTime, 0.05, false);
        return;
      }
      this.player.update(delta, this.gameTime);
      // CCTV: when the player is near the console, draw the selected camera into its screen
      if (this.levelKind === 'quick' && this.world.cctvNear && this.world.cctvNear(this.player.yawObject.position)) {
        this.world.renderCctv(this.renderer, [this.weapons.gunFP, this.weapons.gunTP, this.player.characterGroup]);
      }
      // Quick run safety net: outside the walls means stuck, so bring the player back to the entrance
      if (this.levelKind === 'quick') {
        const pp = this.player.yawObject.position;
        if (pp.x < -16 || pp.x > 4.5 || pp.z < -9.4 || pp.z > 9.4) {
          this.player.yawObject.position.set(QUICK_START.x, 0, QUICK_START.z);
          this.ui.showBannerNotification('YOU WERE OUTSIDE THE WALLS.\nBACK AT THE ENTRANCE.');
        }
      }
      // Walking away from the TV while it plays stops the footage
      if (this.watchingTv && this.world.tvWatchPose) {
        const p = this.world.tvWatchPose();
        if (Math.hypot(this.player.yawObject.position.x - p.x, this.player.yawObject.position.z - p.z) > 2.5) this.exitTvWatch();
      }
      // Quick run: stepping into the open portal is the way out
      if (this.levelKind === 'quick' && this.world.isInPortal
          && this.world.isInPortal(this.player.yawObject.position.x, this.player.yawObject.position.z)) {
        this.triggerVictory();
        return;
      }
      const doorsMoving = this.world.update(delta, this.gameTime);
      this.weapons.update(delta);

      // Subject 407: a landed attack costs health (it does not end the run outright)
      const entityResult = this.entity.update(delta, this.gameTime);
      if (entityResult === 'HIT') {
        this.onHit(BOSS_HIT_DAMAGE, 'SHADOW 47 HIT YOU!\nMOVE AWAY NOW.');
        if (this.state !== 'PLAYING') return;
      }

      // Infected staff: each punch that lands costs a little health
      let chasing = 0;
      for (const m of this.mutants) {
        const result = m.update(delta);
        if (m.aggro && !m.dead) chasing = 0.5;
        if (result === 'HIT') {
          this.onHit(ATTACK_DAMAGE, 'INFECTED STAFF HIT YOU!');
          if (this.state !== 'PLAYING') return;
        }
      }

      if (this.levelKind === 'quick' && this.story.currentObjectiveIndex === 1
          && this.mutants.every(m => m.dead || !m.group.visible)) {
        this.story.advanceObjective(2);
      }

      // Procedural lighting follows how close the danger is
      const bossTension = this.entity.isActive ? this.entity.proximityDanger : 0;
      this.spooky.update(delta, Math.max(bossTension, chasing));

      this.updateInteractionPrompt();

      // Live warning when Subject 407 closes in, at most once every 9 seconds
      if (this.entity.isActive && this.entity.proximityDanger > 0.5 && this.gameTime - this.lastProximityWarning > 9) {
        this.lastProximityWarning = this.gameTime;
        this.ui.showBannerNotification('SHADOW 47 IS CLOSE!\nCROUCH [C] + FLASHLIGHT OFF [F] + MOVE AWAY');
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
        this.ui.updateVitals(this.player.health, this.player.maxHealth, this.weapons.label);
        this.ui.setBossHealth(this.entity.isActive ? this.entity.health / this.entity.maxHealth : 0);
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
  preloadQuickModels();
  new LostFootageGame();
});
