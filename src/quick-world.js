import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { World } from './world.js';
import { modelFactory } from './models.js';
import { CORRIDOR_BOXES } from './corridor-data.js';

// The quick run now plays inside the horror corridor model. Two areas matter:
//  - the north end and central hall, where the run starts and the rifle waits
//  - the west bedroom (the bed model), with the generator and fire exit at the south end
// Walls come from CORRIDOR_BOXES (generated from the model), so the player collides with what they see.
// It extends World so every system that reads world.colliders, interactables and lights works unchanged.
// The parent constructor calls these build steps, so overriding them here replaces the sanatorium.

// The model's floor sits at y = 2.52; shifting it down puts the floor at y = 0
const CORRIDOR_FLOOR_Y = 2.52;
export const BED_SPOT = { x: -14.2, z: 1.8 };

const loader = new GLTFLoader();
const cache = {};
// Loaded once, cloned per run, so restarting the quick run never downloads the models again
function loadModel(url) {
  if (!cache[url]) {
    cache[url] = new Promise((resolve, reject) => {
      loader.load(url, gltf => resolve(gltf.scene), undefined, reject);
    });
  }
  return cache[url];
}

// Start fetching as soon as this file loads, so the models are usually ready before Play is pressed
export function preloadQuickModels() {
  loadModel('models/corridor.glb').catch(() => {});
  loadModel('models/bed.glb').catch(() => {});
}

export class QuickWorld extends World {
  buildSanatorium() {
    // Invisible walls that match the model
    for (const [x0, z0, x1, z1] of CORRIDOR_BOXES) {
      this.colliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 4.2, z1)));
    }
    this.ceilingHeight = 4.1;

    // Corridor model
    loadModel('models/corridor.glb').then(src => {
      const corridor = src.clone(true);
      corridor.position.y = -CORRIDOR_FLOOR_Y;
      corridor.traverse(o => {
        if (o.isMesh && o.material) {
          o.material = o.material.clone();
          o.material.side = THREE.DoubleSide;
        }
      });
      this.scene.add(corridor);
    }).catch(err => console.warn('Corridor model failed to load', err));

    // Bed in the west bedroom. The model ships with its own floor square, which is dropped.
    loadModel('models/bed.glb').then(src => {
      const bed = src.clone(true);
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
    const m = this.mats;

    // Generator against the south end, with a status LED. Restoring power turns the LED green.
    const genMat = new THREE.MeshStandardMaterial({ color: 0x33302b, roughness: 0.6, metalness: 0.5 });
    const gen = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.5), genMat);
    gen.position.set(-5.4, 0.9, 7.9);
    gen.castShadow = true;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    led.position.set(-5.4, 1.6, 7.62);
    const genGroup = new THREE.Group();
    genGroup.add(gen, led);
    genGroup.userData = { isInteractable: true, type: 'generator', hasFuse: false, isPowered: false, led };
    this.scene.add(genGroup);
    this.interactables.push(genGroup);
    this.addCollider(-5.4, 0.9, 7.9, 1.0, 1.8, 0.5);

    // Fire exit in the south wall. It opens only after power is restored and Shadow 47 is stopped.
    const exitMat = new THREE.MeshStandardMaterial({ color: 0x2f4a33, roughness: 0.5, metalness: 0.3 });
    const exit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.15), exitMat);
    exit.position.set(-3.7, 1.15, 8.3);
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
    glow.position.set(-3.7, 2.5, 7.9);
    this.scene.add(glow);
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
}
