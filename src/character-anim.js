import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Mixamo humanoid clips. idle.fbx also carries the skinned character mesh.
const SOURCES = {
  idle: 'animations/idle.fbx',
  walk: 'animations/walking.fbx',
  run: 'animations/running.fbx'
};
const HEIGHT = 1.75;      // metres, matching the procedural investigator
const FADE = 0.25;        // seconds of cross-fade between states

// Plays Mixamo clips on a skinned character. If the clips do not match the model's bones,
// load() resolves false and the game keeps its procedural investigator.
export class CharacterAnimator {
  constructor() {
    this.ready = false;
    this.root = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
  }

  async load() {
    try {
      const loader = new FBXLoader();
      const [idle, walk, run] = await Promise.all(Object.values(SOURCES).map(p => loader.loadAsync(p)));
      const root = idle;

      // Check that the clips drive bones that exist in this model
      const names = new Set();
      root.traverse(o => names.add(o.name));
      const clips = { idle: idle.animations[0], walk: walk.animations[0], run: run.animations[0] };
      for (const clip of Object.values(clips)) {
        if (!clip) return false;
        const tracks = clip.tracks.map(t => t.name.split('.')[0]);
        const matched = tracks.filter(n => names.has(n)).length;
        if (matched < tracks.length * 0.9) {
          console.warn('Character clips do not match the model bones; keeping the procedural investigator.');
          return false;
        }
      }

      // Scale to the game's height, stand on the floor and face the game's forward direction (-z)
      root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      root.scale.setScalar(1);
      let box = new THREE.Box3().setFromObject(root);
      const height = box.max.y - box.min.y;
      root.scale.setScalar(HEIGHT / height);
      root.rotation.y = Math.PI;
      box = new THREE.Box3().setFromObject(root);
      root.position.y -= box.min.y;

      this.root = root;
      this.mixer = new THREE.AnimationMixer(root);
      for (const [key, clip] of Object.entries(clips)) {
        this.actions[key] = this.mixer.clipAction(clip);
        this.actions[key].setLoop(THREE.LoopRepeat);
      }
      this.play('idle');
      this.ready = true;
      return true;
    } catch (err) {
      console.warn('Character animation unavailable:', err);
      return false;
    }
  }

  play(name) {
    if (!this.ready || name === this.current) return;
    const next = this.actions[name];
    const prev = this.actions[this.current];
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, FADE, false);
    this.current = name;
  }

  update(delta) {
    if (this.ready) this.mixer.update(delta);
  }
}
