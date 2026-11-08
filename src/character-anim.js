import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const loader = new FBXLoader();

// Loads a Mixamo-rigged character. The mesh comes from `mesh`; each named clip comes from its own file.
// Throws if a clip does not drive bones that exist in the mesh, so callers can keep a fallback model.
export async function loadRiggedCharacter({ mesh, clips, height, rotationY = 0, slimX = 1 }) {
  const model = await loader.loadAsync(mesh);
  const bones = new Set();
  model.traverse(o => bones.add(o.name));

  const clipMap = {};
  for (const [name, file] of Object.entries(clips)) {
    const src = file === mesh ? model : await loader.loadAsync(file);
    const clip = src.animations[0];
    if (!clip) throw new Error(`No animation found in ${file}`);
    const names = clip.tracks.map(t => t.name.split('.')[0]);
    const matched = names.filter(n => bones.has(n)).length;
    if (matched < names.length * 0.9) throw new Error(`Bones in ${file} do not match ${mesh}`);
    clip.name = name;
    clipMap[name] = clip;
  }

  // Fit to the requested height, face the game's forward direction (-z for the player, +z for the entity), stand on the floor
  model.scale.setScalar(1);
  model.rotation.y = rotationY;
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const s = height / (box.max.y - box.min.y);
  model.scale.set(s * slimX, s, s);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;

  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root: model, clips: clipMap };
}

// Plays named clips on one rigged character, cross-fading between them.
export class RigPlayer {
  constructor(root, clips) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [name, clip] of Object.entries(clips)) this.actions[name] = this.mixer.clipAction(clip);
    this.current = null;
    this.next = null;
    // A one-shot clip that finishes hands over to the clip queued after it
    this.mixer.addEventListener('finished', e => {
      if (e.action !== this.actions[this.current] || !this.next) return;
      const n = this.next;
      this.next = null;
      this.play(n.name);
    });
  }

  // once: play one time, hold the last pose, then play `then`
  play(name, { fade = 0.25, timeScale = 1, once = false, then = null } = {}) {
    const action = this.actions[name];
    if (!action) return;
    if (name === this.current) {
      action.timeScale = timeScale;
      return;
    }
    const prev = this.actions[this.current];
    action.reset();
    action.timeScale = timeScale;
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.enabled = true;
    action.play();
    if (prev) action.crossFadeFrom(prev, fade, false);
    this.current = name;
    this.next = then ? { name: then } : null;
  }

  update(delta) {
    this.mixer.update(delta);
  }
}
