import * as THREE from 'three';
import { World } from './world.js';
import { modelFactory } from './models.js';

// The quick run: two rooms joined by one doorway. Reception (north) holds the rifle, the fuse and
// two infected staff. The morgue (south) holds the generator and the fire exit, and Shadow 47.
// It extends World so every system that reads world.colliders, interactables and lights works unchanged.
// The parent constructor calls these build steps, so overriding them here replaces the sanatorium.
export class QuickWorld extends World {
  buildSanatorium() {
    const m = this.mats;
    const H = 3.2;
    const y = H / 2;
    // Outer walls (reception z 2..14, morgue z -12..2, x -6..6)
    this.createWall(0, y, 14.15, 12.6, H, 0.3, m.wall);
    this.createWall(0, y, -12.15, 12.6, H, 0.3, m.wall);
    this.createWall(-6.15, y, 1, 0.3, H, 26.6, m.wall);
    this.createWall(6.15, y, 1, 0.3, H, 26.6, m.wall);
    // Dividing wall with a 2.4m doorway at x -1.2..1.2
    this.createWall(-3.6, y, 2, 4.8, H, 0.3, m.wall);
    this.createWall(3.6, y, 2, 4.8, H, 0.3, m.wall);
  }

  buildGrounds() {}

  buildDetail() {}

  buildPropsAndPuzzles() {
    const m = this.mats;
    this.addFloor(12, 12, 0, 8, m.tile);
    this.addFloor(12, 14, 0, -5, m.concrete);

    // Reception desk
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.7 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.8), deskMat);
    desk.position.set(3.6, 0.5, 11);
    desk.castShadow = true;
    this.scene.add(desk);
    this.addCollider(3.6, 0.5, 11, 2.2, 1.0, 0.8);

    // Morgue tables (cover)
    for (const [x, z] of [[-3.5, -4], [3.5, -5.5]]) {
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.0), m.steel);
      table.position.set(x, 0.45, z);
      table.castShadow = true;
      this.scene.add(table);
      this.addCollider(x, 0.45, z, 2.0, 0.9, 1.0);
    }

    // Generator with a status LED. Restoring power turns the LED green.
    const genMat = new THREE.MeshStandardMaterial({ color: 0x33302b, roughness: 0.6, metalness: 0.5 });
    const gen = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.5), genMat);
    gen.position.set(-4.8, 0.9, -9.5);
    gen.castShadow = true;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    led.position.set(-4.8, 1.6, -9.22);
    const genGroup = new THREE.Group();
    genGroup.add(gen, led);
    genGroup.userData = { isInteractable: true, type: 'generator', hasFuse: false, isPowered: false, led };
    this.scene.add(genGroup);
    this.interactables.push(genGroup);
    this.addCollider(-4.8, 0.9, -9.5, 1.0, 1.8, 0.5);

    // Fire exit in the south wall. It opens only after power is restored and Shadow 47 is stopped.
    const exitMat = new THREE.MeshStandardMaterial({ color: 0x2f4a33, roughness: 0.5, metalness: 0.3 });
    const exit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.15), exitMat);
    exit.position.set(0, 1.15, -11.8);
    exit.castShadow = true;
    const exitGroup = new THREE.Group();
    exitGroup.add(exit);
    exitGroup.userData = {
      isInteractable: true, type: 'door', name: 'Emergency Fire Exit',
      reqKey: 'all_tapes_and_power', isOpen: false, targetAngle: 0
    };
    this.scene.add(exitGroup);
    this.interactables.push(exitGroup);
    const glow = modelFactory.makeGlow(0x66ff88, 0.7);
    glow.position.set(0, 2.5, -11.5);
    this.scene.add(glow);
  }

  setupAtmosphere() {
    this.scene.add(new THREE.AmbientLight(0x405565, 1.2));
    const reception = new THREE.PointLight(0xffcc88, 2.0, 12);
    reception.position.set(0, 2.8, 9);
    this.scene.add(reception);
    this.addFlicker(reception);
    const morgue = new THREE.PointLight(0x77bbff, 2.0, 12);
    morgue.position.set(-3, 2.8, -6);
    this.scene.add(morgue);
    this.addFlicker(morgue);
    const red = new THREE.PointLight(0xff4444, 1.6, 10);
    red.position.set(3, 2.8, -9);
    this.scene.add(red);
    this.addFlicker(red);
  }
}
