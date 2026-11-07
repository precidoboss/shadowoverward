import * as THREE from 'three';
import { mergeChildMeshes } from './mesh-utils.js';
import { textureGen } from './textures.js';

export class ModelFactory {
  constructor() {
    this.sharedMaterials = {
      blackPlastic: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.1 }),
      metalRusted: new THREE.MeshStandardMaterial({
        map: textureGen.getMetal(),
        roughness: 0.75,
        metalness: 0.65
      }),
      darkWood: new THREE.MeshStandardMaterial({
        map: textureGen.getWoodFloor(),
        roughness: 0.7,
        metalness: 0.1
      }),
      hospitalTile: new THREE.MeshStandardMaterial({
        map: textureGen.getTiles(),
        roughness: 0.4,
        metalness: 0.2
      }),
      dirtyGlass: new THREE.MeshPhysicalMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.45,
        roughness: 0.3,
        transmission: 0.8,
        thickness: 0.5
      }),
      bloodMaterial: new THREE.MeshStandardMaterial({
        color: 0x480808,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: 0.95
      })
    };
  }

  // Additive glow sprite. Replaces per-prop PointLights: sprites add no lighting
  // cost to every surface in the shader, and they are excluded from raycasts.
  makeGlow(color, size = 0.3) {
    if (!this._glowMats) this._glowMats = new Map();
    let mat = this._glowMats.get(color);
    if (!mat) {
      mat = new THREE.SpriteMaterial({
        map: textureGen.getGlowTexture(),
        color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false
      });
      this._glowMats.set(color, mat);
    }
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size, size, 1);
    sprite.raycast = () => {};
    return sprite;
  }

  // 1. Realistic VHS Cassette
  createVhsTape(tapeId, title, date) {
    const group = new THREE.Group();
    group.name = `vhs_tape_${tapeId}`;
    group.userData = { isInteractable: true, type: 'vhs_tape', tapeId, title, date };

    // Main cassette body
    const bodyGeo = new THREE.BoxGeometry(0.38, 0.05, 0.21);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x161616,
      roughness: 0.5,
      metalness: 0.15
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Front protective tape flap
    const flapGeo = new THREE.BoxGeometry(0.375, 0.048, 0.04);
    const flapMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });
    const flap = new THREE.Mesh(flapGeo, flapMat);
    flap.position.set(0, 0, 0.105);
    group.add(flap);

    // Cassette label sticker on top face
    const labelGeo = new THREE.PlaneGeometry(0.34, 0.15);
    const labelTex = textureGen.getVhsLabel(tapeId, title, date);
    const labelMat = new THREE.MeshStandardMaterial({
      map: labelTex,
      roughness: 0.8,
      metalness: 0.05
    });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.026, -0.015);
    group.add(label);

    // Two transparent tape spool windows
    const windowGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.005, 16);
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.45,
      roughness: 0.2
    });

    // Left spool
    const spoolL = new THREE.Mesh(windowGeo, windowMat);
    spoolL.position.set(-0.09, 0.026, -0.015);
    group.add(spoolL);

    // Right spool
    const spoolR = new THREE.Mesh(windowGeo, windowMat);
    spoolR.position.set(0.09, 0.026, -0.015);
    group.add(spoolR);

    // White spool centers
    const coreGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.008, 12);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 });
    const coreL = new THREE.Mesh(coreGeo, coreMat);
    coreL.position.set(-0.09, 0.027, -0.015);
    const coreR = new THREE.Mesh(coreGeo, coreMat);
    coreR.position.set(0.09, 0.027, -0.015);
    group.add(coreL, coreR);

    // Subtle atmospheric eerie glow around uncollected tape
    const tapeGlow = this.makeGlow(0x7f9fe0, 0.42);
    tapeGlow.position.set(0, 0.12, 0);
    group.add(tapeGlow);

    return group;
  }

  // 2. Retro CRT TV and VCR Deck on Mobile Metal Hospital Cart
  createCrtTvWithVcr() {
    const group = new THREE.Group();
    group.name = 'vcr_tv_station';
    group.userData = { isInteractable: true, type: 'vcr_station' };

    // Metal rolling cart
    const cartMat = this.sharedMaterials.metalRusted;
    // 4 legs
    const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8);
    const legPositions = [
      [-0.45, 0.5, -0.3],
      [0.45, 0.5, -0.3],
      [-0.45, 0.5, 0.3],
      [0.45, 0.5, 0.3]
    ];
    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(legGeo, cartMat);
      leg.position.set(...pos);
      leg.castShadow = true;
      group.add(leg);

      // Caster wheel
      const wheelGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8);
      const wheel = new THREE.Mesh(wheelGeo, this.sharedMaterials.blackPlastic);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos[0], 0.04, pos[2]);
      group.add(wheel);
    });

    // Top and middle shelves
    const shelfGeo = new THREE.BoxGeometry(1.0, 0.03, 0.7);
    const topShelf = new THREE.Mesh(shelfGeo, cartMat);
    topShelf.position.set(0, 0.9, 0);
    topShelf.castShadow = true;
    topShelf.receiveShadow = true;
    group.add(topShelf);

    const midShelf = new THREE.Mesh(shelfGeo, cartMat);
    midShelf.position.set(0, 0.45, 0);
    midShelf.receiveShadow = true;
    group.add(midShelf);

    // CRT Television housing
    const tvBoxGeo = new THREE.BoxGeometry(0.75, 0.65, 0.6);
    const tvMat = new THREE.MeshStandardMaterial({ color: 0x242422, roughness: 0.6 });
    const tvBox = new THREE.Mesh(tvBoxGeo, tvMat);
    tvBox.position.set(0, 1.25, 0);
    tvBox.castShadow = true;
    group.add(tvBox);

    // Curved CRT Screen
    const screenGeo = new THREE.BoxGeometry(0.58, 0.44, 0.04);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x050e08,
      roughness: 0.1,
      metalness: 0.4,
      emissive: 0x0a1810,
      emissiveIntensity: 0.8
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 1.26, 0.3);
    group.add(screen);
    group.userData.screenMesh = screen;

    // TV Dials and speaker grill
    const knobGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12);
    const knobMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7 });
    const knob1 = new THREE.Mesh(knobGeo, knobMat);
    knob1.rotation.x = Math.PI / 2;
    knob1.position.set(0.32, 1.35, 0.3);
    const knob2 = knob1.clone();
    knob2.position.set(0.32, 1.25, 0.3);
    group.add(knob1, knob2);

    // VCR Deck (sitting under TV or on shelf)
    const vcrGeo = new THREE.BoxGeometry(0.65, 0.14, 0.45);
    const vcrMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.5, metalness: 0.3 });
    const vcr = new THREE.Mesh(vcrGeo, vcrMat);
    vcr.position.set(0, 0.98, 0.05);
    vcr.castShadow = true;
    group.add(vcr);

    // VHS Tape Slot Flap
    const slotGeo = new THREE.BoxGeometry(0.35, 0.05, 0.02);
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 });
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.set(-0.08, 0.98, 0.28);
    group.add(slot);

    // VCR glowing digital LED time display (e.g. 12:00 blinking)
    const vcrLedGeo = new THREE.PlaneGeometry(0.12, 0.04);
    const vcrLedMat = new THREE.MeshBasicMaterial({ color: 0x11ee88 });
    const vcrLed = new THREE.Mesh(vcrLedGeo, vcrLedMat);
    vcrLed.position.set(0.2, 0.98, 0.285);
    group.add(vcrLed);

    // Glowing green power indicator on TV
    const tvPwrGeo = new THREE.SphereGeometry(0.008, 8, 8);
    const tvPwrMat = new THREE.MeshBasicMaterial({ color: 0x33ff55 });
    const tvPwr = new THREE.Mesh(tvPwrGeo, tvPwrMat);
    tvPwr.position.set(0.32, 1.08, 0.31);
    group.add(tvPwr);

    // Faint TV light cast on surroundings
    const tvLight = new THREE.PointLight(0x33aa77, 0.8, 4.0);
    tvLight.position.set(0, 1.3, 0.5);
    group.add(tvLight);
    group.userData.tvLight = tvLight;

    return group;
  }

  // 3. Abandoned Hospital Gurney / Bed with Restraints
  createHospitalGurney() {
    const group = new THREE.Group();
    const frameMat = this.sharedMaterials.metalRusted;

    // Frame tubes
    const bedLength = 2.1;
    const bedWidth = 0.85;
    const bedHeight = 0.8;

    // 4 legs
    const legGeo = new THREE.CylinderGeometry(0.025, 0.025, bedHeight, 8);
    [
      [-bedWidth / 2 + 0.05, bedHeight / 2, -bedLength / 2 + 0.15],
      [bedWidth / 2 - 0.05, bedHeight / 2, -bedLength / 2 + 0.15],
      [-bedWidth / 2 + 0.05, bedHeight / 2, bedLength / 2 - 0.15],
      [bedWidth / 2 - 0.05, bedHeight / 2, bedLength / 2 - 0.15]
    ].forEach(p => {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(...p);
      leg.castShadow = true;
      group.add(leg);

      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), this.sharedMaterials.blackPlastic);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(p[0], 0.05, p[2]);
      group.add(wheel);
    });

    // Crossbars
    const barGeo = new THREE.CylinderGeometry(0.02, 0.02, bedLength - 0.3, 8);
    const barL = new THREE.Mesh(barGeo, frameMat);
    barL.rotation.x = Math.PI / 2;
    barL.position.set(-bedWidth / 2 + 0.05, 0.3, 0);
    const barR = barL.clone();
    barR.position.set(bedWidth / 2 - 0.05, 0.3, 0);
    group.add(barL, barR);

    // Mattress slab
    const mattressGeo = new THREE.BoxGeometry(bedWidth, 0.14, bedLength);
    const mattressMat = new THREE.MeshStandardMaterial({
      color: 0x3d3a33,
      roughness: 0.85,
      metalness: 0.05
    });
    const mattress = new THREE.Mesh(mattressGeo, mattressMat);
    mattress.position.set(0, bedHeight + 0.07, 0);
    mattress.castShadow = true;
    mattress.receiveShadow = true;
    group.add(mattress);

    // Weathered leather restraint straps
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x1f1712, roughness: 0.9 });
    const strapGeo = new THREE.BoxGeometry(bedWidth + 0.04, 0.02, 0.08);
    [-0.5, 0.0, 0.5].forEach(z => {
      const strap = new THREE.Mesh(strapGeo, strapMat);
      strap.position.set(0, bedHeight + 0.15, z);
      group.add(strap);
    });

    // Dark dried blood stains on mattress
    const stainGeo = new THREE.CircleGeometry(0.24, 12);
    const stainMat = new THREE.MeshStandardMaterial({
      map: textureGen.getBloodDecal(),
      transparent: true,
      opacity: 0.85
    });
    const stain = new THREE.Mesh(stainGeo, stainMat);
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(0.05, bedHeight + 0.145, -0.2);
    group.add(stain);

    return group;
  }

  // 4. Large Surgical Ceiling Lamp
  createSurgicalLamp() {
    const group = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x666b6e, roughness: 0.4, metalness: 0.8 });

    // Ceiling mount rod
    const rodGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 12);
    const rod = new THREE.Mesh(rodGeo, metalMat);
    rod.position.set(0, -0.45, 0);
    group.add(rod);

    // Articulated angled arm
    const armGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8);
    const arm = new THREE.Mesh(armGeo, metalMat);
    arm.rotation.z = Math.PI / 4;
    arm.position.set(0.2, -0.9, 0);
    group.add(arm);

    // Big concave reflector dome
    const domeGeo = new THREE.CylinderGeometry(0.55, 0.2, 0.25, 24, 1, true);
    const dome = new THREE.Mesh(domeGeo, metalMat);
    dome.position.set(0.4, -1.2, 0);
    group.add(dome);

    // Halogen bulb lens
    const bulbGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfffae0,
      emissive: 0xffe6a3,
      emissiveIntensity: 0.4
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0.4, -1.25, 0);
    group.add(bulb);

    // Flickering surgical spotlight
    const spot = new THREE.SpotLight(0xffeedd, 1.8, 8, Math.PI / 4, 0.5, 1.2);
    spot.position.set(0.4, -1.25, 0);
    spot.target.position.set(0.4, -4.0, 0);
    spot.castShadow = false;
    group.add(spot);
    group.add(spot.target);
    group.userData.spotLight = spot;

    return group;
  }

  // 5. Heavy Wall Safe with Keypad
  createWallSafe() {
    const group = new THREE.Group();
    group.name = 'vault_safe';
    group.userData = { isInteractable: true, type: 'wall_safe', isOpen: false };

    // Outer safe frame
    const outerGeo = new THREE.BoxGeometry(0.8, 0.8, 0.4);
    const outerMat = new THREE.MeshStandardMaterial({ color: 0x1f2224, roughness: 0.5, metalness: 0.7 });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.castShadow = true;
    group.add(outer);

    // Safe door pivot group
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-0.35, 0, 0.2);

    const doorGeo = new THREE.BoxGeometry(0.7, 0.7, 0.08);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2b3034, roughness: 0.4, metalness: 0.8 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0.35, 0, 0);
    door.castShadow = true;
    doorPivot.add(door);

    // Rotating dial handle
    const dialGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24);
    const dialMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
    const dial = new THREE.Mesh(dialGeo, dialMat);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0.35, 0.08, 0.05);
    doorPivot.add(dial);

    // Keypad plate
    const keypadGeo = new THREE.BoxGeometry(0.18, 0.22, 0.02);
    const keypadMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const keypad = new THREE.Mesh(keypadGeo, keypadMat);
    keypad.position.set(0.35, -0.15, 0.05);
    doorPivot.add(keypad);

    // Status LED (Red locked, Green unlocked)
    const ledGeo = new THREE.SphereGeometry(0.015, 8, 8);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0.35, -0.06, 0.065);
    doorPivot.add(led);
    group.userData.ledMesh = led;

    group.add(doorPivot);
    group.userData.doorPivot = doorPivot;

    // Interior cavity items (Tape 3 & Morgue Key inside)
    const interiorLight = this.makeGlow(0xffaa44, 0.5);
    interiorLight.position.set(0, 0, 0.1);
    interiorLight.visible = false;
    group.add(interiorLight);
    group.userData.interiorLight = interiorLight;

    return group;
  }

  // 6. Interactive Door with Frame and Handle
  createSecurityDoor(doorId, name, reqKey = null) {
    const group = new THREE.Group();
    group.name = `door_${doorId}`;
    group.userData = {
      isInteractable: true,
      type: 'door',
      doorId,
      name,
      reqKey,
      isOpen: false,
      angle: 0,
      targetAngle: 0
    };

    // Frame left, right, top
    const frameMat = this.sharedMaterials.metalRusted;
    const postGeo = new THREE.BoxGeometry(0.1, 2.5, 0.18);
    const postL = new THREE.Mesh(postGeo, frameMat);
    postL.position.set(-0.75, 1.25, 0);
    const postR = new THREE.Mesh(postGeo, frameMat);
    postR.position.set(0.75, 1.25, 0);
    const lintelGeo = new THREE.BoxGeometry(1.6, 0.12, 0.18);
    const lintel = new THREE.Mesh(lintelGeo, frameMat);
    lintel.position.set(0, 2.44, 0);
    group.add(postL, postR, lintel);

    // Sign plate above door
    const signGeo = new THREE.PlaneGeometry(0.9, 0.25);
    const signTex = textureGen.getDoorSign(name, reqKey ? `[LOCKED: KEY REQUIRED]` : 'AUTHORIZED ONLY');
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 });
    const signFront = new THREE.Mesh(signGeo, signMat);
    signFront.position.set(0, 2.65, 0.1);
    group.add(signFront);

    // Door leaf pivot group (hinged on the left post)
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-0.7, 0, 0);

    const leafGeo = new THREE.BoxGeometry(1.4, 2.38, 0.08);
    const leafMat = new THREE.MeshStandardMaterial({
      map: textureGen.getMetal(),
      roughness: 0.65,
      metalness: 0.4
    });
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(0.7, 1.2, 0);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    doorPivot.add(leaf);

    // Reinforced glass observation window
    const windowGeo = new THREE.BoxGeometry(0.35, 0.5, 0.1);
    const windowMesh = new THREE.Mesh(windowGeo, this.sharedMaterials.dirtyGlass);
    windowMesh.position.set(0.7, 1.65, 0);
    doorPivot.add(windowMesh);

    // Metal handle
    const handleGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xbba365, metalness: 0.9, roughness: 0.2 });
    const handleFront = new THREE.Mesh(handleGeo, handleMat);
    handleFront.rotation.z = Math.PI / 2;
    handleFront.position.set(1.25, 1.1, 0.06);
    doorPivot.add(handleFront);

    const handleBack = handleFront.clone();
    handleBack.position.set(1.25, 1.1, -0.06);
    doorPivot.add(handleBack);

    group.add(doorPivot);
    group.userData.doorPivot = doorPivot;

    return group;
  }

  // 7. Battery Item Prop
  createBatteryPack(batteryId = 1) {
    const group = new THREE.Group();
    group.name = `battery_${batteryId}`;
    group.userData = { isInteractable: true, type: 'battery', batteryId, powerRestore: 45 };

    // Heavy duty D-Cell cylinder
    const bodyGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xd98218,
      roughness: 0.35,
      metalness: 0.6
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    group.add(body);

    // Black band on base
    const bandGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.04, 16);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(0, -0.04, 0);
    group.add(band);

    // Copper top nub
    const topGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12);
    const topMat = new THREE.MeshStandardMaterial({ color: 0xd47537, metalness: 0.9, roughness: 0.2 });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.set(0, 0.07, 0);
    group.add(top);

    // Subtle yellow glow
    const glow = this.makeGlow(0xffb030, 0.22);
    glow.position.set(0, 0.08, 0);
    group.add(glow);

    return group;
  }

  // 8. Key / Keycard Item Prop
  createKeyItem(keyId, keyName, color = 0xd4af37) {
    const group = new THREE.Group();
    group.name = `key_${keyId}`;
    group.userData = { isInteractable: true, type: 'key', keyId, keyName };

    // Ornate antique iron / brass key
    const bowGeo = new THREE.TorusGeometry(0.04, 0.01, 8, 16);
    const keyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.3 });
    const bow = new THREE.Mesh(bowGeo, keyMat);
    bow.rotation.x = Math.PI / 2;
    group.add(bow);

    const stemGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.15, 8);
    const stem = new THREE.Mesh(stemGeo, keyMat);
    stem.position.set(0, 0, -0.09);
    stem.rotation.x = Math.PI / 2;
    group.add(stem);

    const bitGeo = new THREE.BoxGeometry(0.04, 0.01, 0.03);
    const bit = new THREE.Mesh(bitGeo, keyMat);
    bit.position.set(0.02, 0, -0.15);
    group.add(bit);

    const glow = this.makeGlow(0xffe27a, 0.2);
    glow.position.set(0, 0.05, 0);
    group.add(glow);

    return group;
  }

  // 9. Document / Case File Note Prop
  createDocumentNote(noteId, title, contentSnippet, safeDigitHint = null) {
    const group = new THREE.Group();
    group.name = `note_${noteId}`;
    group.userData = { isInteractable: true, type: 'note', noteId, title, contentSnippet, safeDigitHint };

    const pageGeo = new THREE.BoxGeometry(0.24, 0.005, 0.32);
    const pageMat = new THREE.MeshStandardMaterial({
      color: 0xded5c0,
      roughness: 0.9,
      metalness: 0.0
    });
    const page = new THREE.Mesh(pageGeo, pageMat);
    page.castShadow = true;
    group.add(page);

    // Red confidential stamp on paper
    const stampGeo = new THREE.PlaneGeometry(0.12, 0.04);
    const stampMat = new THREE.MeshBasicMaterial({ color: 0x991111 });
    const stamp = new THREE.Mesh(stampGeo, stampMat);
    stamp.rotation.x = -Math.PI / 2;
    stamp.rotation.z = 0.2;
    stamp.position.set(0.04, 0.003, -0.08);
    group.add(stamp);

    const glow = this.makeGlow(0xffe9b0, 0.18);
    glow.position.set(0, 0.06, 0);
    group.add(glow);

    return group;
  }

  // 10. Subject 407 - gaunt, rib-exposed, hinged-jaw, long-fingered.
  // Front faces local +z (EntityAI rotates the mesh so +z points along travel).
  createTheEntity() {
    const group = new THREE.Group();
    group.name = 'stalker_entity';
    group.userData = { isEntity: true, speed: 2.4, huntTimer: 0 };

    const skin = new THREE.MeshStandardMaterial({ color: 0x0c0d0d, roughness: 0.9, metalness: 0.05 });
    const bone = new THREE.MeshStandardMaterial({ color: 0x8e8577, roughness: 0.7, metalness: 0.0 });
    const gownMat = new THREE.MeshStandardMaterial({ color: 0x6b685c, roughness: 0.95, side: THREE.DoubleSide });
    const hollow = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe6ffff, toneMapped: false });

    // ---- Pelvis & legs (hip pivot -> thigh -> knee pivot -> shin -> foot)
    const pelvis = new THREE.Group();
    pelvis.position.set(0, 1.15, 0);
    group.add(pelvis);
    const pelvisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
    pelvisMesh.scale.set(1.25, 0.7, 0.85);
    pelvis.add(pelvisMesh);
    group.userData.pelvis = pelvis;

    const legPivots = {};
    const kneePivots = {};
    [-1, 1].forEach(side => {
      const hip = new THREE.Group();
      hip.position.set(0.12 * side, 0, 0);
      pelvis.add(hip);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.58, 7), skin);
      thigh.position.y = -0.29;
      thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.58;
      hip.add(knee);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.024, 0.57, 7), skin);
      shin.position.y = -0.285;
      shin.castShadow = true;
      knee.add(shin);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.24), skin);
      foot.position.set(0, -0.6, 0.07);
      knee.add(foot);

      if (side < 0) { legPivots.L = hip; kneePivots.L = knee; }
      else { legPivots.R = hip; kneePivots.R = knee; }
    });

    // ---- Tattered hospital gown strips hanging from the waist
    const gownStrips = [];
    for (let i = 0; i < 5; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.55), gownMat);
      const a = (i / 4 - 0.5) * 2.2;
      strip.position.set(Math.sin(a) * 0.17, -0.08, Math.cos(a) * 0.14);
      strip.rotation.y = a;
      strip.userData.phase = i * 1.3;
      pelvis.add(strip);
      gownStrips.push(strip);
    }
    group.userData.gownStrips = gownStrips;

    // ---- Spine: a leaning group so the whole upper body can hunch and lunge
    const spine = new THREE.Group();
    spine.position.set(0, 1.2, 0);
    group.add(spine);
    group.userData.spine = spine;

    // Ribcage (dark skin stretched over bone)
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), skin);
    chest.scale.set(0.92, 1.25, 0.58);
    chest.position.set(0, 0.5, 0);
    chest.castShadow = true;
    spine.add(chest);

    // Exposed rib arcs on the front of the chest
    [0.28, 0.4, 0.52, 0.64, 0.76].forEach((y, i) => {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.008, 0.011, 5, 14, Math.PI), bone);
      rib.rotation.x = Math.PI / 2;
      rib.position.set(0, y, 0.02);
      spine.add(rib);
    });

    // Vertebrae knuckling down the back (local -z)
    for (let i = 0; i < 7; i++) {
      const v = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), bone);
      v.position.set(0, 0.22 + i * 0.12, -0.15 - Math.sin(i * 0.6) * 0.02);
      spine.add(v);
    }

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 8), skin);
    neck.position.set(0, 1.0, 0.02);
    neck.rotation.x = 0.25;
    spine.add(neck);

    // ---- Head: elongated skull, jaw hinged at the back
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.12, 0.05);
    spine.add(headPivot);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), skin);
    skull.scale.set(0.8, 1.22, 1.0);
    headPivot.add(skull);

    const jawPivot = new THREE.Group();
    jawPivot.position.set(0, -0.06, -0.04);
    headPivot.add(jawPivot);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.06, 0.24), skin);
    jaw.position.set(0, -0.03, 0.1);
    jawPivot.add(jaw);

    // Dark mouth cavity between skull and jaw
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), hollow);
    mouth.scale.set(1.1, 0.5, 1.2);
    mouth.position.set(0, -0.04, 0.09);
    headPivot.add(mouth);

    // Hollow eye sockets with glowing eyes
    const eyeGlows = [];
    [-0.065, 0.065].forEach(x => {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), hollow);
      socket.position.set(x, 0.03, 0.125);
      headPivot.add(socket);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeMat);
      eye.position.set(x, 0.03, 0.14);
      headPivot.add(eye);

      const glow = this.makeGlow(0x9fe8ff, 0.2);
      glow.position.set(x, 0.03, 0.17);
      headPivot.add(glow);
      eyeGlows.push(glow);
    });
    group.userData.eyeGlows = eyeGlows;

    // Long, sparse hair hanging from the crown and falling past the shoulders
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const len = 0.36 + (i % 3) * 0.08;
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, len, 4), hollow);
      strand.position.set(Math.cos(a) * 0.12, 0.1 - len / 2, Math.sin(a) * 0.08 - 0.03);
      strand.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
      headPivot.add(strand);
    }

    // Eerie eye pointlight (the only point light the entity owns)
    const eyeLight = new THREE.PointLight(0x77ddff, 1.2, 3.5);
    eyeLight.position.set(0, 0.03, 0.22);
    headPivot.add(eyeLight);
    group.userData.eyeLight = eyeLight;

    // ---- Arms: shoulder -> elbow -> forearm -> four long fingers
    const armPivots = {};
    const elbowPivots = {};
    [-1, 1].forEach(side => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.24 * side, 0.82, 0);
      spine.add(shoulder);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.5, 7), skin);
      upper.position.y = -0.25;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.5;
      shoulder.add(elbow);

      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.5, 7), skin);
      fore.position.y = -0.25;
      elbow.add(fore);

      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.04), skin);
      palm.position.y = -0.55;
      elbow.add(palm);

      for (let f = 0; f < 4; f++) {
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.16, 0.014), skin);
        finger.position.set(-0.021 + f * 0.014, -0.66, 0.0);
        finger.rotation.x = 0.5;
        elbow.add(finger);
      }

      if (side < 0) { armPivots.L = shoulder; elbowPivots.L = elbow; }
      else { armPivots.R = shoulder; elbowPivots.R = elbow; }
    });

    // ---- Mist: soft additive particles swirling at its base
    const particleCount = 40;
    const pGeo = new THREE.BufferGeometry();
    const pPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 1.3;
      pPositions[i * 3 + 1] = Math.random() * 2.4;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 1.3;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x2a2f33,
      size: 0.45,
      map: textureGen.getSoftParticle(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true
    });
    const particles = new THREE.Points(pGeo, pMat);
    group.add(particles);

    // Hooks used by EntityAI for animation (names kept stable for compatibility)
    group.userData.headPivot = headPivot;
    group.userData.jawPivot = jawPivot;
    group.userData.armLPivot = armPivots.L;
    group.userData.armRPivot = armPivots.R;
    group.userData.elbowLPivot = elbowPivots.L;
    group.userData.elbowRPivot = elbowPivots.R;
    group.userData.legLPivot = legPivots.L;
    group.userData.legRPivot = legPivots.R;
    group.userData.kneeLPivot = kneePivots.L;
    group.userData.kneeRPivot = kneePivots.R;
    group.userData.particles = particles;

    // Spine and head meshes are only ever animated through their parent pivots
    mergeChildMeshes(group.userData.spine);
    mergeChildMeshes(group.userData.headPivot);

    return group;
  }
}

export const modelFactory = new ModelFactory();
