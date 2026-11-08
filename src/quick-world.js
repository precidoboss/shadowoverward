import * as THREE from 'three';
import { World } from './world.js';
import { modelFactory } from './models.js';
import { CORRIDOR_BOXES } from './corridor-data.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  loadGLB, tidy, sizeHeight, sizeLongest, standOn, centreAt, makeHolder, buildHighVoltageFuse, matte, poseBox
} from './props.js';
import { loadRiggedCharacter, RigPlayer } from './character-anim.js';
import { unskinMeshes } from './unskin.js';

// The quick run plays inside the horror corridor model. Two areas matter:
//  - the north end (the entrance), where the run starts, with the autopsy table and the skelevision
//  - the west bedroom, with the safe that holds the fuse, and the generator and airlock exit to the south
// Walls come from CORRIDOR_BOXES, so the player collides with what they see.
// It extends World so every system that reads world.colliders, interactables and lights works unchanged.

// The model's floor sits at y = 2.52; shifting it down puts the floor at y = 0
const CORRIDOR_FLOOR_Y = 2.52;
export const BED_SPOT = { x: -14.2, z: 1.8 };

// The code shown on the skelevision and needed for the bedroom safe (Subject 407)
export const TV_CODE = '0407';

// Fixed positions, checked against the walls so nothing blocks the route
export const TABLE = { x: -3.95, z: -6.62 };          // autopsy table at the entrance
export const SAFE = { x: -15.04, y: 1.2, z: 4.6 };    // bedroom safe, against the west wall
export const GENERATOR = { x: -5.85, z: 7.5 };
export const EXIT = { x: -3.9, z: 8.3 };              // airlock, on the back wall of the generator room
// The service rifle lies on the autopsy table, beside the skelevision
export const RIFLE_SPOT = { x: TABLE.x + 0.36, y: 0.99, z: TABLE.z };

// The west hall corner: the office table with the old TV on its north end and the ammo box on its south end.
// The TV faces east into the hall. The table is checked against the walls, so the route stays open.
export const CORNER = { x: -9.0, z: -1.2, tvZ: -1.5, ammoZ: -0.85 };
export const CORNER_TOP_Y = 0.63;

// The portal swirls once the airlock is open. Both shaders are plain GLSL.
const PORTAL_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const PORTAL_FRAG = `
  uniform float uTime;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float swirl = a + r * 5.0 - uTime * 2.2;
    float band = 0.5 + 0.5 * sin(swirl * 4.0);
    float edge = smoothstep(1.0, 0.55, r);
    vec3 col = mix(vec3(0.05, 0.85, 0.45), vec3(0.75, 1.0, 0.85), band);
    float alpha = uAlpha * edge * (0.35 + 0.65 * band);
    gl_FragColor = vec4(col * alpha, alpha);
  }`;

const MODELS = [
  'models/corridor.glb', 'models/bed.glb', 'models/autopsy_table.glb', 'models/skelevision.glb',
  'models/props.glb', 'models/paintings.glb', 'models/generator.glb', 'models/airlock_door.glb',
  'models/ammo_box.glb', 'models/office_table.glb', 'models/old_tv.glb'
];

// Start fetching as soon as this file loads, so the models are usually ready before Play is pressed
export function preloadQuickModels() {
  for (const url of MODELS) loadGLB(url).catch(() => {});
}

export class QuickWorld extends World {
  buildSanatorium() {
    // Invisible walls that match the model
    for (const [x0, z0, x1, z1] of CORRIDOR_BOXES) {
      this.colliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 4.2, z1)));
    }
    this.ceilingHeight = 4.1;

    // Corridor model
    loadGLB('models/corridor.glb').then(src => {
      const corridor = src.scene.clone(true);
      corridor.position.y = -CORRIDOR_FLOOR_Y;
      corridor.traverse(o => {
        if (o.isMesh && o.material) {
          o.material = o.material.clone();
          const mat = o.material;
          // The model marks every material as alpha-blended. Blended surfaces do not write depth, so walls
          // drawn behind other walls showed through them up close. They are all solid, so make them opaque.
          if (mat.color && mat.color.r > 0.99 && mat.color.g > 0.99 && mat.opacity < 0.05) {
            o.visible = false;   // one fully transparent helper material
          }
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
          mat.alphaTest = 0;
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        }
      });
      this.scene.add(corridor);
    }).catch(err => console.warn('Corridor model failed to load', err));

    // Bed in the west bedroom. The model ships with its own floor square, which is dropped.
    loadGLB('models/bed.glb').then(src => {
      const bed = src.scene.clone(true);
      const floors = [];
      bed.traverse(o => { if (o.name === 'Floor_Floor_0' || o.name === 'Floor') floors.push(o); });
      floors.forEach(f => f.parent && f.parent.remove(f));
      bed.rotation.y = Math.PI / 2;
      bed.position.set(BED_SPOT.x, 0, BED_SPOT.z);
      this.scene.add(bed);
    }).catch(err => console.warn('Bed model failed to load', err));
    this.addCollider(BED_SPOT.x, 0.4, BED_SPOT.z, 1.2, 0.8, 2.3);
  }

  buildGrounds() {}

  buildDetail() {}

  buildPropsAndPuzzles() {
    this.buildEntrance();       // autopsy table, body and skelevision
    this.buildBedroomSafe();    // safe with the fuse inside
    this.buildGeneratorAndExit();
    this.buildDressing();       // props and paintings
    this.buildTapes();          // the found footage
    this.buildCornerSet();      // the TV that plays Shadow 47 footage, on the office table
  }

  // ---------- Entrance: the autopsy table and the skelevision on it ----------
  buildEntrance() {
    const hold = makeHolder();
    this.scene.add(hold);

    loadGLB('models/autopsy_table.glb').then(gltf => {
      const table = gltf.scene.getObjectByName('autopsytable_sm').clone(true);
      const body = gltf.scene.getObjectByName('deadman_sm').clone(true);
      tidy(table);
      tidy(body);
      hold.add(table, body);

      // Measure the table on its own, then turn the set 180 degrees so the body lies on the east side, off the route
      const tb = new THREE.Box3().setFromObject(table);
      const c = tb.getCenter(new THREE.Vector3());
      hold.rotation.y = Math.PI;
      hold.position.set(TABLE.x + c.x, -tb.min.y, TABLE.z + c.z);
      hold.updateWorldMatrix(true, true);

      const tableBox = new THREE.Box3().setFromObject(table);
      this.colliders.push(tableBox);
      this.colliders.push(new THREE.Box3().setFromObject(body));
      this.tableTopY = tableBox.max.y;
      this.buildSkelevision();
    }).catch(err => console.warn('Autopsy table failed to load', err));
  }

  // The skelevision sits on the table and plays the safe code on a loop
  buildSkelevision() {
    const tv = makeHolder();
    tv.userData = { isInteractable: true, type: 'skelevision', name: 'Skelevision' };
    this.scene.add(tv);
    this.interactables.push(tv);

    this.tvCanvas = document.createElement('canvas');
    this.tvCanvas.width = 256;
    this.tvCanvas.height = 192;
    this.tvCtx = this.tvCanvas.getContext('2d');
    this.tvTexture = new THREE.CanvasTexture(this.tvCanvas);
    this.tvLast = -1;

    loadGLB('models/skelevision.glb').then(gltf => {
      const model = gltf.scene.clone(true);
      tidy(model);
      // The screen material is named 'screegn' in the file. It gets the live code display.
      model.traverse(o => {
        if (o.isMesh && o.material && o.material.name === 'screegn') {
          o.material = new THREE.MeshBasicMaterial({ map: this.tvTexture, toneMapped: false });
        }
      });
      tv.add(model);
      sizeHeight(model, 0.7);
      tv.rotation.y = -Math.PI / 2;   // the screen faces west, toward the start
      standOn(tv, TABLE.x, this.tableTopY, TABLE.z, model);
      this.drawSkelevision(0);
    }).catch(err => console.warn('Skelevision failed to load', err));

    const tvLight = new THREE.PointLight(0x9dffb8, 0.9, 3.2);
    tvLight.position.set(TABLE.x - 0.3, 1.5, TABLE.z);
    this.scene.add(tvLight);
    this.addFlicker(tvLight);
  }

  // Static, then the code appears one digit at a time, and the loop starts again
  drawSkelevision(t) {
    const g = this.tvCtx;
    if (!g) return;
    const W = 256;
    const H = 192;
    g.fillStyle = '#031208';
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(157,255,184,${Math.random() * 0.18})`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 1 + Math.random() * 2);
    }

    const cycle = t % 9;
    g.textAlign = 'center';
    g.fillStyle = '#9dffb8';
    g.font = 'bold 16px monospace';
    g.fillText('SAFE CODE', W / 2, 30);

    g.font = 'bold 60px monospace';
    for (let i = 0; i < TV_CODE.length; i++) {
      const x = W / 2 - 96 + i * 64;
      if (cycle > 1 + i * 1.2) {
        g.fillStyle = '#9dffb8';
        g.fillText(TV_CODE[i], x, 120);
      } else {
        g.fillStyle = 'rgba(157,255,184,0.18)';
        g.fillText('-', x, 120);
      }
    }

    g.font = '12px monospace';
    g.fillStyle = 'rgba(157,255,184,0.7)';
    g.fillText(cycle < 8.5 ? 'PLAYBACK' : 'REWIND', W / 2, 176);
    this.tvTexture.needsUpdate = true;
  }

  // ---------- Bedroom: the rigged safe, with the fuse inside ----------
  buildBedroomSafe() {
    // The holder is an interactable straight away; the safe model fills it in once it has loaded
    const safe = makeHolder();
    safe.userData = {
      isInteractable: true, type: 'wall_safe', isOpen: false,
      ledMesh: null, open: null, setDial: null, interiorLight: new THREE.Object3D()
    };
    this.scene.add(safe);
    this.interactables.push(safe);
    this.vaultSafe = safe;
    this.addCollider(SAFE.x, SAFE.y, SAFE.z, 0.85, 0.85, 0.8);

    // The fuse is inside the safe: hidden until the dial opens it, then it can be taken
    const fuse = buildHighVoltageFuse();
    fuse.position.set(SAFE.x + 0.56, SAFE.y - 0.05, SAFE.z);
    fuse.rotation.y = Math.PI / 2;
    fuse.visible = false;
    fuse.userData = { isInteractable: false, type: 'fuse', name: 'High-Voltage Fuse' };
    this.scene.add(fuse);
    this.interactables.push(fuse);
    safe.userData.fuse = fuse;

    loadGLB('models/safe.glb').then(gltf => {
      // The safe is rigged, so it is cloned with its skeleton. It is sized and placed from its posed bounds,
      // so the size is right whatever scale the rig was exported at.
      // The rig's skin does not match its bones, so the safe is rebuilt from its bones (see unskin.js)
      const model = matte(tidy(unskinMeshes(cloneSkeleton(gltf.scene))));
      model.traverse(o => { o.frustumCulled = false; });
      safe.rotation.y = Math.PI / 2;    // the door faces east, into the bedroom
      safe.add(model);
      model.scale.setScalar(1);
      const sized = poseBox(model);
      const largest = Math.max(sized.max.x - sized.min.x, sized.max.y - sized.min.y, sized.max.z - sized.min.z);
      model.scale.setScalar(0.85 / (largest || 1));
      const placed = poseBox(model);
      const mid = placed.getCenter(new THREE.Vector3());
      safe.position.add(new THREE.Vector3(SAFE.x, SAFE.y, SAFE.z).sub(mid));
      safe.updateWorldMatrix(true, true);

      // Dial: the knob bone turns about its own shaft (its local Y) as the combination is rolled
      const knob = model.getObjectByName('KnobBone_03');
      if (knob) {
        const rest = knob.quaternion.clone();
        const shaft = new THREE.Vector3(0, 1, 0);
        safe.userData.setDial = degrees => {
          knob.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(shaft, -degrees * Math.PI / 180));
        };
      }

      // Door: the rig's own opening animation, played once the combination is right
      const clip = gltf.animations[0];
      if (clip) {
        this.safeMixer = new THREE.AnimationMixer(model);
        const action = this.safeMixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        safe.userData.open = () => action.reset().play();
      }

      // Lock light on the front of the safe, lit red until it opens
      const b = poseBox(model);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      led.position.set(b.max.x + 0.01, b.max.y - 0.12, (b.min.z + b.max.z) / 2 + 0.2);
      this.scene.add(led);
      safe.userData.ledMesh = led;
    }).catch(err => console.warn('Safe model failed to load', err));
  }

  // ---------- Generator room: the generator and the airlock exit ----------
  buildGeneratorAndExit() {
    // Generator. The file is Z-up, so it is stood up here, and its LED is on the side facing the room.
    const gen = makeHolder();
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    led.position.set(0, 0.3, 0.45);
    gen.add(led);
    gen.userData = { isInteractable: true, type: 'generator', hasFuse: false, isPowered: false, led };
    this.scene.add(gen);
    this.interactables.push(gen);

    loadGLB('models/generator.glb').then(gltf => {
      const model = gltf.scene.clone(true);
      tidy(model);
      model.rotation.x = -Math.PI / 2;
      gen.add(model);
      sizeHeight(model, 1.27);
      gen.rotation.y = Math.PI;
      standOn(gen, GENERATOR.x, 0, GENERATOR.z, model);
      model.traverse(o => { if (o.isMesh) o.castShadow = true; });
    }).catch(err => console.warn('Generator failed to load', err));

    // Airlock exit. Its unlock-and-slide sequence is the file's own animation. It plays when Shadow 47 is down.
    const exit = makeHolder();
    exit.userData = {
      isInteractable: true, type: 'door', name: 'Emergency Fire Exit',
      reqKey: 'all_tapes_and_power', isOpen: false, targetAngle: 0
    };
    this.scene.add(exit);
    this.interactables.push(exit);
    this.exitDoor = exit;

    const glow = modelFactory.makeGlow(0x66ff88, 0.7);
    glow.position.set(EXIT.x, 2.6, EXIT.z - 0.2);
    this.scene.add(glow);

    // The airlock is solid until it opens. Then the portal takes its place in the doorway.
    this.exitCollider = new THREE.Box3(
      new THREE.Vector3(EXIT.x - 1.36, 0, EXIT.z - 0.36),
      new THREE.Vector3(EXIT.x + 1.36, 2.3, EXIT.z + 0.36)
    );
    this.colliders.push(this.exitCollider);

    this.portalOpen = false;
    this.portal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 2.2),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
        vertexShader: PORTAL_VERT,
        fragmentShader: PORTAL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    );
    this.portal.position.set(EXIT.x, 1.15, EXIT.z);
    this.scene.add(this.portal);

    loadGLB('models/airlock_door.glb').then(gltf => {
      const model = gltf.scene.clone(true);
      tidy(model);
      exit.add(model);
      sizeHeight(model, 2.3);
      standOn(exit, EXIT.x, 0, EXIT.z, model);
      model.traverse(o => { if (o.isMesh) o.castShadow = true; });

      const clip = gltf.animations[0];
      if (clip) {
        this.exitMixer = new THREE.AnimationMixer(model);
        this.exitAction = this.exitMixer.clipAction(clip);
        this.exitAction.setLoop(THREE.LoopOnce, 1);
        this.exitAction.clampWhenFinished = true;
        this.exitAction.play();
        this.exitMixer.update(0);       // closed pose
        this.exitAction.paused = true;  // waits until the boss is down
      }
    }).catch(err => console.warn('Airlock door failed to load', err));
  }

  // Called when Shadow 47 is down: the airlock unlocks and slides open, and the portal appears in the doorway
  openExit() {
    if (this.exitAction) {
      this.exitAction.paused = false;
      this.exitPlaying = true;
    }
    const i = this.colliders.indexOf(this.exitCollider);
    if (i >= 0) this.colliders.splice(i, 1);
    this.portalOpen = true;
    if (this.portal) this.portal.material.uniforms.uAlpha.value = 1;
  }

  // ---------- West hall: the office table, the old TV, and the Shadow 47 footage ----------
  buildCornerSet() {
    // The stage the TV plays: a dark corridor, with the real character (the same rig as in the game)
    this.replayScene = new THREE.Scene();
    this.replayScene.background = new THREE.Color(0x030504);
    this.replayScene.add(new THREE.AmbientLight(0x9fb3a6, 2.6));
    const fill = new THREE.DirectionalLight(0xffffff, 1.5);
    fill.position.set(0, 3, 3);
    fill.target.position.set(0, 1, -4);
    this.replayScene.add(fill, fill.target);
    const lamp = new THREE.PointLight(0xffe2b0, 9, 14);
    lamp.position.set(0, 2.8, -3.5);
    this.replayScene.add(lamp);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 16), new THREE.MeshStandardMaterial({ color: 0x1a1d1b, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -5);
    this.replayScene.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b2f2c, roughness: 0.95 });
    const left = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.2), wallMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-3, 1.6, -5);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.2), wallMat);
    right.rotation.y = -Math.PI / 2;
    right.position.set(3, 1.6, -5);
    this.replayScene.add(left, right);
    this.replayCam = new THREE.PerspectiveCamera(60, 4 / 3, 0.05, 30);
    this.replayCam.position.set(0, 1.45, 0.2);
    this.replayRT = new THREE.WebGLRenderTarget(512, 384);
    this.replayClock = 0;
    this.tvPlaying = false;

    // Captions drawn over the picture: "NO TAPE PLAYING", then the play bar and timecode
    this.tvOverlayCanvas = document.createElement('canvas');
    this.tvOverlayCanvas.width = 256;
    this.tvOverlayCanvas.height = 192;
    this.tvOverlayCtx = this.tvOverlayCanvas.getContext('2d');
    this.tvOverlayTex = new THREE.CanvasTexture(this.tvOverlayCanvas);
    this.tvOverlayLast = -1;
    this.drawTvOverlay(0);

    loadRiggedCharacter({
      mesh: 'animations/enemy-breathing.fbx',
      clips: { breathing: 'animations/clips/breathing.json', walk: 'animations/clips/enemyWalk.json' },
      height: 1.9,
      slimX: 0.8
    }).then(({ root, clips, speeds }) => {
      root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      root.position.z = -7;
      this.replayScene.add(root);
      this.replayActor = root;
      this.replayRig = new RigPlayer(root, clips, speeds);
      this.replayRig.play('breathing');
    }).catch(err => console.warn('Replay character unavailable', err));

    // The office table: 1.3 m long, with its long side along the hall
    loadGLB('models/office_table.glb').then(gltf => {
      const table = matte(tidy(gltf.scene.clone(true)));
      sizeLongest(table, 1.3);
      const holder = makeHolder();
      holder.add(table);
      holder.rotation.y = Math.PI / 2;
      this.scene.add(holder);
      standOn(holder, CORNER.x, 0, CORNER.z, table);
      this.colliders.push(new THREE.Box3().setFromObject(holder));
    }).catch(err => console.warn('Office table failed to load', err));

    // The old TV: the screen is two planes on its front (+Z): the picture, then the captions over it
    const tvHolder = makeHolder();
    tvHolder.userData = { isInteractable: true, type: 'tv_player', name: 'Old TV' };
    this.scene.add(tvHolder);
    this.interactables.push(tvHolder);
    loadGLB('models/old_tv.glb').then(gltf => {
      const tv = matte(tidy(gltf.scene.clone(true)));
      this.tvScreenMat = new THREE.MeshBasicMaterial({ map: this.replayRT.texture, color: 0x000000, toneMapped: false, side: THREE.DoubleSide });
      // The picture is on both faces, so it shows whichever side faces the hallway
      for (const z of [0.5, -0.5]) {
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.66), this.tvScreenMat);
        screen.position.set(0, 0.7, z);
        if (z < 0) screen.rotation.y = Math.PI;
        tv.add(screen);
      }
      const captions = new THREE.Mesh(
        new THREE.PlaneGeometry(0.92, 0.66),
        new THREE.MeshBasicMaterial({ map: this.tvOverlayTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
      );
      captions.position.set(0, 0.7, 0.505);
      tv.add(captions);
      const backCaptions = captions.clone();
      backCaptions.position.set(0, 0.7, -0.505);
      backCaptions.rotation.y = Math.PI;
      tv.add(backCaptions);
      sizeHeight(tv, 0.7);
      tvHolder.add(tv);
      tvHolder.rotation.y = Math.PI / 2;      // the screen faces east, into the hall
      standOn(tvHolder, CORNER.x, CORNER_TOP_Y, CORNER.tvZ, tv);
    }).catch(err => console.warn('Old TV failed to load', err));
  }

  // Advances the Shadow 47 footage: walks toward the camera, lunges, pauses, and repeats
  stepReplay(delta) {
    this.replayClock += delta;
    const a = this.replayActor;
    if (!a || !this.replayRig) return;
    const c = this.replayClock % 7;   // walk 4.8 s, lunge 0.8 s, pause 1.4 s
    let shake = 0;
    if (c < 4.8) {
      a.position.z = -7 + c * 1.15;
      this.replayRig.play('walk', { fade: 0.2 });
    } else if (c < 5.6) {
      const k = (c - 4.8) / 0.8;
      a.position.z = -1.48 + k * 0.9;
      this.replayRig.play('walk', { fade: 0.05, timeScale: 2.2 });
      shake = 0.04 * k;
    } else {
      a.position.z = -7;
      this.replayRig.play('breathing', { fade: 0.4 });
    }
    this.replayRig.update(delta);
    this.replayCam.position.set((Math.random() - 0.5) * shake, 1.45 + (Math.random() - 0.5) * shake, 0.2);
    this.replayCam.lookAt(0, 1.1, a.position.z);
    this.renderReplay();
  }

  // Draws the footage into the TV's texture. The renderer's target is restored, so the main frame is unaffected.
  renderReplay() {
    const r = this.renderer;
    if (!r || !this.replayRT || !this.replayActor) return;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.replayRT);
    r.render(this.replayScene, this.replayCam);
    r.setRenderTarget(prev);
  }

  // Shader and program compile for the footage, done before play so the first press does not stall
  prewarm(renderer) {
    this.renderer = renderer;
    this.renderReplay();
  }

  drawTvOverlay(t) {
    const g = this.tvOverlayCtx;
    if (!g) return;
    const W = 256;
    const H = 192;
    g.clearRect(0, 0, W, H);
    if (!this.tvPlaying) {
      g.fillStyle = 'rgba(157,255,184,0.85)';
      g.textAlign = 'center';
      g.font = 'bold 16px monospace';
      g.fillText('NO TAPE PLAYING', W / 2, H / 2);
      g.font = '11px monospace';
      g.fillText('PRESS E TO PLAY', W / 2, H / 2 + 20);
    } else if (!this.replayActor) {
      g.fillStyle = 'rgba(157,255,184,0.85)';
      g.textAlign = 'center';
      g.font = 'bold 14px monospace';
      g.fillText('FOOTAGE LOADING...', W / 2, H / 2);
    } else {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      if (Math.random() < 0.15) {
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(0, Math.random() * H, W, 6);
      }
      g.fillStyle = 'rgba(157,255,184,0.9)';
      g.textAlign = 'left';
      g.font = 'bold 14px monospace';
      g.fillText('PLAY', 10, 20);
      const sec = Math.floor(t);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      g.textAlign = 'right';
      g.fillText(`00:${mm}:${ss}`, W - 10, 20);
      g.textAlign = 'left';
      g.font = '10px monospace';
      g.fillText('SHADOW 47 - OCT 31 1997', 10, H - 10);
    }
    this.tvOverlayTex.needsUpdate = true;
  }

  // Where the player stands to watch: in the hall, a metre east of the TV, facing it
  tvWatchPose() {
    return { x: CORNER.x + 1.1, z: CORNER.tvZ, yaw: Math.PI / 2 };
  }

  // Starts or stops the footage. Returns whether it is now playing.
  toggleTv() {
    this.tvPlaying = !this.tvPlaying;
    this.replayClock = 0;
    if (this.tvScreenMat) this.tvScreenMat.color.setScalar(this.tvPlaying ? 1 : 0);
    this.drawTvOverlay(0);
    return this.tvPlaying;
  }

  // The found footage: a tape on the autopsy table beside the skelevision, and one on the bedroom floor
  buildTapes() {
    const onTable = modelFactory.createVhsTape(4, 'Tape 04: The Final Log', 'OCT 31 1997');
    onTable.position.set(TABLE.x - 0.36, RIFLE_SPOT.y + 0.03, TABLE.z);
    onTable.rotation.y = Math.PI / 2;
    this.scene.add(onTable);
    this.interactables.push(onTable);

    const onFloor = modelFactory.createVhsTape(2, 'Tape 02: The Transformation', 'OCT 18 1997');
    onFloor.position.set(-13.6, 0.03, 5.9);
    onFloor.rotation.y = 0.4;
    this.scene.add(onFloor);
    this.interactables.push(onFloor);
  }

  // True when the position (x, z) is close enough to the open portal to step through it
  isInPortal(x, z) {
    return this.portalOpen && Math.hypot(x - EXIT.x, z - EXIT.z) < 0.75;
  }

  // ---------- Horror dressing: props from the prop pack, and the paintings ----------
  buildDressing() {
    loadGLB('models/props.glb').then(gltf => {
      // Places one named prop from the pack. `y` is the bottom height, so wall items can be lifted off the floor.
      const place = (name, height, x, z, yaw, { y = 0, solid = false } = {}) => {
        const src = gltf.scene.getObjectByName(name);
        if (!src) { console.warn('Prop not found in props.glb:', name); return; }
        const part = makeHolder();
        const model = tidy(src.clone(true));
        part.add(model);
        sizeHeight(model, height);
        part.rotation.y = yaw;
        this.scene.add(part);
        standOn(part, x, y, z, model);
        if (solid) this.colliders.push(new THREE.Box3().setFromObject(part));
      };

      // Lockers against walls
      place('Locker(closed)', 2.0, -15.28, 5.92, Math.PI / 2, { solid: true });
      place('Locker(closed)', 2.0, 1.48, -1.70, -Math.PI / 2, { solid: true });
      // Barrels in the south-west hall
      place('Barrel', 0.9, -10.0, 5.2, 0, { solid: true });
      place('Barrel', 0.9, -7.0, 5.2, 0.6, { solid: true });
      // Pipes running from the floor to the ceiling in two corners
      place('Pipe', 4.0, -5.1, -7.9, 0, { solid: true });
      place('Pipe', 4.0, -15.2, 0.0, 0, { solid: true });
      // Electrical box on the generator room wall, and an effigy on the hall wall
      place('PowerBox', 0.67, -6.23, 8.35, Math.PI / 2, { y: 1.1 });
      place('Effigy', 1.6, -8.3, 6.43, Math.PI, { y: 0.5 });
    }).catch(err => console.warn('Prop pack failed to load', err));

    loadGLB('models/paintings.glb').then(gltf => {
      // Each painting is one panel of the file, hung on a wall at eye height
      const hang = (name, x, y, z, yaw) => {
        const src = gltf.scene.getObjectByName(name);
        if (!src) { console.warn('Painting not found:', name); return; }
        const part = makeHolder();
        const model = tidy(src.clone(true), { doubleSide: true });
        part.add(model);
        sizeHeight(model, 1.25);
        part.rotation.y = yaw;
        this.scene.add(part);
        centreAt(part, x, y, z, model);
      };
      hang('Plane.003_0', -15.47, 1.9, 1.6, Math.PI / 2);   // bedroom, west wall, above the bed
      hang('Plane.001_1', -11.0, 1.7, 6.47, Math.PI);       // south-west hall, facing into the hall
      hang('Plane.005_4', -2.36, 1.7, -5.6, -Math.PI / 2);  // entrance room, east wall, above the body
      hang('Plane.007_6', -14.0, 1.8, -0.45, 0);            // bedroom, north wall
    }).catch(err => console.warn('Paintings failed to load', err));
  }

  setupAtmosphere() {
    this.scene.add(new THREE.AmbientLight(0x405565, 1.4));
    const lamps = [
      [0xffcc88, -4.5, -5.5],   // start
      [0xffcc88, -4.5, 0.5],    // central hall
      [0x77bbff, -9, 5],        // west hallway toward the bedroom
      [0xff4444, -4.5, 6.8]     // generator and exit
    ];
    for (const [color, x, z] of lamps) {
      const light = new THREE.PointLight(color, 2.2, 11);
      light.position.set(x, 3.4, z);
      this.scene.add(light);
      this.addFlicker(light);
    }
  }

  update(delta, gameTime) {
    const moving = super.update(delta, gameTime);
    // Redraw the skelevision screen about eight times a second
    if (this.tvCtx && Math.abs(gameTime - this.tvLast) > 0.12) {
      this.tvLast = gameTime;
      this.drawSkelevision(gameTime);
    }
    if (this.exitPlaying && this.exitMixer) this.exitMixer.update(delta);
    if (this.safeMixer) this.safeMixer.update(delta);
    if (this.tvPlaying) this.stepReplay(delta);
    if (this.tvOverlayCtx && Math.abs(gameTime - this.tvOverlayLast) > 0.1) {
      this.tvOverlayLast = gameTime;
      if (this.tvPlaying) this.drawTvOverlay(this.replayClock);
    }
    if (this.portal) this.portal.material.uniforms.uTime.value = gameTime;
    return moving;
  }
}
