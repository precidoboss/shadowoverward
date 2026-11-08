import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { textureGen } from './textures.js';
import { modelFactory } from './models.js';

// Texture coordinates measured in metres so every surface keeps the same texel scale.
// Works on boxes and planes alike by projecting along the dominant normal axis.
function applyWorldUV(geo, tile) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; }
    else if (ay >= az) { u = x; v = z; }
    else { u = x; v = y; }
    uv.setXY(i, u / tile, v / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

// Deterministic PRNG so the prop layout is identical on every load
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.interactables = [];
    this.doors = [];
    this.lightMood = 1;        // set by SpookyLighting: scales every stuttering light
    this.flickerLights = [];   // point/spot lights that stutter (base intensity stored in userData)
    this.fixtures = [];        // emissive ceiling panels that stutter
    this.wallBuckets = new Map();
    this.particles = null;

    this.mats = this.createMaterials();

    this.buildSanatorium();    // walls are queued into buckets and merged into a few draw calls
    this.buildGrounds();
    this.flushWallBuckets();
    this.buildPropsAndPuzzles();
    this.buildDetail();
    this.setupAtmosphere();
  }

  createMaterials() {
    const wall = new THREE.MeshStandardMaterial({ map: textureGen.getWallpaper(), roughness: 0.8, metalness: 0.1 });
    wall.userData.tile = 2.2;

    const tile = new THREE.MeshStandardMaterial({ map: textureGen.getTiles(), roughness: 0.5, metalness: 0.2 });
    tile.userData.tile = 1.2;

    const wood = new THREE.MeshStandardMaterial({ map: textureGen.getWoodFloor(), roughness: 0.7, metalness: 0.1 });
    wood.userData.tile = 2.0;

    const concrete = new THREE.MeshStandardMaterial({ map: textureGen.getConcrete(), roughness: 0.85, metalness: 0.1 });
    concrete.userData.tile = 3.0;

    return {
      wall,
      tile,
      wood,
      concrete,
      metal: modelFactory.sharedMaterials.metalRusted,
      dark: modelFactory.sharedMaterials.blackPlastic,
      steel: new THREE.MeshStandardMaterial({ map: textureGen.getMetal(), roughness: 0.3, metalness: 0.85 }),
      pipe: new THREE.MeshStandardMaterial({ color: 0x3b362d, roughness: 0.5, metalness: 0.7 }),
      plastic: new THREE.MeshStandardMaterial({ color: 0x5b6258, roughness: 0.7, metalness: 0.05 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.25, metalness: 0.9 }),
      extinguisher: new THREE.MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.4, metalness: 0.4 }),
      bag: new THREE.MeshStandardMaterial({ color: 0xc9bb9c, transparent: true, opacity: 0.55, roughness: 0.2 }),
      puddle: new THREE.MeshStandardMaterial({
        color: 0x0b1316, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.7,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
      }),
      streak: new THREE.MeshStandardMaterial({
        map: textureGen.getBloodStreak(), transparent: true, roughness: 0.4,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
      }),
      fabric: new THREE.MeshStandardMaterial({ color: 0x2a2d2e, roughness: 0.9 })
    };
  }

  // ---------- Geometry helpers ----------

  // Queue a static wall box; merged per material later
  createWall(x, y, z, width, height, depth, material) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    geo.translate(x, y, z);
    applyWorldUV(geo, material.userData.tile || 2.5);
    if (!this.wallBuckets.has(material)) this.wallBuckets.set(material, []);
    this.wallBuckets.get(material).push(geo);

    this.colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y, z), new THREE.Vector3(width, height, depth)
    ));
  }

  flushWallBuckets() {
    this.wallBuckets.forEach((geos, mat) => {
      const merged = mergeGeometries(geos, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, mat);
        mesh.name = 'walls';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      } else {
        geos.forEach(g => {
          const mesh = new THREE.Mesh(g, mat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.scene.add(mesh);
        });
      }
    });
    this.wallBuckets.clear();
  }

  addFloor(w, d, x, z, mat, y = 0) {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x, y, z);
    applyWorldUV(geo, mat.userData.tile || 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  // Several boxes sharing one material, merged into a single draw call
  mergedBoxes(parts, mat) {
    const geos = parts.map(p => {
      const g = new THREE.BoxGeometry(p.w, p.h, p.d);
      g.translate(p.x, p.y, p.z);
      return g;
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  addCollider(x, y, z, w, h, d) {
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y, z), new THREE.Vector3(w, h, d)
    ));
  }

  addFlicker(light) {
    light.userData.base = light.intensity;
    light.userData.dip = 0;
    this.flickerLights.push(light);
  }

  buildChair(mat) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), mat);
    seat.position.y = 0.45;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.05), mat);
    back.position.set(0, 0.73, -0.205);
    g.add(back);
    const legGeo = new THREE.BoxGeometry(0.035, 0.45, 0.035);
    [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeo, this.mats.chrome);
      leg.position.set(x, 0.225, z);
      g.add(leg);
    });
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  buildWheelchair() {
    const g = new THREE.Group();
    const frame = this.mats.chrome;
    const fabric = this.mats.fabric;
    g.add(this.mergedBoxes([
      { w: 0.46, h: 0.05, d: 0.44, x: 0, y: 0.5, z: 0 },          // seat
      { w: 0.46, h: 0.5, d: 0.04, x: 0, y: 0.78, z: -0.22 },      // back
      { w: 0.03, h: 0.04, d: 0.5, x: -0.25, y: 0.56, z: 0 },      // armrest rails
      { w: 0.03, h: 0.04, d: 0.5, x: 0.25, y: 0.56, z: 0 },
      { w: 0.03, h: 0.5, d: 0.03, x: -0.25, y: 0.25, z: -0.2 },   // rear posts
      { w: 0.03, h: 0.5, d: 0.03, x: 0.25, y: 0.25, z: -0.2 }
    ], fabric));
    g.add(this.mergedBoxes([
      { w: 0.03, h: 0.03, d: 0.4, x: -0.25, y: 0.12, z: 0.3 },    // footrest
      { w: 0.03, h: 0.03, d: 0.4, x: 0.25, y: 0.12, z: 0.3 },
      { w: 0.03, h: 0.3, d: 0.03, x: -0.25, y: 0.25, z: 0.45 },   // front forks
      { w: 0.03, h: 0.3, d: 0.03, x: 0.25, y: 0.25, z: 0.45 }
    ], frame));
    [-0.27, 0.27].forEach(x => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 14), this.mats.dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.28, 0.02);
      wheel.castShadow = true;
      g.add(wheel);
    });
    return g;
  }

  // ---------- Architecture ----------

  buildSanatorium() {
    const m = this.mats;

    // Floors (room-specific materials, world-scale UVs)
    this.addFloor(18, 40, 0, 5, m.tile);          // Reception & central corridor
    this.addFloor(14, 26, -10, 0, m.tile);        // Ward A
    this.addFloor(14, 14, 10, 6, m.wood);         // Dr. Holloway's office
    this.addFloor(14, 14, 10, -6, m.concrete);    // Ward B quarantine
    this.addFloor(24, 22, 0, -24, m.concrete, -0.05); // Basement & morgue

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(40, 60);
    ceilGeo.rotateX(Math.PI / 2);
    ceilGeo.translate(0, 3.8, -5);
    applyWorldUV(ceilGeo, 3.0);
    this.scene.add(new THREE.Mesh(ceilGeo, m.concrete));

    // Walls (height 3.8m). Calls and doorway gaps are unchanged from the original layout.
    const wallMat = m.wall;
    const H = 3.8;
    const Y = H / 2;

    // Reception lobby
    // South wall has a 2.6m doorway onto the grounds (x -1.3..1.3)
    this.createWall(-4.775, Y, 24, 6.95, H, 0.4, wallMat);
    this.createWall(4.775, Y, 24, 6.95, H, 0.4, wallMat);
    this.createWall(8, Y, 18, 0.4, H, 12, wallMat);
    this.createWall(-8, Y, 18, 0.4, H, 12, wallMat);
    this.createWall(-5.5, Y, 12, 5, H, 0.4, wallMat);
    this.createWall(5.5, Y, 12, 5, H, 0.4, wallMat);

    // Central corridor
    this.createWall(-3, Y, 8.5, 0.4, H, 7, wallMat);
    this.createWall(-3, Y, -0.5, 0.4, H, 6, wallMat);
    this.createWall(-3, Y, -9.5, 0.4, H, 6, wallMat);
    // Gap in the west corridor wall between z -6.5 and -3.5 had no door; closed so it is not an open hole
    this.addSolidBlock(-3, Y, -5.0, 0.4, H, 3.0, wallMat);
    this.createWall(3, Y, 8.5, 0.4, H, 7, wallMat);
    this.createWall(3, Y, -0.5, 0.4, H, 6, wallMat);
    this.createWall(3, Y, -9.5, 0.4, H, 6, wallMat);
    this.createWall(-2.2, Y, -14, 2.5, H, 0.4, wallMat);
    this.createWall(2.2, Y, -14, 2.5, H, 0.4, wallMat);

    // Ward A
    this.createWall(-17, Y, 0, 0.4, H, 25, wallMat);
    this.createWall(-10, Y, 12.5, 14, H, 0.4, wallMat);
    this.createWall(-10, Y, -12.5, 14, H, 0.4, wallMat);
    this.createWall(-10, Y, 0, 14, H, 0.4, wallMat);

    // Dr. Holloway's office
    this.createWall(17, Y, 6, 0.4, H, 13, wallMat);
    this.createWall(10, Y, 12.5, 14, H, 0.4, wallMat);
    this.createWall(10, Y, 0, 14, H, 0.4, wallMat);

    // Ward B
    this.createWall(17, Y, -6.5, 0.4, H, 13, wallMat);
    this.createWall(10, Y, -13, 14, H, 0.4, wallMat);

    // Basement & morgue (concrete)
    this.createWall(-12, Y, -24.5, 0.4, H, 21, m.concrete);
    this.createWall(12, Y, -24.5, 0.4, H, 21, m.concrete);
    this.createWall(0, Y, -35, 24.5, H, 0.4, m.concrete);
    this.createWall(-4, Y, -25, 0.4, H, 14, m.concrete);
  }

  // Walled lawn south of the lobby. Reached through the doorway and a stone path.
  buildGrounds() {
    const m = this.mats;
    const lawn = new THREE.MeshStandardMaterial({ color: 0x1d2a1c, roughness: 1.0, metalness: 0 });
    lawn.userData.tile = 4.0;
    const bark = new THREE.MeshStandardMaterial({ color: 0x2a2219, roughness: 0.95 });

    // Lawn between the building and the perimeter wall
    this.addFloor(52, 36, 0, 42, lawn);
    // Stone path from the doorway out across the lawn
    this.addFloor(2.6, 10, 0, 29, m.concrete, 0.01);

    // Perimeter wall (solid, merged with the other walls)
    this.createWall(-26, 1.1, 42, 0.4, 2.2, 36, m.concrete);
    this.createWall(26, 1.1, 42, 0.4, 2.2, 36, m.concrete);
    this.createWall(0, 1.1, 60, 52, 2.2, 0.4, m.concrete);

    // Dead trees: trunk with three bare branches. Trunks are solid so they block the player.
    const trees = [[-14, 34], [15, 40], [-20, 50], [9, 52], [-6, 46], [18, 30]];
    trees.forEach(([x, z]) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 7), bark);
      trunk.position.y = 1.6;
      trunk.castShadow = true;
      tree.add(trunk);
      [[0.5, 2.4, 0.5, 0.7], [-0.45, 2.7, -0.2, -0.6], [0.2, 1.9, -0.5, 0.2]].forEach(([bx, by, bz, ry]) => {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 1.1, 5), bark);
        branch.position.set(bx * 0.5, by, bz * 0.5);
        branch.rotation.set(0.9, ry, 0);
        branch.castShadow = true;
        tree.add(branch);
      });
      this.scene.add(tree);
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 1.6, z), new THREE.Vector3(0.5, 3.2, 0.5)
      ));
    });

    // Lamp post beside the path: a glow sprite rather than an extra point light
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.0, 8), m.metal);
    pole.position.set(-2.4, 1.5, 27);
    this.scene.add(pole);
    const lampGlow = modelFactory.makeGlow(0xffb070, 0.45);
    lampGlow.position.set(-2.4, 3.0, 27);
    this.scene.add(lampGlow);
  }

  // Solid wall block with a collider (used to close gaps beside door frames)
  addSolidBlock(x, y, z, w, h, d, mat) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(x, y, z);
    applyWorldUV(geo, mat.userData.tile || 2.5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.addCollider(x, y, z, w, h, d);
  }

  // Closes the wall gap beside a door frame, and blocks the doorway with the door leaf while it is shut.
  // fills and leaf are [centreX, centreZ, sizeX, sizeZ] in world units.
  sealDoorway(door, fills, leaf) {
    fills.forEach(([cx, cz, sx, sz]) => this.addSolidBlock(cx, 1.9, cz, sx, 3.8, sz, this.mats.wall));
    const center = new THREE.Vector3(leaf[0], 1.3, leaf[1]);
    const size = new THREE.Vector3(leaf[2], 2.6, leaf[3]);
    const box = new THREE.Box3().setFromCenterAndSize(center, size);
    this.colliders.push(box);
    door.userData.leaf = { box, center, size, shut: true };
  }

  // Ceiling fluorescent panel. Emissive, so it has no per-light shader cost.
  addFixture(x, z, w = 1.3, d = 0.5) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.06, d + 0.1), this.mats.plastic);
    housing.position.set(x, 3.77, z);
    this.scene.add(housing);

    const base = new THREE.Color(0xdfffe8);
    const mat = new THREE.MeshBasicMaterial({ color: base.clone(), toneMapped: false });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), mat);
    panel.position.set(x, 3.735, z);
    this.scene.add(panel);

    this.fixtures.push({ mat, base, dip: 0 });
  }

  // ---------- Gameplay props, doors, and puzzle items ----------

  buildPropsAndPuzzles() {
    const m = this.mats;

    // 1. RECEPTION LOBBY
    // Barricaded entrance
    const plankMat = new THREE.MeshStandardMaterial({ map: textureGen.getWoodFloor(), roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 0.06), plankMat);
      plank.position.set(0, 0.8 + i * 0.45, 23.7);
      plank.rotation.z = (i % 2 === 0 ? 0.08 : -0.06);
      this.scene.add(plank);
    }

    // Reception desk
    const deskMat = new THREE.MeshStandardMaterial({ map: textureGen.getWoodFloor(), roughness: 0.6 });
    const deskCounter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 1.2), deskMat);
    deskCounter.position.set(3.5, 0.55, 16);
    deskCounter.castShadow = true;
    deskCounter.receiveShadow = true;
    this.scene.add(deskCounter);
    this.colliders.push(new THREE.Box3().setFromObject(deskCounter));

    // Rotary telephone
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }));
    phone.position.set(2.8, 1.18, 16);
    this.scene.add(phone);

    const note1 = modelFactory.createDocumentNote(
      1, 'DIRECTOR MEMO #104',
      'TO ALL STAFF: Under no circumstances is Subject 407 in Ward B to be fed or observed without two armed guards. The facility lockup code begins with our founding year: 19XX.',
      '19'
    );
    note1.position.set(3.6, 1.12, 16.1);
    this.scene.add(note1);
    this.interactables.push(note1);

    const keyWardA = modelFactory.createKeyItem('ward_a_key', 'Ward A Key', 0xb8860b);
    keyWardA.position.set(4.2, 1.12, 15.8);
    this.scene.add(keyWardA);
    this.interactables.push(keyWardA);

    const bat1 = modelFactory.createBatteryPack(1);
    bat1.position.set(-6.5, 0.06, 22);
    this.scene.add(bat1);
    this.interactables.push(bat1);

    // 2. DOORS
    const doorWardA = modelFactory.createSecurityDoor('ward_a', 'WARD A - MEDICAL', 'ward_a_key');
    doorWardA.position.set(-3, 0, 4.2);
    doorWardA.rotation.y = Math.PI / 2;
    this.scene.add(doorWardA);
    this.doors.push(doorWardA);
    this.interactables.push(doorWardA);
    this.sealDoorway(doorWardA, [[-3, 2.975, 0.4, 0.95], [-3, 4.975, 0.4, 0.05]], [-3, 4.2, 0.3, 1.5]);

    const doorOffice = modelFactory.createSecurityDoor('office', 'ARCHIVES & OFFICE', null);
    doorOffice.position.set(3, 0, 4.2);
    doorOffice.rotation.y = -Math.PI / 2;
    this.scene.add(doorOffice);
    this.doors.push(doorOffice);
    this.interactables.push(doorOffice);
    this.sealDoorway(doorOffice, [[3, 2.975, 0.4, 0.95], [3, 4.975, 0.4, 0.05]], [3, 4.2, 0.3, 1.5]);

    const doorWardB = modelFactory.createSecurityDoor('ward_b', 'WARD B - QUARANTINE', 'ward_b_keycard');
    doorWardB.position.set(3, 0, -5.0);
    doorWardB.rotation.y = -Math.PI / 2;
    this.scene.add(doorWardB);
    this.doors.push(doorWardB);
    this.interactables.push(doorWardB);
    this.sealDoorway(doorWardB, [[3, -6.125, 0.4, 0.75], [3, -3.875, 0.4, 0.75]], [3, -5.0, 0.3, 1.5]);

    const doorMorgue = modelFactory.createSecurityDoor('morgue', 'BASEMENT & MORGUE', 'morgue_key');
    doorMorgue.position.set(0, 0, -14);
    this.scene.add(doorMorgue);
    this.doors.push(doorMorgue);
    this.interactables.push(doorMorgue);
    this.sealDoorway(doorMorgue, [[-0.85, -14, 0.2, 0.4], [0.85, -14, 0.2, 0.4]], [0, -14, 1.5, 0.3]);

    // 3. WARD A - ROOM 101 (restraints & examination)
    const gurney1 = modelFactory.createHospitalGurney();
    gurney1.position.set(-8.5, 0, 6.5);
    gurney1.rotation.y = 0.3;
    this.scene.add(gurney1);
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(-8.5, 0.5, 6.5), new THREE.Vector3(1.2, 1, 2.4)));

    const lamp1 = modelFactory.createSurgicalLamp();
    lamp1.position.set(-8.5, 3.8, 6.5);
    this.scene.add(lamp1);
    this.addFlicker(lamp1.userData.spotLight);

    const medCart = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5), m.metal);
    medCart.position.set(-11.5, 0.45, 6.5);
    medCart.castShadow = true;
    this.scene.add(medCart);
    this.colliders.push(new THREE.Box3().setFromObject(medCart));

    const tape1 = modelFactory.createVhsTape(1, 'Tape 01: First Contact', 'OCT 12 1997');
    tape1.position.set(-11.5, 0.93, 6.5);
    this.scene.add(tape1);
    this.interactables.push(tape1);

    const bat2 = modelFactory.createBatteryPack(2);
    bat2.position.set(-13.5, 0.06, 9.5);
    this.scene.add(bat2);
    this.interactables.push(bat2);

    // IV stand beside the gurney (decorative, thin enough to walk around)
    this.buildIvStand(-7.2, 4.4);

    // 4. WARD A - ROOM 102 (ECT therapy room)
    const ectDesk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.8), m.metal);
    ectDesk.position.set(-11, 0.45, -6.5);
    this.scene.add(ectDesk);
    this.colliders.push(new THREE.Box3().setFromObject(ectDesk));

    const keyWardB = modelFactory.createKeyItem('ward_b_keycard', 'Ward B Keycard', 0x3388ff);
    keyWardB.position.set(-11, 0.93, -6.5);
    this.scene.add(keyWardB);
    this.interactables.push(keyWardB);

    const note2 = modelFactory.createDocumentNote(
      2, 'DR. HOLLOWAY INCIDENT REPORT',
      'The incident occurred in the winter of 1974. The creature broke the observation glass with supernatural force. We sealed the vault with that fateful year.',
      '74'
    );
    note2.position.set(-11.6, 0.93, -6.4);
    this.scene.add(note2);
    this.interactables.push(note2);

    // 5. DR. HOLLOWAY'S OFFICE
    const drDesk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 1.2), deskMat);
    drDesk.position.set(10.5, 0.42, 6.5);
    drDesk.castShadow = true;
    this.scene.add(drDesk);
    this.colliders.push(new THREE.Box3().setFromObject(drDesk));

    const vcrStation = modelFactory.createCrtTvWithVcr();
    vcrStation.position.set(7.5, 0, 10.5);
    vcrStation.rotation.y = -Math.PI / 4;
    this.scene.add(vcrStation);
    this.interactables.push(vcrStation);
    this.vcrStation = vcrStation;
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(7.5, 0.8, 10.5), new THREE.Vector3(1.2, 1.8, 1.2)));

    const safe = modelFactory.createWallSafe();
    safe.position.set(16.5, 1.6, 6.5);
    safe.rotation.y = -Math.PI / 2;
    this.scene.add(safe);
    this.interactables.push(safe);
    this.vaultSafe = safe;

    // Safe contents: hidden until unlocked. They must also be in `interactables`,
    // otherwise the raycast can never reach them and the game cannot be completed.
    const tape3 = modelFactory.createVhsTape(3, 'Tape 03: Containment Breach', 'OCT 24 1997');
    tape3.position.set(16.4, 1.55, 6.5);
    tape3.visible = false;
    tape3.userData.isInteractable = false;
    this.scene.add(tape3);
    this.interactables.push(tape3);
    safe.userData.tape3 = tape3;

    const morgueKey = modelFactory.createKeyItem('morgue_key', 'Morgue & Basement Key', 0x992222);
    morgueKey.position.set(16.4, 1.55, 6.3);
    morgueKey.visible = false;
    morgueKey.userData.isInteractable = false;
    this.scene.add(morgueKey);
    this.interactables.push(morgueKey);
    safe.userData.morgueKey = morgueKey;

    const bat3 = modelFactory.createBatteryPack(3);
    bat3.position.set(14.5, 0.06, 2.5);
    this.scene.add(bat3);
    this.interactables.push(bat3);

    // 6. WARD B - QUARANTINE
    const cellBed = modelFactory.createHospitalGurney();
    cellBed.position.set(11, 0, -6.5);
    this.scene.add(cellBed);

    const qTable = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.85, 0.8), m.metal);
    qTable.position.set(7.5, 0.42, -9.5);
    this.scene.add(qTable);
    this.colliders.push(new THREE.Box3().setFromObject(qTable));

    const tape2 = modelFactory.createVhsTape(2, 'Tape 02: Transformation', 'OCT 18 1997');
    tape2.position.set(7.5, 0.9, -9.5);
    this.scene.add(tape2);
    this.interactables.push(tape2);

    const fuseGroup = new THREE.Group();
    fuseGroup.name = 'fuse_item';
    fuseGroup.userData = { isInteractable: true, type: 'fuse', name: 'High-Voltage Fuse' };
    const fuseCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.22, 12),
      new THREE.MeshStandardMaterial({ color: 0x44ddff, metalness: 0.8, roughness: 0.2, emissive: 0x0a3340, emissiveIntensity: 0.6 })
    );
    fuseCyl.rotation.x = Math.PI / 2;
    fuseGroup.add(fuseCyl);
    const fuseGlow = modelFactory.makeGlow(0x55ddff, 0.3);
    fuseGroup.add(fuseGlow);
    fuseGroup.position.set(14.5, 0.9, -9.5);
    this.scene.add(fuseGroup);
    this.interactables.push(fuseGroup);

    // 7. BASEMENT & MORGUE
    const autopsyTable = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.85, 2.4), m.steel);
    autopsyTable.position.set(3.5, 0.42, -26);
    this.scene.add(autopsyTable);
    this.colliders.push(new THREE.Box3().setFromObject(autopsyTable));

    const autopsyBlood = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 1.8),
      new THREE.MeshStandardMaterial({ map: textureGen.getBloodDecal(), transparent: true, opacity: 0.85, depthWrite: false })
    );
    autopsyBlood.rotation.x = -Math.PI / 2;
    autopsyBlood.position.set(3.5, 0.86, -26);
    this.scene.add(autopsyBlood);

    const tape4 = modelFactory.createVhsTape(4, 'Tape 04: The Final Log', 'OCT 31 1997');
    tape4.position.set(3.5, 0.92, -26);
    this.scene.add(tape4);
    this.interactables.push(tape4);

    // Generator breaker box
    const genBox = new THREE.Group();
    genBox.name = 'generator_box';
    genBox.userData = { isInteractable: true, type: 'generator', hasFuse: false, isPowered: false };
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x333b35, metalness: 0.7, roughness: 0.4 }));
    boxMesh.position.set(-8, 1.6, -25);
    boxMesh.castShadow = true;
    genBox.add(boxMesh);
    const genLed = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    genLed.position.set(-8, 2.0, -24.8);
    genBox.add(genLed);
    const genGlow = modelFactory.makeGlow(0xff2020, 0.25);
    genGlow.position.set(-8, 2.0, -24.75);
    genBox.add(genGlow);
    genBox.userData.led = genLed;
    this.scene.add(genBox);
    this.interactables.push(genBox);
    this.generatorBox = genBox;
    this.colliders.push(new THREE.Box3().setFromObject(boxMesh));

    // Emergency fire exit
    const exitDoor = modelFactory.createSecurityDoor('fire_exit', 'EMERGENCY FIRE EXIT', 'all_tapes_and_power');
    exitDoor.position.set(0, 0, -34.8);
    this.scene.add(exitDoor);
    this.doors.push(exitDoor);
    this.interactables.push(exitDoor);
    this.exitDoor = exitDoor;

    const bat4 = modelFactory.createBatteryPack(4);
    bat4.position.set(-6, 0.06, -31);
    this.scene.add(bat4);
    this.interactables.push(bat4);

    // Lights that stutter (base intensity stored so flicker is relative, not permanent)
    const corridorLight1 = new THREE.PointLight(0xffe4b5, 0.8, 10);
    corridorLight1.position.set(0, 3.4, 6);
    this.scene.add(corridorLight1);
    this.addFlicker(corridorLight1);

    const corridorLight2 = new THREE.PointLight(0xddeeff, 0.6, 9);
    corridorLight2.position.set(0, 3.4, -6);
    this.scene.add(corridorLight2);
    this.addFlicker(corridorLight2);

    this.createBloodTrail();
  }

  createBloodTrail() {
    const footprintGeo = new THREE.PlaneGeometry(0.2, 0.38);
    const footprintMat = new THREE.MeshStandardMaterial({
      map: textureGen.getBloodDecal(),
      transparent: true,
      opacity: 0.75,
      roughness: 0.4,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });

    const trailPoints = [
      { x: -1.8, z: 4.5, rot: 0.1 },
      { x: -0.6, z: 3.2, rot: 0.2 },
      { x: 0.4, z: 1.8, rot: 0.05 },
      { x: 0.2, z: 0.2, rot: -0.1 },
      { x: 1.2, z: -1.5, rot: 0.2 },
      { x: 2.0, z: -3.5, rot: 0.3 },
      { x: 0.0, z: -8.0, rot: 0.0 },
      { x: 0.0, z: -11.5, rot: 0.0 },
      { x: 0.5, z: -15.5, rot: 0.1 },
      { x: 1.8, z: -20.0, rot: 0.2 }
    ];

    trailPoints.forEach((pt, idx) => {
      const step = new THREE.Mesh(footprintGeo, footprintMat);
      step.rotation.x = -Math.PI / 2;
      step.rotation.z = pt.rot + (idx % 2 === 0 ? 0.1 : -0.1);
      step.position.set(pt.x + (idx % 2 === 0 ? 0.12 : -0.12), 0.015, pt.z);
      step.receiveShadow = true;
      this.scene.add(step);
    });
  }

  // ---------- Environment detail (pure visual dressing + a few solid props) ----------

  buildIvStand(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.8, 6), this.mats.chrome);
    pole.position.y = 0.9;
    g.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 10), this.mats.dark);
    base.position.y = 0.015;
    g.add(base);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.03), this.mats.bag);
    bag.position.set(0.05, 1.7, 0);
    g.add(bag);
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  buildDetail() {
    const m = this.mats;

    // Ceiling fluorescent fixtures (emissive, flicker via fixtures[])
    [[-4, 18], [4, 18], [0, 21.5],           // reception
     [0, 10], [0, 3], [0, -4], [0, -10],     // corridor
     [-12.5, 6.5], [-8, -6.5],               // ward A
     [13, 3], [11, 10],                      // office
     [11, -3], [14.5, -10],                  // ward B
     [-6, -22], [6, -22], [-6, -31], [6, -31]].forEach(([x, z]) => this.addFixture(x, z));

    // Rusted overhead pipe runs along the corridor and the basement
    [-2.6, 2.6].forEach(x => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 25, 8), m.pipe);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, 3.45, -1);
      this.scene.add(pipe);
    });
    const basementPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 22, 8), m.pipe);
    basementPipe.rotation.z = Math.PI / 2;
    basementPipe.position.set(0, 3.42, -33);
    this.scene.add(basementPipe);

    // Blood streaks on corridor walls (planes sit just in front of the wall faces)
    const streaks = [
      [-2.79, 1.9, 8.8, Math.PI / 2, 1.2, 2.0],
      [-2.79, 1.6, -1.0, Math.PI / 2, 1.0, 1.8],
      [2.79, 1.7, 6.0, -Math.PI / 2, 1.1, 1.9],
      [2.79, 1.5, -10.0, -Math.PI / 2, 1.0, 1.8]
    ];
    streaks.forEach(([x, y, z, rotY, w, h]) => {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m.streak);
      plane.position.set(x, y, z);
      plane.rotation.y = rotY;
      this.scene.add(plane);
    });

    // Reception: wall plates
    const sign1 = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshStandardMaterial({ map: textureGen.getDoorSign('RECEPTION', 'SIGN IN WITH ATTENDANT'), roughness: 0.6 }));
    sign1.position.set(-7.78, 2.3, 16.5);
    sign1.rotation.y = Math.PI / 2;
    this.scene.add(sign1);

    const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshStandardMaterial({ map: textureGen.getDoorSign('WAITING ROOM', 'PLEASE REMAIN SEATED'), roughness: 0.6 }));
    sign2.position.set(7.78, 2.3, 20.5);
    sign2.rotation.y = -Math.PI / 2;
    this.scene.add(sign2);

    // Waiting room chairs (solid, backs against the west wall)
    [18.8, 19.4, 20.0].forEach(z => {
      const chair = this.buildChair(m.plastic);
      chair.position.set(-6.6, 0, z);
      chair.rotation.y = Math.PI / 2;
      this.scene.add(chair);
      this.addCollider(-6.6, 0.5, z, 0.5, 1.0, 0.5);
    });

    // Corridor fire extinguisher on the west wall
    const ext = new THREE.Group();
    const extBody = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 12), m.extinguisher);
    extBody.position.y = 0.2;
    ext.add(extBody);
    const extMount = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.12), m.dark);
    extMount.position.set(-0.02, 0.15, 0);
    ext.add(extMount);
    ext.position.set(-2.66, 1.0, 9.4);
    this.scene.add(ext);

    // Office: filing cabinets (north wall) and bookshelf (east wall)
    [13.6, 14.7].forEach(x => {
      const cab = new THREE.Group();
      cab.add(this.mergedBoxes([
        { w: 0.8, h: 1.4, d: 0.5, x: 0, y: 0.7, z: 0 },
        { w: 0.7, h: 0.36, d: 0.03, x: 0, y: 0.25, z: -0.265 },
        { w: 0.7, h: 0.36, d: 0.03, x: 0, y: 0.7, z: -0.265 },
        { w: 0.7, h: 0.36, d: 0.03, x: 0, y: 1.15, z: -0.265 }
      ], m.plastic));
      cab.position.set(x, 0, 11.8);
      this.scene.add(cab);
      this.addCollider(x, 0.7, 11.8, 0.8, 1.4, 0.5);
    });

    this.buildBookshelf(16.62, 2.6);

    // Ward B: wheelchair (solid) and an overturned chair
    const wheelchair = this.buildWheelchair();
    wheelchair.position.set(14.5, 0, -2.0);
    wheelchair.rotation.y = -0.6;
    this.scene.add(wheelchair);
    this.addCollider(14.5, 0.5, -2.0, 0.7, 1.0, 0.7);

    const fallen = this.buildChair(m.plastic);
    fallen.rotation.z = Math.PI / 2;
    fallen.position.set(8.2, 0.23, -2.6);
    fallen.rotation.y = 0.4;
    this.scene.add(fallen);
    this.addCollider(8.2 - 0.39, 0.23, -2.6, 0.8, 0.46, 0.46);

    // Basement: body-drawer bank along the east wall, puddles, and drawer handles
    const drawerParts = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const y = 0.55 + row * 0.5;
        const z = -25.4 + col * 0.7;
        drawerParts.push({ w: 0.22, h: 0.45, d: 0.62, x: 11.69, y, z });
        drawerParts.push({ w: 0.02, h: 0.02, d: 0.14, x: 11.56, y: y + 0.12, z });
      }
    }
    this.scene.add(this.mergedBoxes(drawerParts, m.steel));
    this.addCollider(11.69, 0.95, -24.0, 0.25, 1.9, 3.6);

    [[-6, -20, 0.6, 1.8, 1.2], [6, -29.5, 1.1, 2.4, 1.5]].forEach(([x, z, rot, w, d]) => {
      const puddle = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m.puddle);
      puddle.geometry.rotateX(-Math.PI / 2);
      puddle.position.set(x, 0.004, z);
      puddle.rotation.y = rot;
      this.scene.add(puddle);
    });
  }

  buildBookshelf(x, z) {
    const g = new THREE.Group();
    const wood = this.mats.wood;
    const parts = [
      { w: 0.03, h: 2.0, d: 1.3, x: 0.165, y: 1.0, z: 0 },   // back panel (toward the wall)
      { w: 0.36, h: 2.0, d: 0.03, x: 0, y: 1.0, z: -0.65 },  // sides
      { w: 0.36, h: 2.0, d: 0.03, x: 0, y: 1.0, z: 0.65 }
    ];
    [0.02, 0.5, 1.0, 1.5, 1.98].forEach(y => parts.push({ w: 0.36, h: 0.03, d: 1.3, x: 0, y, z: 0 }));
    g.add(this.mergedBoxes(parts, wood));

    // Books: deterministic layout, one merged mesh per colour
    const rnd = seeded(42);
    const palette = [0x5b1f1f, 0x1f3b5b, 0x2e4a2a, 0x6b5a2a, 0x3a3a3a];
    const bookParts = palette.map(() => []);
    [0.25, 0.75, 1.25, 1.75].forEach(y => {
      let zc = -0.6;
      while (zc < 0.5) {
        const bw = 0.03 + rnd() * 0.03;
        const bh = 0.2 + rnd() * 0.1;
        const idx = Math.floor(rnd() * palette.length);
        bookParts[idx].push({ w: 0.22, h: bh, d: bw, x: -0.02, y: y + bh / 2 - 0.01, z: zc + bw / 2 });
        zc += bw + 0.005 + rnd() * 0.02;
        if (rnd() < 0.08) zc += 0.1; // gaps where a book has been pulled
      }
    });
    palette.forEach((col, i) => {
      if (bookParts[i].length === 0) return;
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 });
      g.add(this.mergedBoxes(bookParts[i], mat));
    });

    g.position.set(x, 0, z);
    this.scene.add(g);
    this.addCollider(x, 1.0, z, 0.4, 2.0, 1.32);
  }

  // ---------- Atmosphere ----------

  setupAtmosphere() {
    // Ambient fill
    this.scene.add(new THREE.AmbientLight(0x405565, 1.6));

    // Moonlight: one shadow caster. Frustum sized to cover the reception and corridor
    // rather than the default ±5m patch, at a lower map resolution.
    const moon = new THREE.DirectionalLight(0x7da4c7, 2.2);
    moon.position.set(6, 14, 28);
    moon.target.position.set(0, 0, 8);
    moon.castShadow = true;
    moon.shadow.mapSize.width = 2048;
    moon.shadow.mapSize.height = 2048;
    moon.shadow.camera.left = -14;
    moon.shadow.camera.right = 14;
    moon.shadow.camera.top = 18;
    moon.shadow.camera.bottom = -18;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 60;
    moon.shadow.bias = -0.0008;
    // Bounds changes only take effect once the shadow camera's projection is rebuilt
    moon.shadow.camera.updateProjectionMatrix();
    this.scene.add(moon);
    this.scene.add(moon.target);

    // Warm lobby sconces
    const lobbyLamp1 = new THREE.PointLight(0xffcc88, 1.8, 14);
    lobbyLamp1.position.set(-5, 2.6, 18);
    this.scene.add(lobbyLamp1);
    this.addFlicker(lobbyLamp1);

    const lobbyLamp2 = new THREE.PointLight(0xffcc88, 1.8, 14);
    lobbyLamp2.position.set(5, 2.6, 18);
    this.scene.add(lobbyLamp2);
    this.addFlicker(lobbyLamp2);

    // Office banker's lamp (green)
    const officeLamp = new THREE.PointLight(0x77ffaa, 2.2, 10);
    officeLamp.position.set(10.5, 1.5, 6.5);
    this.scene.add(officeLamp);

    // Ward B emergency beacon (red, flashes). Folds in the old second red light.
    const wardBLamp = new THREE.PointLight(0xff4444, 2.0, 12);
    wardBLamp.position.set(10, 2.8, -6.5);
    this.scene.add(wardBLamp);
    this.addFlicker(wardBLamp);

    // Basement cold fluorescent
    const basementLamp = new THREE.PointLight(0x77bbff, 2.0, 16);
    basementLamp.position.set(0, 2.8, -24);
    this.scene.add(basementLamp);
    this.addFlicker(basementLamp);

    // Floating dust motes (soft sprites rather than hard points)
    const count = 220;
    const dustGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 32;
      positions[i * 3 + 1] = Math.random() * 3.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 55 - 5;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0x99bbdd,
      size: 0.06,
      map: textureGen.getSoftParticle(),
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    });
    this.particles = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.particles);
  }

  // ---------- Per-frame ----------

  // Returns true if any door is still swinging (lets main.js refresh shadows only then)
  update(delta, time) {
    if (this.particles) {
      const pos = this.particles.geometry.attributes.position.array;
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] -= delta * 0.04;
        if (pos[i] < 0) pos[i] = 3.6;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    // Light stutter: occasional short dips around each light's base intensity
    for (const light of this.flickerLights) {
      const d = light.userData;
      if (d.dip > 0) {
        d.dip -= delta;
        light.intensity = d.base * 0.15;
      } else {
        light.intensity = d.base * this.lightMood * (0.93 + Math.random() * 0.07);
        if (Math.random() < delta * 0.45) d.dip = 0.05 + Math.random() * 0.14;
      }
    }

    // Emissive ceiling panels stutter the same way
    for (const f of this.fixtures) {
      if (f.dip > 0) {
        f.dip -= delta;
        f.mat.color.copy(f.base).multiplyScalar(0.25);
      } else {
        f.mat.color.copy(f.base);
        if (Math.random() < delta * 0.12) f.dip = 0.04 + Math.random() * 0.1;
      }
    }

    let doorsMoving = false;
    this.doors.forEach(door => {
      const data = door.userData;
      if (data.doorPivot) {
        const prev = data.angle;
        data.angle = THREE.MathUtils.lerp(data.angle, data.targetAngle, delta * 4.0);
        data.doorPivot.rotation.y = data.angle;
        if (Math.abs(data.angle - prev) > 1e-4) doorsMoving = true;
      }
      const leaf = data.leaf;
      if (leaf) {
        const shut = data.angle > -0.35;
        if (shut !== leaf.shut) {
          leaf.shut = shut;
          if (shut) leaf.box.setFromCenterAndSize(leaf.center, leaf.size);
          else leaf.box.makeEmpty();
        }
      }
    });
    return doorsMoving;
  }

  // Restore pickups and puzzle states for a fresh run (used by restartGame)
  reset() {
    this.interactables.forEach(obj => {
      const d = obj.userData || {};
      if (['vhs_tape', 'key', 'battery', 'fuse', 'rifle', 'ammo'].includes(d.type)) {
        obj.visible = true;
        d.isInteractable = true;
      }
      if (d.type === 'generator') {
        d.isPowered = false;
        d.hasFuse = false;
        if (d.led) d.led.material.color.setHex(0xff0000);
      }
      if (d.type === 'wall_safe') {
        d.isOpen = false;
        if (d.ledMesh) d.ledMesh.material.color.setHex(0xff2222);
        if (d.doorPivot) d.doorPivot.rotation.y = 0;
        if (d.interiorLight) d.interiorLight.visible = false;
      }
    });

    // Safe contents stay hidden until the safe is opened again
    const safe = this.vaultSafe;
    if (safe && safe.userData) {
      if (safe.userData.tape3) {
        safe.userData.tape3.visible = false;
        safe.userData.tape3.userData.isInteractable = false;
      }
      if (safe.userData.morgueKey) {
        safe.userData.morgueKey.visible = false;
        safe.userData.morgueKey.userData.isInteractable = false;
      }
    }

    this.doors.forEach(d => {
      d.userData.isOpen = false;
      d.userData.targetAngle = 0;
    });
  }
}
