import * as THREE from 'three';
import { World } from './world.js';
import { modelFactory } from './models.js';
import { CORRIDOR_BOXES } from './corridor-data.js';
import {
  loadGLB, tidy, sizeHeight, standOn, centreAt, makeHolder, buildHighVoltageFuse
} from './props.js';

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
export const RIFLE_SPOT = { x: TABLE.x + 0.3, y: 0.99, z: TABLE.z };

// The portal swirls once the airlock is open. Both shaders are plain GLSL.
const PORTAL_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const PORTAL_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float swirl = a + r * 5.0 - uTime * 2.2;
    float band = 0.5 + 0.5 * sin(swirl * 4.0);
    float edge = smoothstep(1.0, 0.55, r);
    vec3 col = mix(vec3(0.05, 0.85, 0.45), vec3(0.75, 1.0, 0.85), band);
    float alpha = edge * (0.35 + 0.65 * band);
    gl_FragColor = vec4(col * alpha, alpha);
  }`;

const MODELS = [
  'models/corridor.glb', 'models/bed.glb', 'models/autopsy_table.glb', 'models/skelevision.glb',
  'models/props.glb', 'models/paintings.glb', 'models/generator.glb', 'models/airlock_door.glb',
  'models/ammo_box.glb'
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

  // ---------- Bedroom: the uploaded safe, with the fuse inside ----------
  buildBedroomSafe() {
    // The holder is an interactable straight away; the safe model fills it in once it has loaded
    const safe = makeHolder();
    safe.userData = {
      isInteractable: true, type: 'wall_safe', isOpen: false,
      ledMesh: null, doorPivot: null, dial: null, interiorLight: new THREE.Object3D()
    };
    this.scene.add(safe);
    this.interactables.push(safe);
    this.vaultSafe = safe;
    this.addCollider(SAFE.x, SAFE.y, SAFE.z, 0.92, 0.8, 0.8);

    // The fuse is inside the safe: hidden until the dial opens it, then it can be taken
    const fuse = buildHighVoltageFuse();
    fuse.position.set(SAFE.x + 0.62, SAFE.y - 0.05, SAFE.z);
    fuse.rotation.y = Math.PI / 2;
    fuse.visible = false;
    fuse.userData = { isInteractable: false, type: 'fuse', name: 'High-Voltage Fuse' };
    this.scene.add(fuse);
    this.interactables.push(fuse);
    safe.userData.fuse = fuse;

    loadGLB('models/safe.glb').then(gltf => {
      const closed = gltf.scene.getObjectByName('Safe_Closed');
      if (!closed) throw new Error('Safe_Closed not found in safe.glb');
      const model = tidy(closed.clone(true));
      model.updateWorldMatrix(true, true);

      // The door is the plate whose front face is furthest forward (+Z). It hinges on its left edge.
      let door = null;
      let frontMost = -Infinity;
      model.traverse(o => {
        if (!o.isMesh) return;
        const b = new THREE.Box3().setFromObject(o);
        if (b.max.z > frontMost) { frontMost = b.max.z; door = o; }
      });
      const db = new THREE.Box3().setFromObject(door);
      const hinge = new THREE.Vector3(db.min.x, (db.min.y + db.max.y) / 2, (db.min.z + db.max.z) / 2);
      const pivot = makeHolder();
      pivot.position.copy(hinge);
      door.parent.remove(door);
      pivot.add(door);
      door.position.sub(hinge);
      model.add(pivot);

      // The brass dial on the door turns as the combination is rolled
      const cx = (db.min.x + db.max.x) / 2;
      const cy = (db.min.y + db.max.y) / 2;
      const fz = db.max.z;
      const dial = makeHolder();
      dial.position.set(cx - hinge.x, cy - hinge.y, fz + 0.05 - hinge.z);
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.9 });
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.35, 28), brass);
      knob.rotation.x = Math.PI / 2;
      dial.add(knob);
      const notch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.1), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      notch.position.set(0, 0.6, 0.2);
      dial.add(notch);
      pivot.add(dial);

      // Lock light, lit red until the dial opens the door
      const ledMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      ledMesh.position.set(db.max.x - 1.2 - hinge.x, db.max.y - 1.0 - hinge.y, fz + 0.1 - hinge.z);
      pivot.add(ledMesh);

      model.scale.setScalar(0.142);          // the body is about 0.8 m wide
      safe.rotation.y = Math.PI / 2;         // the door faces east, into the bedroom
      safe.add(model);
      centreAt(safe, SAFE.x, SAFE.y, SAFE.z, model);

      safe.userData.ledMesh = ledMesh;
      safe.userData.doorPivot = pivot;
      safe.userData.dial = dial;
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
        uniforms: { uTime: { value: 0 } },
        vertexShader: PORTAL_VERT,
        fragmentShader: PORTAL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    );
    this.portal.position.set(EXIT.x, 1.15, EXIT.z);
    this.portal.visible = false;
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
    if (this.portal) this.portal.visible = true;
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
    if (this.portal && this.portal.visible) this.portal.material.uniforms.uTime.value = gameTime;
    return moving;
  }
}
